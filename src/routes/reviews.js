const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const { returnNumber } = require('../utils/helpers');

const router = express.Router();

// RETURNS
router.get('/returns', authRequired, async (req, res) => {
  const isAdmin = req.user.roles.includes('super_admin') || req.user.permissions.includes('returns.read');
  const w = isAdmin ? '' : 'WHERE r.user_id=' + pool.escape(req.user.id);
  const [rows] = await pool.query(`SELECT r.* FROM returns r ${w} ORDER BY r.id DESC LIMIT 200`);
  res.json(rows);
});
router.post('/returns', authRequired, async (req, res) => {
  const { order_id, reason_code, reason_detail, customer_note, items } = req.body; // items [{order_item_id, requested_quantity}]
  if (!order_id || !reason_code || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Thieu du lieu' });
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [order_id]);
  if (!o) return res.status(404).json({ error: 'Order khong ton tai' });
  const isAdmin = req.user.roles.includes('super_admin') || req.user.permissions.includes('returns.write');
  if (!isAdmin && String(o.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Khong co quyen' });
  const [r] = await pool.query(`INSERT INTO returns (order_id,user_id,return_number,status,reason_code,reason_detail,customer_note) VALUES (?,?,?,?,?,?,?)`,
    [order_id, req.user.id, returnNumber(), 'requested', reason_code, reason_detail || null, customer_note || null]);
  for (const it of items)
    await pool.query('INSERT INTO return_items (return_id,order_item_id,requested_quantity) VALUES (?,?,?)', [r.insertId, it.order_item_id, it.requested_quantity]);
  await pool.query('INSERT INTO return_status_history (return_id,from_status,to_status,note,changed_by) VALUES (?,?,?,?,?)', [r.insertId, null, 'requested', reason_detail || null, req.user.id]);
  const [[row]] = await pool.query('SELECT * FROM returns WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.get('/returns/:id', authRequired, async (req, res) => {
  const [[r]] = await pool.query('SELECT * FROM returns WHERE id=?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Khong tim thay' });
  const [items] = await pool.query('SELECT * FROM return_items WHERE return_id=?', [r.id]);
  const [hist] = await pool.query('SELECT * FROM return_status_history WHERE return_id=? ORDER BY id', [r.id]);
  res.json({ ...r, items, history: hist });
});
router.patch('/returns/:id/status', authRequired, requirePerm('returns.write'), async (req, res) => {
  const { status, note } = req.body;
  const [[r]] = await pool.query('SELECT * FROM returns WHERE id=?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Khong tim thay' });
  await pool.query('UPDATE returns SET status=? WHERE id=?', [status, r.id]);
  await pool.query('INSERT INTO return_status_history (return_id,from_status,to_status,note,changed_by) VALUES (?,?,?,?,?)', [r.id, r.status, status, note || null, req.user.id]);
  res.json({ ok: true });
});

// REVIEWS
router.get('/products/:productId/reviews', async (req, res) => {
  const [rows] = await pool.query(`SELECT rv.*, up.display_name FROM reviews rv LEFT JOIN user_profiles up ON up.user_id=rv.user_id
    WHERE rv.product_id=? AND rv.status='published' ORDER BY rv.created_at DESC LIMIT 100`, [req.params.productId]);
  res.json(rows);
});
router.post('/reviews', authRequired, async (req, res) => {
  const { product_id, variant_id, order_id, order_item_id, rating, title, content } = req.body;
  if (!product_id || !rating) return res.status(400).json({ error: 'Thieu product/rating' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating 1-5' });
  let verified = false;
  if (order_id) {
    const [[o]] = await pool.query("SELECT id FROM orders WHERE id=? AND user_id=? AND status IN ('delivered','completed')", [order_id, req.user.id]);
    if (o) verified = true;
  }
  const [r] = await pool.query(`INSERT INTO reviews (product_id,variant_id,user_id,order_id,order_item_id,rating,title,content,is_verified_purchase,status)
    VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
    [product_id, variant_id || null, req.user.id, order_id || null, order_item_id || null, rating, title || null, content || null, verified]);
  const [[row]] = await pool.query('SELECT * FROM reviews WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.patch('/reviews/:id/status', authRequired, requirePerm('reviews.write'), async (req, res) => {
  await pool.query('UPDATE reviews SET status=? WHERE id=?', [req.body.status, req.params.id]);
  res.json({ ok: true });
});
router.post('/reviews/:id/vote', authRequired, async (req, res) => {
  const { vote } = req.body; // helpful | not_helpful
  if (!['helpful', 'not_helpful'].includes(vote)) return res.status(400).json({ error: 'vote sai' });
  await pool.query('INSERT INTO review_votes (review_id,user_id,vote) VALUES (?,?,?) ON DUPLICATE KEY UPDATE vote=VALUES(vote)', [req.params.id, req.user.id, vote]);
  res.json({ ok: true });
});

module.exports = router;
