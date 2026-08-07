import { NextResponse } from "next/server";
import crypto from "crypto";
import { s3Client, r2BucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function GET(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  const { shareId } = params;
  const url = new URL(request.url);
  const password = url.searchParams.get("password") || "";

  if (!shareId) {
    return NextResponse.json({ error: "Ungültiger Link" }, { status: 400 });
  }

  let share: any = null;

  // 1. Try SQLite DB lookup
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    share = await db.get("SELECT * FROM share_links WHERE id = ?", [shareId]);
  } catch (dbErr) {}

  // 2. Fallback to R2 metadata lookup
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
    } catch (r2Err) {}
  }

  if (!share) {
    return NextResponse.json({ error: "Freigabelink nicht gefunden" }, { status: 404 });
  }

  // Check Expiration
  if (share.expires_at && Date.now() > share.expires_at) {
    return NextResponse.json({ error: "Dieser Freigabelink ist abgelaufen." }, { status: 410 });
  }

  // Check Password
  if (share.password_hash) {
    const inputHash = await hashPassword(password);
    if (inputHash !== share.password_hash) {
      return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
    }
  }

  // Stream file directly from R2
  try {
    const getFileCmd = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: share.file_path,
    });
    const fileRes = await s3Client.send(getFileCmd);

    if (!fileRes.Body) {
      return NextResponse.json({ error: "Originaldatei nicht gefunden" }, { status: 404 });
    }

    const stream = fileRes.Body.transformToWebStream();
    const headers = new Headers();
    headers.set("Content-Type", fileRes.ContentType || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(share.filename)}"`);

    return new Response(stream, { headers });
  } catch (r2StreamErr) {
    return NextResponse.json({ error: "Fehler beim Laden der Datei aus R2" }, { status: 500 });
  }
}
