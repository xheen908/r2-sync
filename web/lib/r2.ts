import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID || "10c9109e9e342e2b4fc55e71ddf91c17";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "6e87984a4bbe49caaee83a4d3eee39a0";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";

export const r2BucketName = process.env.R2_BUCKET_NAME || "easyfisk-docs";
export const publicDomainURL = process.env.R2_PUBLIC_DOMAIN_URL || "https://ocpp-labs.com";

export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
