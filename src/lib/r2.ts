import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("Variabel R2_* belum lengkap. Lihat .env.example.");
  }
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET };
}

function r2() {
  if (!client) {
    const { accountId, accessKeyId, secretAccessKey } = config();
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      // Checksum otomatis SDK v3 menambah header yang tidak dikirim browser saat PUT, sehingga signature presigned URL gagal.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

// Content-Type dan Content-Length ikut ditandatangani: browser tidak bisa mengunggah file lain dari yang disetujui.
export function presignPut(key: string, contentType: string, contentLength: number, expiresIn = 300) {
  const command = new PutObjectCommand({ Bucket: config().bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
  return getSignedUrl(r2(), command, { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) });
}

// Waktu tanda tangan dibulatkan ke jam: URL sama selama satu jam sehingga cache browser tetap terpakai.
// Masa berlaku (minHours + 1) jam dari awal jam itu, jadi URL selalu hidup minimal minHours sejak dibuat.
// Unduhan ZIP memakai 6 jam (PRD §6.3) agar tidak kedaluwarsa di tengah jalan.
export function presignGet(key: string, minHours = 1) {
  const hour = 3_600_000;
  const signingDate = new Date(Math.floor(Date.now() / hour) * hour);
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: config().bucket, Key: key }), { expiresIn: (minHours + 1) * 3600, signingDate });
}

export async function headObject(key: string) {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: config().bucket, Key: key }));
    return { contentType: res.ContentType ?? "", size: res.ContentLength ?? 0 };
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function deleteObjects(keys: string[]) {
  await Promise.all(keys.map((key) => r2().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key }))));
}
