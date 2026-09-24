const { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.S3_BUCKET || 'unimate';
const PUBLIC_BASE = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''); // VD https://api.domain/files/unimate
const MAX_IMAGE_MB = Number(process.env.S3_MAX_IMAGE_MB || process.env.S3_MAX_MB || 10);
const MAX_VIDEO_MB = Number(process.env.S3_MAX_VIDEO_MB || 100);
const MAX_FILE_MB = Number(process.env.S3_MAX_FILE_MB || 20);
const MAX_MB = Math.max(MAX_IMAGE_MB, MAX_VIDEO_MB, MAX_FILE_MB);

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const FILE_MIME = new Set([
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);
const kindOf = (mime) => {
  if (IMAGE_MIME.has(mime)) return 'image';
  if (VIDEO_MIME.has(mime)) return 'video';
  if (FILE_MIME.has(mime)) return 'file';
  return null;
};
const limitOf = (kind) => (kind === 'video' ? MAX_VIDEO_MB : kind === 'file' ? MAX_FILE_MB : MAX_IMAGE_MB);

let client = null;
function s3() {
  if (client) return client;
  if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY)
    throw Object.assign(new Error('Chua cau hinh S3 (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY)'), { status: 503 });
  client = new S3Client({
    endpoint: process.env.S3_ENDPOINT, // nội bộ: http://minio:9000
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
    forcePathStyle: true, // bắt buộc với MinIO
  });
  return client;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ensured = false;

// Tạo bucket nếu chưa có + mở đọc công khai (chỉ GetObject ảnh sản phẩm)
async function ensureBucket(retries = 10) {
  if (ensured) return;
  const c = s3();
  for (let i = 1; i <= retries; i++) {
    try {
      try { await c.send(new HeadBucketCommand({ Bucket: BUCKET })); }
      catch (e) {
        if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound') {
          await c.send(new CreateBucketCommand({ Bucket: BUCKET }));
          console.log('S3: created bucket', BUCKET);
        } else throw e;
      }
      await c.send(new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`] }],
        }),
      }));
      ensured = true;
      return;
    } catch (e) {
      console.log(`S3: cho MinIO... lan ${i}/${retries} (${e.message?.slice(0, 80)})`);
      if (i === retries) throw e;
      await sleep(3000);
    }
  }
}

function publicUrl(key) {
  if (!PUBLIC_BASE) throw Object.assign(new Error('Chua cau hinh S3_PUBLIC_URL'), { status: 503 });
  return `${PUBLIC_BASE}/${key}`;
}

async function putObject(key, body, contentType) {
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}
async function objectExists(key) {
  try { await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}
async function deleteObject(key) {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { BUCKET, MAX_MB, MAX_IMAGE_MB, MAX_VIDEO_MB, MAX_FILE_MB, kindOf, limitOf, s3, ensureBucket, publicUrl, putObject, objectExists, deleteObject };
