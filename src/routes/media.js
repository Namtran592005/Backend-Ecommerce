const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const storage = require('../config/storage');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storage.MAX_MB * 1024 * 1024, files: 1 },
});
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function safeName(n) {
  return String(n || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'file';
}
const err = (res, e) => res.status(e.status || 500).json({ error: e.message || 'Loi server' });

// POST /api/media/upload (multipart field "file") — upload qua backend vào MinIO/S3
router.post('/upload', authRequired, requirePerm('products.write'), (req, res) => {
  upload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      if (multerErr.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `File vuot qua ${storage.MAX_MB}MB` });
      return res.status(400).json({ error: 'File upload loi: ' + multerErr.message });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Thieu field file' });
      if (!ALLOWED_MIME.has(req.file.mimetype))
        return res.status(400).json({ error: 'Chi nhan anh jpg/png/webp/gif' });
      await storage.ensureBucket();
      const d = new Date();
      const key = `media/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName(req.file.originalname)}`;
      await storage.putObject(key, req.file.buffer, req.file.mimetype);
      const [r] = await pool.query(
        `INSERT INTO media_files (owner_user_id, storage_provider, object_key, original_name, mime_type, size_bytes)
         VALUES (?,?,?,?,?,?)`,
        [req.user.id, 'minio', key, req.file.originalname.slice(0, 250), req.file.mimetype, req.file.size]);
      const [[row]] = await pool.query('SELECT * FROM media_files WHERE id=?', [r.insertId]);
      res.status(201).json({ ...row, url: storage.publicUrl(key) });
    } catch (e) { err(res, e); }
  });
});

// GET /api/media/:id/url — lấy URL công khai của file (dùng cho <img>)
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
    ]);
    if (refs.some(([rows]) => rows.length))
      return res.status(409).json({ error: 'Anh dang duoc su dung, khong the xoa' });
    await storage.deleteObject(m.object_key).catch(() => {});
    await pool.query('DELETE FROM media_files WHERE id=?', [m.id]);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

module.exports = router;
