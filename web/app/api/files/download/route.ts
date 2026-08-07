import { NextResponse } from "next/server";
import { s3Client, r2BucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

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
    headers.set("Content-Type", res.ContentType || "application/octet-stream");
    
    const dispositionType = isInline ? "inline" : "attachment";
    headers.set("Content-Disposition", `${dispositionType}; filename="${encodeURIComponent(filename)}"`);

    return new Response(stream, { headers });
  } catch (err) {
    return NextResponse.json({ error: "Download fehlgeschlagen" }, { status: 500 });
  }
}
