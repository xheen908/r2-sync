import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("filePath");
  const isInline = url.searchParams.get("inline") === "1";

  if (!filePath) {
    return NextResponse.json({ error: "filePath parameter is required" }, { status: 400 });
  }

  const filename = filePath.split("/").pop() || "download";

  try {
    const getCmd = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: filePath,
    });
    const res = await s3Client.send(getCmd);

    if (!res.Body) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
    }

    const stream = res.Body.transformToWebStream();
    const headers = new Headers();
    
    const mimeType = getMimeType(filename, res.ContentType);
    headers.set("Content-Type", mimeType);

    if (isInline) {
      headers.set("Content-Disposition", "inline");
    } else {
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    return new Response(stream, { headers });
  } catch (err) {
    return NextResponse.json({ error: "Download fehlgeschlagen" }, { status: 500 });
  }
}
