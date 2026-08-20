import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "heic"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "mkv", "webm", "avi", "3gp"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("filePath");
  const size = Math.min(parseInt(url.searchParams.get("size") || "300", 10), 800);

  if (!filePath) {
    return NextResponse.json({ error: "filePath required" }, { status: 400 });
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const isImage = IMAGE_EXTS.has(ext);
  const isVideo = VIDEO_EXTS.has(ext);

  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "Unsupported media format" }, { status: 400 });
  }

  try {
    const cmd = new GetObjectCommand({ Bucket: r2BucketName, Key: filePath });
    const res = await s3Client.send(cmd);

    if (!res.Body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const arrayBuffer = await res.Body.transformToByteArray();
    const inputBuffer = Buffer.from(arrayBuffer);

    const thumbnail = await sharp(inputBuffer)
      .rotate() // auto-rotate from EXIF
      .resize(size, size, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();

    const headers = new Headers();
    headers.set("Content-Type", "image/webp");
    headers.set("Content-Length", thumbnail.length.toString());
    headers.set("Cache-Control", "public, max-age=31536000, immutable"); // 1 year cache
    headers.set("Content-Disposition", "inline");

    return new Response(thumbnail, { headers });
  } catch (err: any) {
    console.error("[thumbnail] Error:", err?.message);
    return NextResponse.json({ error: "Thumbnail generation failed" }, { status: 500 });
  }
}
