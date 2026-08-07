import { NextResponse } from "next/server";
import crypto from "crypto";
import { s3Client, r2BucketName } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

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
