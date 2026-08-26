import { NextResponse } from "next/server";
import crypto from "crypto";
import { s3Client, r2BucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function getMimeType(filename: string, fallbackContentType?: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain",
    html: "text/html",
    json: "application/json",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
  };
  if (mimeTypes[ext]) return mimeTypes[ext];
  if (fallbackContentType && fallbackContentType !== "application/octet-stream" && fallbackContentType !== "binary/octet-stream") {
    return fallbackContentType;
  }
  return "application/octet-stream";
}

export async function GET(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  const { shareId } = params;
  const url = new URL(request.url);
  const password = url.searchParams.get("password") || "";
  const requestedFilePath = url.searchParams.get("filePath") || "";
  const isInline = url.searchParams.get("inline") === "1";

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
          isFolder: !!data.isFolder,
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

  // Determine target key: if picking specific file in folder, or single file
  let targetKey = share.file_path;
  if (requestedFilePath) {
    // Security check: ensure requested file is inside shared folder
    const prefix = share.file_path.endsWith("/") ? share.file_path : `${share.file_path}/`;
    if (requestedFilePath.startsWith(prefix) || requestedFilePath === share.file_path) {
      targetKey = requestedFilePath;
    }
  }

  const filename = targetKey.split("/").pop() || share.filename || "download";

  // Stream file directly from R2
  try {

    let getParams: any = {
      Bucket: r2BucketName,
      Key: targetKey,
    };
    
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      getParams.Range = rangeHeader;
    }

    const getFileCmd = new GetObjectCommand(getParams);
    const fileRes = await s3Client.send(getFileCmd);


    if (!fileRes.Body) {
      return NextResponse.json({ error: "Originaldatei nicht gefunden" }, { status: 404 });
    }

    const stream = fileRes.Body.transformToWebStream();
    const headers = new Headers();
    

    const mimeType = getMimeType(filename, fileRes.ContentType);
    headers.set("Content-Type", mimeType);
    headers.set("Accept-Ranges", "bytes");

    if (fileRes.ContentRange) {
      headers.set("Content-Range", fileRes.ContentRange);
    }
    if (fileRes.ContentLength) {
      headers.set("Content-Length", fileRes.ContentLength.toString());
    }

    const status = fileRes.ContentRange ? 206 : 200;


    if (isInline) {
      headers.set("Content-Disposition", "inline");
    } else {
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    return new Response(stream, { headers, status });
  } catch (r2StreamErr) {
    return NextResponse.json({ error: "Fehler beim Laden der Datei aus R2" }, { status: 500 });
  }
}
