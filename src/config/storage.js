const { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.S3_BUCKET || 'unimate';
const PUBLIC_BASE = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''); // VD https://api.domain/files/unimate
const MAX_MB = Number(process.env.S3_MAX_MB || 10);

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

module.exports = { BUCKET, MAX_MB, s3, ensureBucket, publicUrl, putObject, objectExists, deleteObject };
