import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow 5 minutes execution time for large video uploads in Next.js Serverless/API

export async function POST(request: Request) {
  console.log(`[UPLOAD INCOMING] Received upload request...`);
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folderPath = (formData.get("folderPath") as string) || "";

    if (!file) {
      console.warn(`[UPLOAD REJECTED] Request received without file payload.`);
      return NextResponse.json({ error: "Keine Datei ausgewählt" }, { status: 400 });
    }

    const cleanFolder = folderPath ? (folderPath.endsWith("/") ? folderPath : `${folderPath}/`) : "";
    const cleanFolderNoLeading = cleanFolder.startsWith("/") ? cleanFolder.slice(1) : cleanFolder;
    const key = `${cleanFolderNoLeading}${file.name}`;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

    console.log(`[UPLOAD STARTING] File: "${key}" (${sizeMb} MB) | Type: ${file.type || 'unknown'}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Calculate MD5 hash for ETag tracking
    const crypto = await import("crypto");
    const etag = crypto.createHash("md5").update(buffer).digest("hex");

    // Upload to Cloudflare R2 with Cache-Control header for Edge CDN caching
    const putCmd = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    });
    await s3Client.send(putCmd);

    const now = Date.now();
    const fileId = `f_${Math.random().toString(36).substring(2)}`;

    // Insert or replace into SQLite DB
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      await db.run(
        `INSERT OR REPLACE INTO files (id, path, filename, size, etag, mime_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fileId, key, file.name, file.size, etag, file.type || "application/octet-stream", now]
      );
      await db.run("DELETE FROM deleted_files WHERE path = ?", [key]);
    } catch (dbErr) {
      console.warn("Upload API: SQLite insert failed:", dbErr);
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`[UPLOAD SUCCESS] ${key} (${sizeMb} MB) -> R2 Bucket (${r2BucketName})`);

    return NextResponse.json({ success: true, path: key, filename: file.name });
  } catch (err: any) {
    console.error("Upload API error:", err);
    return NextResponse.json({ error: "Upload fehlgeschlagen: " + (err?.message || String(err)) }, { status: 500 });
  }
}
