import { S3Client } from "@aws-sdk/client-s3";
import { getDb } from "./db";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomainUrl: string;
}

export async function getR2Config(): Promise<R2Config> {
  let config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID || "10c9109e9e342e2b4fc55e71ddf91c17",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "763791a177749b6538807006271e358f",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "bddfd02961a71996e0e6e078a0360a28082c52799fcc72e2a91615db58469b2a",
    bucketName: process.env.R2_BUCKET_NAME || "easyfisk-docs",
    publicDomainUrl: process.env.R2_PUBLIC_DOMAIN_URL || "https://drive.ocpp-labs.com",
  };

  try {
    const db = await getDb();
    const rows = await db.all("SELECT key, value FROM settings");
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }

    if (settingsMap.r2_account_id) config.accountId = settingsMap.r2_account_id;
    if (settingsMap.r2_access_key_id) config.accessKeyId = settingsMap.r2_access_key_id;
    if (settingsMap.r2_secret_access_key) config.secretAccessKey = settingsMap.r2_secret_access_key;
    if (settingsMap.r2_bucket_name) config.bucketName = settingsMap.r2_bucket_name;
    if (settingsMap.r2_public_domain_url) config.publicDomainUrl = settingsMap.r2_public_domain_url;
  } catch (err) {
    console.warn("Could not read dynamic R2 settings from SQLite DB, using defaults", err);
  }

  return config;
}

export async function getS3Client(): Promise<{ s3Client: S3Client; bucketName: string; publicDomainUrl: string }> {
  const config = await getR2Config();
  const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    s3Client,
    bucketName: config.bucketName,
    publicDomainUrl: config.publicDomainUrl,
  };
}

// Fallback static export for backward compatibility
export const r2BucketName = process.env.R2_BUCKET_NAME || "easyfisk-docs";
export const publicDomainURL = process.env.R2_PUBLIC_DOMAIN_URL || "https://drive.ocpp-labs.com";
export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID || "10c9109e9e342e2b4fc55e71ddf91c17"}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "763791a177749b6538807006271e358f",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "bddfd02961a71996e0e6e078a0360a28082c52799fcc72e2a91615db58469b2a",
  },
});
