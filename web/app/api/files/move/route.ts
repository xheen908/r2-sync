import { NextResponse } from "next";
import { s3Client, r2BucketName } from "@/lib/r2";
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { sourcePath, sourceFolderPath, targetFolderPath } = await request.json();

    if (!sourcePath && !sourceFolderPath) {
      return NextResponse.json({ error: "sourcePath or sourceFolderPath parameter is required" }, { status: 400 });
    }

    const { getDb } = await import("@/lib/db");
    const db = await getDb();

    // ----------------------------------------------------
    // CASE A: Move an entire Folder hierarchy
    // ----------------------------------------------------
    if (sourceFolderPath) {
      const cleanSourceFolder = sourceFolderPath.endsWith("/") ? sourceFolderPath.slice(0, -1) : sourceFolderPath;
      const folderName = cleanSourceFolder.split("/").pop();

      const cleanTarget = targetFolderPath ? (targetFolderPath.endsWith("/") ? targetFolderPath.slice(0, -1) : targetFolderPath) : "";
      
      const targetFolderPrefix = cleanTarget ? `${cleanTarget}/` : "";
      const newFolderPath = `${targetFolderPrefix}${folderName}`;

      // Prevent moving folder into itself or its own child subfolder
      if (
        cleanTarget === cleanSourceFolder ||
        cleanTarget.startsWith(`${cleanSourceFolder}/`)
      ) {
        return NextResponse.json({ error: "Ein Ordner kann nicht in sich selbst verschoben werden." }, { status: 400 });
      }

      // 1. Find all R2 objects with key prefix `${cleanSourceFolder}/`
      const sourcePrefix = `${cleanSourceFolder}/`;
      const listCmd = new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: sourcePrefix,
      });
      const listRes = await s3Client.send(listCmd);
      const objects = listRes.Contents || [];

      // Also check if there's a standalone folder placeholder object
      const folderPlaceholderCmd = new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: cleanSourceFolder,
      });
      const placeholderRes = await s3Client.send(folderPlaceholderCmd);
      if (placeholderRes.Contents) {
        for (const item of placeholderRes.Contents) {
          if (item.Key === cleanSourceFolder && !objects.some((o) => o.Key === cleanSourceFolder)) {
            objects.push(item);
          }
        }
      }

      for (const obj of objects) {
        if (!obj.Key) continue;
        const oldKey = obj.Key;
        
        let newKey = oldKey;
        if (oldKey.startsWith(sourcePrefix)) {
          const relativeSubpath = oldKey.slice(sourcePrefix.length);
          newKey = `${newFolderPath}/${relativeSubpath}`;
        } else if (oldKey === cleanSourceFolder) {
          newKey = newFolderPath;
        }

        if (oldKey === newKey) continue;

        // Copy & Delete in R2
        await s3Client.send(new CopyObjectCommand({
          Bucket: r2BucketName,
          CopySource: `${r2BucketName}/${encodeURIComponent(oldKey)}`,
          Key: newKey,
        }));

        await s3Client.send(new DeleteObjectCommand({
          Bucket: r2BucketName,
          Key: oldKey,
        }));

        // Update DB
        try {
          await db.run("UPDATE files SET path = ? WHERE path = ?", [newKey, oldKey]);
          await db.run("UPDATE share_links SET file_path = ? WHERE file_path = ?", [newKey, oldKey]);
        } catch (dbErr) {
          console.warn("Folder Move: SQLite update failed for key", oldKey, dbErr);
        }
      }

      // Also update DB for any files that might be prefixed in DB
      try {
        const rows = await db.all("SELECT id, path FROM files WHERE path LIKE ?", [`${sourcePrefix}%`]);
        for (const row of rows) {
          const sub = row.path.slice(sourcePrefix.length);
          const updatedPath = `${newFolderPath}/${sub}`;
          await db.run("UPDATE files SET path = ? WHERE id = ?", [updatedPath, row.id]);
          await db.run("UPDATE share_links SET file_path = ? WHERE file_path = ?", [updatedPath, row.path]);
        }
      } catch (err) {
        console.warn("DB bulk update failed", err);
      }

      return NextResponse.json({ success: true, oldFolderPath: cleanSourceFolder, newFolderPath });
    }

    // ----------------------------------------------------
    // CASE B: Move a single File
    // ----------------------------------------------------
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
