import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { oldPath, newFilename, isFolder } = await request.json();

    if (!oldPath || !newFilename) {
      return NextResponse.json({ error: "oldPath and newFilename parameters are required" }, { status: 400 });
    }

    // ----------------------------------------------------
    // CASE A: Rename Folder
    // ----------------------------------------------------
    if (isFolder) {
      const cleanSourceFolder = oldPath.endsWith("/") ? oldPath.slice(0, -1) : oldPath;
      const parentPrefix = cleanSourceFolder.includes("/") ? cleanSourceFolder.slice(0, cleanSourceFolder.lastIndexOf("/") + 1) : "";
      const newFolderPath = `${parentPrefix}${newFilename.trim()}`;

      if (cleanSourceFolder === newFolderPath) {
        return NextResponse.json({ success: true, newFolderPath });
      }

      const sourcePrefix = `${cleanSourceFolder}/`;
      const listCmd = new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: sourcePrefix,
      });
      const listRes = await s3Client.send(listCmd);
      const objects = listRes.Contents || [];

      for (const obj of objects) {
        if (!obj.Key) continue;
        const oldKey = obj.Key;
        const relativeSubpath = oldKey.slice(sourcePrefix.length);
        const newKey = `${newFolderPath}/${relativeSubpath}`;

        await s3Client.send(new CopyObjectCommand({
          Bucket: r2BucketName,
          CopySource: `${r2BucketName}/${encodeURIComponent(oldKey)}`,
          Key: newKey,
        }));
        await s3Client.send(new DeleteObjectCommand({
          Bucket: r2BucketName,
          Key: oldKey,
        }));

        try {
          const { getDb } = await import("@/lib/db");
          const db = await getDb();
          if (db) {
            await db.run("UPDATE files SET path = ? WHERE path = ?", [newKey, oldKey]);
            await db.run("UPDATE share_links SET file_path = ? WHERE file_path = ?", [newKey, oldKey]);
          }
        } catch (dbErr) {}
      }

      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        if (db) {
          const rows = await db.all("SELECT id, path FROM files WHERE path LIKE ?", [`${sourcePrefix}%`]);
          for (const row of rows) {
            const sub = row.path.slice(sourcePrefix.length);
            const updatedPath = `${newFolderPath}/${sub}`;
            await db.run("UPDATE files SET path = ? WHERE id = ?", [updatedPath, row.id]);
            await db.run("UPDATE share_links SET file_path = ? WHERE file_path = ?", [updatedPath, row.path]);
          }
        }
      } catch (err) {}

      return NextResponse.json({ success: true, oldPath: cleanSourceFolder, newPath: newFolderPath, newFilename: newFilename.trim() });
    }

    // ----------------------------------------------------
    // CASE B: Rename Single File
    // ----------------------------------------------------
    const folderParts = oldPath.split("/");
    folderParts.pop();
    const folderPrefix = folderParts.length > 0 ? folderParts.join("/") + "/" : "";
    const newPath = `${folderPrefix}${newFilename.trim()}`;

    if (oldPath === newPath) {
      return NextResponse.json({ success: true, newPath });
    }

    await s3Client.send(new CopyObjectCommand({
      Bucket: r2BucketName,
      CopySource: `${r2BucketName}/${encodeURIComponent(oldPath)}`,
      Key: newPath,
    }));
    await s3Client.send(new DeleteObjectCommand({
      Bucket: r2BucketName,
      Key: oldPath,
    }));

    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      if (db) {
        await db.run("UPDATE files SET path = ?, filename = ? WHERE path = ?", [newPath, newFilename.trim(), oldPath]);
        await db.run("UPDATE share_links SET file_path = ?, filename = ? WHERE file_path = ?", [newPath, newFilename.trim(), oldPath]);
      }
    } catch (dbErr) {
      console.warn("Rename API: SQLite update failed:", dbErr);
    }

    return NextResponse.json({ success: true, oldPath, newPath, newFilename: newFilename.trim() });
  } catch (err: any) {
    console.error("Rename API error:", err);
    return NextResponse.json({ error: "Umbenennen fehlgeschlagen: " + (err?.message || String(err)) }, { status: 500 });
  }
}
