import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID || "10c9109e9e342e2b4fc55e71ddf91c17";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "763791a177749b6538807006271e358f";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "bddfd02961a71996e0e6e078a0360a28082c52799fcc72e2a91615db58469b2a";

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
