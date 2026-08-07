import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folderPath = (formData.get("folderPath") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Keine Datei ausgewählt" }, { status: 400 });
    }

    const cleanFolder = folderPath ? (folderPath.endsWith("/") ? folderPath : `${folderPath}/`) : "";
    const cleanFolderNoLeading = cleanFolder.startsWith("/") ? cleanFolder.slice(1) : cleanFolder;
    const key = `${cleanFolderNoLeading}${file.name}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Cloudflare R2
    const putCmd = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    });
    await s3Client.send(putCmd);

    const now = Date.now();
    const fileId = `f_${Math.random().toString(36).substring(2)}`;

    // Insert into SQLite DB
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      await db.run(
        `INSERT OR REPLACE INTO files (id, path, filename, size, mime_type, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [fileId, key, file.name, file.size, file.type || "application/octet-stream", now]
      );
    } catch (dbErr) {
      console.warn("Upload API: SQLite insert failed:", dbErr);
    }

    return NextResponse.json({ success: true, path: key, filename: file.name });
  } catch (err: any) {
    console.error("Upload API error:", err);
    return NextResponse.json({ error: "Upload fehlgeschlagen: " + (err?.message || String(err)) }, { status: 500 });
  }
}
