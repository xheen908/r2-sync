import { NextResponse } from "next/server";
import crypto from "crypto";
import { s3Client, r2BucketName } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 1. GET /api/share?filePath=... -> List active share links for a file
export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("filePath");

  if (!filePath) {
    return NextResponse.json({ error: "filePath parameter is required" }, { status: 400 });
  }

  let shares: any[] = [];
  const now = Date.now();

  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    shares = await db.all(
      `SELECT * FROM share_links WHERE file_path = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC`,
      [filePath, now]
    );
  } catch (dbErr) {
    console.warn("Share list API: SQLite lookup failed", dbErr);
  }

  const baseUrl = process.env.R2_PUBLIC_DOMAIN_URL || "https://drive.ocpp-labs.com";
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  const formattedShares = shares.map((s) => ({
    id: s.id,
    shareUrl: `${cleanBaseUrl}/s/${s.id}`,
    expiresAt: s.expires_at,
    requiresPassword: !!s.password_hash,
    createdAt: s.created_at,
  }));

  return NextResponse.json({ shares: formattedShares });
}

// 2. POST /api/share -> Create new share link
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filePath, ttlHours, password } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: "filePath ist erforderlich" },
        { status: 400 }
      );
    }

    const shareId = crypto.randomBytes(12).toString("hex");
    const filename = filePath.split("/").pop() || "download";
    const expiresAt = ttlHours ? Date.now() + ttlHours * 3600 * 1000 : null;
    const passwordHash = password ? await hashPassword(password) : null;
    const now = Date.now();

    // 1. Try storing in local SQLite database
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      await db.run(
        `INSERT INTO share_links (id, file_path, filename, expires_at, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shareId, filePath, filename, expiresAt, passwordHash, now]
      );
    } catch (dbErr) {
      console.warn("Share API: SQLite insert failed, backing up to R2 storage:", dbErr);
    }

    // 2. Also back up metadata to R2 bucket `.shares/${shareId}.json` for 100% reliability
    try {
      const shareData = {
        shareId,
        filePath,
        filename,
        expiresAt,
        passwordHash,
        createdAt: now,
      };

      const putCommand = new PutObjectCommand({
        Bucket: r2BucketName,
        Key: `.shares/${shareId}.json`,
        Body: JSON.stringify(shareData),
        ContentType: "application/json",
      });
      await s3Client.send(putCommand);
    } catch (r2Err) {
      console.warn("Share API: R2 backup save failed:", r2Err);
    }

    const baseUrl = process.env.R2_PUBLIC_DOMAIN_URL ||
                    (request.headers.get("x-forwarded-host") ? `https://${request.headers.get("x-forwarded-host")}` : null) ||
                    (request.headers.get("host") && !request.headers.get("host")?.includes("0.0.0.0") ? `https://${request.headers.get("host")}` : null) ||
                    "https://drive.ocpp-labs.com";

    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const shareUrl = `${cleanBaseUrl}/s/${shareId}`;

    return NextResponse.json({
      success: true,
      shareId,
      shareUrl,
      filePath,
      filename,
      expiresAt,
      requiresPassword: !!passwordHash,
    });
  } catch (err: any) {
    console.error("Share API critical error:", err);
    return NextResponse.json(
      { error: `Fehler beim Erstellen des Freigabelinks: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}

// 3. DELETE /api/share?shareId=... -> Delete/Revoke share link
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const shareId = url.searchParams.get("shareId");

  if (!shareId) {
    return NextResponse.json({ error: "shareId parameter is required" }, { status: 400 });
  }

  // 1. Delete from SQLite
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    await db.run("DELETE FROM share_links WHERE id = ?", [shareId]);
  } catch (dbErr) {
    console.warn("Share delete API: SQLite deletion failed:", dbErr);
  }

  // 2. Delete metadata file from R2 bucket
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: r2BucketName,
      Key: `.shares/${shareId}.json`,
    });
    await s3Client.send(deleteCommand);
  } catch (r2Err) {
    console.warn("Share delete API: R2 backup file deletion failed:", r2Err);
  }

  return NextResponse.json({ success: true, shareId });
}
