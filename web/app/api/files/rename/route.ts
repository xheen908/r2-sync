import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { oldPath, newFilename } = await request.json();

    if (!oldPath || !newFilename) {
      return NextResponse.json({ error: "oldPath and newFilename parameters are required" }, { status: 400 });
    }

    const folderParts = oldPath.split("/");
    folderParts.pop(); // Remove old filename
    const folderPrefix = folderParts.length > 0 ? folderParts.join("/") + "/" : "";
    const newPath = `${folderPrefix}${newFilename}`;

    if (oldPath === newPath) {
      return NextResponse.json({ success: true, newPath });
    }

    // 1. Copy object in R2 to new path
    const copyCmd = new CopyObjectCommand({
      Bucket: r2BucketName,
      CopySource: `${r2BucketName}/${encodeURIComponent(oldPath)}`,
      Key: newPath,
    });
    await s3Client.send(copyCmd);

    // 2. Delete old object from R2
    const deleteCmd = new DeleteObjectCommand({
      Bucket: r2BucketName,
      Key: oldPath,
    });
    await s3Client.send(deleteCmd);

    // 3. Update paths in SQLite DB
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      await db.run("UPDATE files SET path = ?, filename = ? WHERE path = ?", [newPath, newFilename, oldPath]);
      await db.run("UPDATE share_links SET file_path = ?, filename = ? WHERE file_path = ?", [newPath, newFilename, oldPath]);
    } catch (dbErr) {
      console.warn("Rename API: SQLite update failed:", dbErr);
    }

    return NextResponse.json({ success: true, oldPath, newPath, newFilename });
  } catch (err: any) {
    console.error("Rename API error:", err);
    return NextResponse.json({ error: "Umbenennen fehlgeschlagen: " + (err?.message || String(err)) }, { status: 500 });
  }
}
