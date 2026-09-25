const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');

const router = express.Router();

// Promotions
router.get('/promotions', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM promotions ORDER BY priority DESC, id DESC LIMIT 200');
  res.json(rows);
});
router.post('/promotions', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { name, code, description, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, starts_at, ends_at, priority, stackable, status } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Thieu name/type' });
  const [r] = await pool.query(`INSERT INTO promotions (name,code,description,type,value,minimum_order_amount,maximum_discount_amount,usage_limit,starts_at,ends_at,priority,stackable,status,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [name, code || null, description || null, type, value || null, minimum_order_amount || null, maximum_discount_amount || null, usage_limit || null, starts_at || null, ends_at || null, priority || 0, !!stackable, status || 'draft', req.user.id]);
  const [[row]] = await pool.query('SELECT * FROM promotions WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/promotions/:id', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[p]] = await pool.query('SELECT * FROM promotions WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...p, ...req.body };
  await pool.query(`UPDATE promotions SET name=?,code=?,description=?,type=?,value=?,minimum_order_amount=?,maximum_discount_amount=?,usage_limit=?,starts_at=?,ends_at=?,priority=?,stackable=?,status=? WHERE id=?`,
    [f.name, f.code, f.description, f.type, f.value, f.minimum_order_amount, f.maximum_discount_amount, f.usage_limit, f.starts_at, f.ends_at, f.priority, !!f.stackable, f.status, p.id]);
  const [[row]] = await pool.query('SELECT * FROM promotions WHERE id=?', [p.id]);
  res.json(row);
});
router.post('/promotions/:id/products', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { product_ids } = req.body;
  for (const pid of product_ids || []) await pool.query('INSERT IGNORE INTO promotion_products (promotion_id,product_id) VALUES (?,?)', [req.params.id, pid]);
  res.json({ ok: true });
});
router.put('/promotions/:id/products', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { product_ids } = req.body;
  if (!Array.isArray(product_ids)) return res.status(400).json({ error: 'Thieu danh sach product_ids' });
  await pool.query('DELETE FROM promotion_products WHERE promotion_id=?', [req.params.id]);
  for (const pid of product_ids) await pool.query('INSERT IGNORE INTO promotion_products (promotion_id,product_id) VALUES (?,?)', [req.params.id, pid]);
  res.json({ ok: true, count: product_ids.length });
});
router.patch('/promotions/:id/toggle', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[p]] = await pool.query('SELECT * FROM promotions WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Khong tim thay' });
  const next = p.status === 'active' ? 'inactive' : 'active';
  await pool.query('UPDATE promotions SET status=? WHERE id=?', [next, p.id]);
  const [[row]] = await pool.query('SELECT * FROM promotions WHERE id=?', [p.id]);
  res.json(row);
});
router.delete('/promotions/:id', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[p]] = await pool.query('SELECT * FROM promotions WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM promotion_products WHERE promotion_id=?', [p.id]);
  if (n > 0 && req.query.force !== '1')
    return res.status(409).json({ error: `Chuong trinh con ${n} san pham duoc gan. Xoa luon hoac them ?force=1`, can_force: true, product_count: n });
  await pool.query('DELETE FROM promotions WHERE id=?', [p.id]);
  res.json({ ok: true });
});

// Coupons
router.get('/coupons', authRequired, requirePerm('promotions.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM coupons ORDER BY id DESC LIMIT 200');
  res.json(rows);
});
router.post('/coupons', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_user, starts_at, expires_at, status } = req.body;
  if (!code || !type) return res.status(400).json({ error: 'Thieu code/type' });
  try {
    const [r] = await pool.query(`INSERT INTO coupons (code,type,value,minimum_order_amount,maximum_discount_amount,usage_limit,usage_limit_per_user,used_count,starts_at,expires_at,status,created_by)
      VALUES (?,?,?,?,?,?,?,0,?,?,?,?)`,
      [code, type, value || 0, minimum_order_amount || null, maximum_discount_amount || null, usage_limit || null, usage_limit_per_user || null, starts_at || null, expires_at || null, status || 'active', req.user.id]);
    const [[row]] = await pool.query('SELECT * FROM coupons WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/coupons/:id', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[c]] = await pool.query('SELECT * FROM coupons WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...c, ...req.body };
  await pool.query(`UPDATE coupons SET code=?,type=?,value=?,minimum_order_amount=?,maximum_discount_amount=?,usage_limit=?,usage_limit_per_user=?,starts_at=?,expires_at=?,status=? WHERE id=?`,
    [f.code, f.type, f.value, f.minimum_order_amount, f.maximum_discount_amount, f.usage_limit, f.usage_limit_per_user, f.starts_at, f.expires_at, f.status, c.id]);
  const [[row]] = await pool.query('SELECT * FROM coupons WHERE id=?', [c.id]);
  res.json(row);
});
router.patch('/coupons/:id/toggle', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[c]] = await pool.query('SELECT * FROM coupons WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Khong tim thay' });
  const next = c.status === 'active' ? 'inactive' : 'active';
  await pool.query('UPDATE coupons SET status=? WHERE id=?', [next, c.id]);
  const [[row]] = await pool.query('SELECT * FROM coupons WHERE id=?', [c.id]);
  res.json(row);
});
router.delete('/coupons/:id', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[c]] = await pool.query('SELECT * FROM coupons WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=?', [c.id]);
  if (n > 0 && req.query.force !== '1')
    return res.status(409).json({ error: `Ma da duoc dung ${n} lan. Tat di thay vi xoa, hoac them ?force=1 de xoa ca lich su`, can_force: true, redemption_count: n });
  if (n > 0) await pool.query('DELETE FROM coupon_redemptions WHERE coupon_id=?', [c.id]);
  await pool.query('DELETE FROM coupons WHERE id=?', [c.id]);
  res.json({ ok: true, removed_redemptions: n });
});
// Validate coupon (public, de checkout dung)
router.post('/coupons/validate', async (req, res) => {
  const { code, order_amount = 0 } = req.body;
  const [[c]] = await pool.query('SELECT * FROM coupons WHERE code=?', [code]);
  if (!c) return res.status(404).json({ valid: false, error: 'Ma khong ton tai' });
  const now = new Date();
  if (c.status !== 'active') return res.json({ valid: false, error: 'Ma khong hoat dong' });
  if (c.starts_at && new Date(c.starts_at) > now) return res.json({ valid: false, error: 'Chua toi thoi gian' });
  if (c.expires_at && new Date(c.expires_at) < now) return res.json({ valid: false, error: 'Ma het han' });
  if (c.usage_limit && c.used_count >= c.usage_limit) return res.json({ valid: false, error: 'Het luot' });
  if (c.minimum_order_amount && Number(order_amount) < Number(c.minimum_order_amount)) return res.json({ valid: false, error: `Don toi thieu ${c.minimum_order_amount}` });
  let discount = 0;
  if (c.type === 'percentage') { discount = Number(order_amount) * Number(c.value) / 100; if (c.maximum_discount_amount) discount = Math.min(discount, Number(c.maximum_discount_amount)); }
  else if (c.type === 'fixed') discount = Math.min(Number(c.value), Number(order_amount));
  else if (c.type === 'free_shipping') discount = 0;
  res.json({ valid: true, coupon: c, discount_amount: Math.round(discount) });
});
router.get('/redemptions', authRequired, requirePerm('promotions.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM coupon_redemptions ORDER BY id DESC LIMIT 200');
  res.json(rows);
});

module.exports = router;
