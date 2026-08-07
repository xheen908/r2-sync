import { NextResponse } from "next/server";
import { getS3Client } from "@/lib/r2";
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let files: any[] = [];
  let activeCounts: Record<string, number> = {};

  const url = new URL(request.url);
  const forceSync = url.searchParams.get("forceSync") === "true";

  // 1. If forceSync is explicitly requested, perform a full reconciliation scan against Cloudflare R2
  if (forceSync) {
    let r2FilesMap = new Map<string, { size: number; etag: string; updatedAt: number }>();
    try {
      const { s3Client, bucketName } = await getS3Client();
      const command = new ListObjectsV2Command({ Bucket: bucketName });
      const res = await s3Client.send(command);

      if (res.Contents) {
        for (const item of res.Contents) {
          if (item.Key && !item.Key.startsWith(".shares/")) {
            r2FilesMap.set(item.Key, {
              size: item.Size || 0,
              etag: item.ETag ? item.ETag.replace(/"/g, "") : "",
              updatedAt: item.LastModified ? new Date(item.LastModified).getTime() : Date.now(),
            });
          }
        }
      }

      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      const dbFiles = await db.all("SELECT * FROM files");
      const dbPathSet = new Set<string>();

      for (const f of dbFiles) {
        if (r2FilesMap.has(f.path)) {
          dbPathSet.add(f.path);
        } else {
          await db.run("DELETE FROM files WHERE path = ?", [f.path]);
          await db.run("DELETE FROM share_links WHERE file_path = ?", [f.path]);
        }
      }

      for (const [key, meta] of r2FilesMap.entries()) {
        if (!dbPathSet.has(key)) {
          const fileId = `f_${Math.random().toString(36).substring(2)}`;
          const filename = key.split("/").pop() || key;
          await db.run(
            "INSERT OR REPLACE INTO files (id, path, filename, size, etag, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            [fileId, key, filename, meta.size, meta.etag, meta.updatedAt]
          );
        }
      }
    } catch (r2Err) {
      console.warn("Files API: Force R2 sync failed:", r2Err);
    }
  }

  // 2. Fetch directly from SQLite DB (Source of Truth - Zero Class-A calls)
  let deletedFiles: string[] = [];
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();

    files = await db.all("SELECT * FROM files ORDER BY updated_at DESC");

    // Auto-populate DB from R2 on initial load if SQLite DB is empty
    if (files.length === 0 && !forceSync) {
      try {
        const { s3Client, bucketName } = await getS3Client();
        const command = new ListObjectsV2Command({ Bucket: bucketName });
        const res = await s3Client.send(command);

        if (res.Contents) {
          for (const item of res.Contents) {
            if (item.Key && !item.Key.startsWith(".shares/")) {
              const fileId = `f_${Math.random().toString(36).substring(2)}`;
              const filename = item.Key.split("/").pop() || item.Key;
              const etag = item.ETag ? item.ETag.replace(/"/g, "") : "";
              const size = item.Size || 0;
              const updatedAt = item.LastModified ? new Date(item.LastModified).getTime() : Date.now();

              await db.run(
                "INSERT OR REPLACE INTO files (id, path, filename, size, etag, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                [fileId, item.Key, filename, size, etag, updatedAt]
              );
            }
          }
          files = await db.all("SELECT * FROM files ORDER BY updated_at DESC");
        }
      } catch (autoSyncErr) {
        console.warn("Files API: Initial auto-sync from R2 failed:", autoSyncErr);
      }
    }

    const deletedRows = await db.all("SELECT path FROM deleted_files");
    deletedFiles = deletedRows.map((r: any) => r.path);

    const now = Date.now();
    const counts = await db.all(
      "SELECT file_path, COUNT(*) as count FROM share_links WHERE expires_at IS NULL OR expires_at > ? GROUP BY file_path",
      [now]
    );
    for (const row of counts) {
      activeCounts[row.file_path] = row.count;
    }
  } catch (dbErr) {
    console.error("Files API: SQLite query failed:", dbErr);
  }

  const formattedFiles = files.map((f: any) => {
    const path = f.path || f.Key || "";
    return {
      id: f.id || `f_${Math.random().toString(36).substring(2)}`,
      path,
      filename: f.filename || (path ? path.split("/").pop() : "file"),
      size: f.size || f.Size || 0,
      etag: f.etag || "",
      mimeType: f.mime_type || "application/octet-stream",
      updatedAt: f.updated_at || Date.now(),
      activeSharesCount: activeCounts[path] || 0,
    };
  });

  return NextResponse.json({ files: formattedFiles, deletedFiles });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("filePath");

  if (!filePath) {
    return NextResponse.json({ error: "filePath parameter is required" }, { status: 400 });
  }

  const prefix = filePath.endsWith("/") ? filePath : `${filePath}/`;

  // 1. Delete object(s) from Cloudflare R2
  try {
    const { s3Client, bucketName } = await getS3Client();

    // Delete exact object
    const deleteCmd = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: filePath,
    });
    await s3Client.send(deleteCmd);

    // Delete prefix folder objects if any
    const listCmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });
    const res = await s3Client.send(listCmd);
    if (res.Contents) {
      for (const item of res.Contents) {
        if (item.Key) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: item.Key }));
        }
      }
    }
  } catch (r2Err) {
    console.warn("File delete API: R2 delete failed:", r2Err);
  }

  // 2. Delete file record & associated share links from SQLite DB, and record in deleted_files table
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    const now = Date.now();
    await db.run("DELETE FROM files WHERE path = ? OR path LIKE ?", [filePath, `${prefix}%`]);
    await db.run("DELETE FROM share_links WHERE file_path = ? OR file_path LIKE ?", [filePath, `${prefix}%`]);
    await db.run("INSERT OR REPLACE INTO deleted_files (path, deleted_at) VALUES (?, ?)", [filePath, now]);
  } catch (dbErr) {
    console.warn("File delete API: SQLite record delete failed:", dbErr);
  }

  return NextResponse.json({ success: true, filePath });
}
