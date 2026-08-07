import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { sourcePath, targetFolderPath } = await request.json();

    if (!sourcePath) {
      return NextResponse.json({ error: "sourcePath parameter is required" }, { status: 400 });
    }

    const filename = sourcePath.split("/").pop();
    const cleanFolder = targetFolderPath ? (targetFolderPath.endsWith("/") ? targetFolderPath : `${targetFolderPath}/`) : "";
    const cleanFolderNoLeading = cleanFolder.startsWith("/") ? cleanFolder.slice(1) : cleanFolder;
    const newPath = `${cleanFolderNoLeading}${filename}`;

    if (sourcePath === newPath) {
      return NextResponse.json({ success: true, newPath });
    }

    // 1. Copy object in R2 to new path
    const copyCmd = new CopyObjectCommand({
      Bucket: r2BucketName,
      CopySource: `${r2BucketName}/${encodeURIComponent(sourcePath)}`,
      Key: newPath,
    });
    await s3Client.send(copyCmd);

    // 2. Delete original object from R2
    const deleteCmd = new DeleteObjectCommand({
      Bucket: r2BucketName,
      Key: sourcePath,
    });
    await s3Client.send(deleteCmd);

    // 3. Update paths in SQLite DB
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      await db.run("UPDATE files SET path = ? WHERE path = ?", [newPath, sourcePath]);
      await db.run("UPDATE share_links SET file_path = ? WHERE file_path = ?", [newPath, sourcePath]);
    } catch (dbErr) {
      console.warn("Move API: SQLite update failed:", dbErr);
    }

    return NextResponse.json({ success: true, oldPath: sourcePath, newPath });
  } catch (err: any) {
    console.error("Move API error:", err);
    return NextResponse.json({ error: "Verschieben fehlgeschlagen: " + (err?.message || String(err)) }, { status: 500 });
  }
}
