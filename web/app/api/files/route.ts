import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { s3Client, r2BucketName } from "@/lib/r2";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    let files = await db.all("SELECT * FROM files ORDER BY updated_at DESC");

    if (files.length === 0) {
      try {
        const command = new ListObjectsV2Command({ Bucket: r2BucketName });
        const res = await s3Client.send(command);

        if (res.Contents) {
          const now = Date.now();
          for (const item of res.Contents) {
            if (item.Key && !item.Key.startsWith(".shares/")) {
              const filename = item.Key.split("/").pop() || item.Key;
              await db.run(
                `INSERT OR REPLACE INTO files (id, path, filename, size, etag, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  `f_${Math.random().toString(36).substring(2)}`,
                  item.Key,
                  filename,
                  item.Size || 0,
                  item.ETag || "",
                  item.LastModified ? new Date(item.LastModified).getTime() : now,
                ]
              );
            }
          }
          files = await db.all("SELECT * FROM files ORDER BY updated_at DESC");
        }
      } catch (r2Err) {
        console.warn("Could not list R2 objects directly", r2Err);
      }
    }

    const formattedFiles = files.map((f: any) => ({
      id: f.id,
      path: f.path,
      filename: f.filename,
      size: f.size,
      mimeType: f.mime_type || "application/octet-stream",
      updatedAt: f.updated_at,
    }));

    return NextResponse.json({ files: formattedFiles });
  } catch (err) {
    return NextResponse.json({ error: "Fehler beim Laden der Dateien" }, { status: 500 });
  }
}
