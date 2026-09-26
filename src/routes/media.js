const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const storage = require('../config/storage');

const router = express.Router();
// File lớn (video) ghi ra đĩa tạm rồi stream lên S3 — không ôm RAM
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `unimate-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`),
  }),
  limits: { fileSize: storage.MAX_MB * 1024 * 1024, files: 1 },
});

function safeName(n) {
  return String(n || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'file';
}
const err = (res, e) => res.status(e.status || 500).json({ error: e.message || 'Loi server' });
const cleanup = (p) => { if (p) fs.unlink(p, () => {}); };

const extOf = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mime] || 'img');
// "http://host/bucket/avatars/3/a-b.png" -> "avatars/3/a-b.png"
const keyFromUrl = (url) => {
  try {
    const u = new URL(String(url));
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('unimate');
    return i >= 0 ? parts.slice(i + 1).join('/') : null;
  } catch { return null; }
};

// POST /api/media/upload (multipart field "file") — ảnh/video/file vào object storage S3
router.post('/upload', authRequired, requirePerm('products.write'), (req, res) => {
  upload.single('file')(req, res, async (multerErr) => {
    const tmp = req.file?.path;
    if (multerErr) {
      cleanup(tmp);
      if (multerErr.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `File vuot qua ${storage.MAX_MB}MB` });
      return res.status(400).json({ error: 'File upload loi: ' + multerErr.message });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Thieu field file' });
      const kind = storage.kindOf(req.file.mimetype);
      if (!kind) return res.status(400).json({ error: 'Dinh dang chua ho tro (anh jpg/png/webp/gif, video mp4/webm/ogg, file pdf/zip/doc/xls/txt/csv)' });
      const cap = storage.limitOf(kind);
      if (req.file.size > cap * 1024 * 1024)
        return res.status(400).json({ error: `File ${kind === 'image' ? 'anh' : kind === 'video' ? 'video' : ''} vuot qua ${cap}MB` });
      await storage.ensureBucket();
      const d = new Date();
      const key = `${kind === 'image' ? 'media' : kind}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName(req.file.originalname)}`;
      await storage.putObject(key, fs.createReadStream(tmp), req.file.mimetype);
      const [r] = await pool.query(
        `INSERT INTO media_files (owner_user_id, storage_provider, object_key, original_name, mime_type, size_bytes)
         VALUES (?,?,?,?,?,?)`,
        [req.user.id, 's3', key, req.file.originalname.slice(0, 250), req.file.mimetype, req.file.size]);
      const [[row]] = await pool.query('SELECT * FROM media_files WHERE id=?', [r.insertId]);
      res.status(201).json({ ...row, url: storage.publicUrl(key) });
    } catch (e) { err(res, e); }
    finally { cleanup(tmp); }
  });
});

// POST /api/media/avatar (multipart field "file") — khách tự đổi ảnh đại diện
// Không yêu cầu quyền products.write: chỉ cần đăng nhập, chỉ ghi vào profile của chính người gọi.
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

router.post('/avatar', authRequired, (req, res) => {
  avatarUpload.single('file')(req, res, async (multerErr) => {
    const tmp = req.file?.path;
    if (multerErr) {
      cleanup(tmp);
      if (multerErr.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Anh vuot qua 5MB' });
      return res.status(400).json({ error: 'File upload loi: ' + multerErr.message });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Thieu field file' });
      if (!/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Chi chap nhan file anh' });
      await storage.ensureBucket();
      const key = `avatars/${req.user.id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extOf(req.file.mimetype)}`;
      await storage.putObject(key, fs.createReadStream(tmp), req.file.mimetype);
      const url = storage.publicUrl(key);
      const [ins] = await pool.query(
        'INSERT INTO media_files (owner_user_id, storage_provider, object_key, original_name, mime_type, size_bytes) VALUES (?,?,?,?,?,?)',
        [req.user.id, 's3', key, String(req.file.originalname).slice(0, 250), req.file.mimetype, req.file.size]);
      const [[old]] = await pool.query('SELECT avatar_url FROM user_profiles WHERE user_id=?', [req.user.id]);
      await pool.query(`INSERT INTO user_profiles (user_id, avatar_url) VALUES (?,?)
        ON DUPLICATE KEY UPDATE avatar_url=VALUES(avatar_url)`, [req.user.id, url]);
      // Ảnh cũ đã bị thay thế thì dọn khỏi storage
      if (old?.avatar_url) {
        const oldKey = keyFromUrl(old.avatar_url);
        if (oldKey && oldKey !== key) {
          await pool.query('DELETE FROM media_files WHERE object_key=?', [oldKey]).catch(() => {});
          await storage.deleteObject(oldKey).catch(() => {});
        }
      }
      res.status(201).json({ ok: true, media_id: ins.insertId, avatar_url: url });
    } catch (e) { err(res, e); }
    finally { cleanup(tmp); }
  });
});

// GET /api/media/:id/url — lấy URL công khai của file
router.get('/:id/url', async (req, res) => {
  try {
    const [[m]] = await pool.query('SELECT * FROM media_files WHERE id=?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Khong tim thay' });
    res.json({ id: m.id, url: storage.publicUrl(m.object_key), mime_type: m.mime_type });
  } catch (e) { err(res, e); }
});

// DELETE /api/media/:id — xóa file + metadata (chặn nếu đang được dùng)
router.delete('/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  try {
    const [[m]] = await pool.query('SELECT * FROM media_files WHERE id=?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Khong tim thay' });
    const refs = await Promise.all([
      pool.query('SELECT id FROM product_images WHERE media_id=? LIMIT 1', [m.id]),
      pool.query('SELECT id FROM brands WHERE logo_media_id=? LIMIT 1', [m.id]),
      pool.query('SELECT id FROM categories WHERE image_media_id=? LIMIT 1', [m.id]),
      pool.query('SELECT id FROM banners WHERE image_media_id=? OR mobile_image_media_id=? LIMIT 1', [m.id, m.id]),
      pool.query('SELECT id FROM review_images WHERE media_id=? LIMIT 1', [m.id]),
      pool.query('SELECT user_id FROM user_profiles WHERE avatar_url=? LIMIT 1', [storage.publicUrl(m.object_key)]),
    ]);
    if (refs.some(([rows]) => rows.length))
      return res.status(409).json({ error: 'File dang duoc su dung, khong the xoa' });
    await storage.deleteObject(m.object_key).catch(() => {});
    await pool.query('DELETE FROM media_files WHERE id=?', [m.id]);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

module.exports = router;
