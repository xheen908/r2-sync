import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  const { shareId } = params;

  if (!shareId || shareId.length < 8) {
    return NextResponse.json(
      { error: "Ungültiger Freigabelink" },
      { status: 404 }
    );
  }

  let share: any = null;

  // 1. Try fetching from SQLite
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    share = await db.get("SELECT * FROM share_links WHERE id = ?", [shareId]);
  } catch (dbErr) {
    console.warn("Public Share API: SQLite lookup failed, checking R2:", dbErr);
  }

  // 2. If not found in SQLite, fetch from R2 `.shares/${shareId}.json`
  if (!share) {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: r2BucketName,
        Key: `.shares/${shareId}.json`,
      });
      const res = await s3Client.send(getCommand);
      if (res.Body) {
        const bodyStr = await res.Body.transformToString();
        const data = JSON.parse(bodyStr);
        share = {
          id: data.shareId,
          file_path: data.filePath,
          filename: data.filename,
          expires_at: data.expiresAt,
          password_hash: data.passwordHash,
        };
      }
    } catch (r2Err) {
      console.warn("Public Share API: R2 metadata lookup failed:", r2Err);
    }
  }

  if (!share) {
    return NextResponse.json(
      { error: "Freigabelink wurde nicht gefunden oder wurde gelöscht." },
      { status: 404 }
    );
  }

  const isExpired = share.expires_at ? Date.now() > share.expires_at : false;

  return NextResponse.json({
    shareId: share.id,
    filePath: share.file_path,
    filename: share.filename,
    expiresAt: share.expires_at,
    requiresPassword: !!share.password_hash,
    expired: isExpired,
  });
}
