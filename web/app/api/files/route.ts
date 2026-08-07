import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function GET() {
  let files: any[] = [];

  // 1. Try reading from local SQLite database
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    files = await db.all("SELECT * FROM files ORDER BY updated_at DESC");
  } catch (dbErr) {
    console.warn("Files API: SQLite lookup failed, falling back to R2 directly:", dbErr);
  }

  // 2. If SQLite DB has no files or DB lookup failed, list files directly from Cloudflare R2
  if (files.length === 0) {
    try {
      const command = new ListObjectsV2Command({ Bucket: r2BucketName });
      const res = await s3Client.send(command);

      if (res.Contents) {
        const now = Date.now();
        files = res.Contents
          .filter((item) => item.Key && !item.Key.startsWith(".shares/"))
          .map((item) => ({
            id: `f_${Math.random().toString(36).substring(2)}`,
            path: item.Key,
            filename: item.Key!.split("/").pop() || item.Key,
            size: item.Size || 0,
            etag: item.ETag || "",
            updated_at: item.LastModified ? new Date(item.LastModified).getTime() : now,
          }));
      }
    } catch (r2Err) {
      console.error("Files API: R2 direct list failed:", r2Err);
    }
  }

  const formattedFiles = files.map((f: any) => ({
    id: f.id || `f_${Math.random().toString(36).substring(2)}`,
    path: f.path || f.Key || "",
    filename: f.filename || (f.path ? f.path.split("/").pop() : "file"),
    size: f.size || f.Size || 0,
    mimeType: f.mime_type || "application/octet-stream",
    updatedAt: f.updated_at || Date.now(),
  }));

  return NextResponse.json({ files: formattedFiles });
}
