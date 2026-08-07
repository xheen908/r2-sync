import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getR2Config, getS3Client } from "@/lib/r2";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getR2Config();

    // Test connection to Cloudflare R2
    let isConnected = false;
    let errorDetails = null;

    try {
      const { s3Client, bucketName } = await getS3Client();
      const testCmd = new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 });
      await s3Client.send(testCmd);
      isConnected = true;
    } catch (r2Err: any) {
      errorDetails = r2Err?.message || String(r2Err);
    }

    return NextResponse.json({
      config: {
        accountId: config.accountId,
        accessKeyId: config.accessKeyId,
        secretAccessKeyConfigured: !!config.secretAccessKey,
        bucketName: config.bucketName,
        publicDomainUrl: config.publicDomainUrl,
      },
      isConnected,
      errorDetails,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Fehler beim Laden der Einstellungen" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, accessKeyId, secretAccessKey, bucketName, publicDomainUrl } = body;

    const db = await getDb();
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");

    if (accountId !== undefined) await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["r2_account_id", accountId.trim()]);
    if (accessKeyId !== undefined) await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["r2_access_key_id", accessKeyId.trim()]);
    if (secretAccessKey && secretAccessKey.trim()) await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["r2_secret_access_key", secretAccessKey.trim()]);
    if (bucketName !== undefined) await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["r2_bucket_name", bucketName.trim()]);
    if (publicDomainUrl !== undefined) await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["r2_public_domain_url", publicDomainUrl.trim()]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error saving settings:", err);
    return NextResponse.json({ error: "Fehler beim Speichern der Einstellungen" }, { status: 500 });
  }
}
