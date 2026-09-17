const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const { invoiceNumber } = require('../utils/helpers');

const router = express.Router();

// INVOICES
router.get('/invoices', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM invoices ORDER BY id DESC LIMIT 200');
  res.json(rows);
});
router.post('/invoices', authRequired, requirePerm('payments.write'), async (req, res) => {
  const { order_id, buyer_name, buyer_company_name, buyer_tax_code, buyer_email, buyer_address } = req.body;
  if (!order_id) return res.status(400).json({ error: 'Thieu order_id' });
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [order_id]);
  if (!o) return res.status(404).json({ error: 'Order khong ton tai' });
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [order_id]);
  const [r] = await pool.query(`INSERT INTO invoices (order_id,invoice_number,status,buyer_name,buyer_company_name,buyer_tax_code,buyer_email,buyer_address,subtotal,tax_amount,total_amount)
    VALUES (?,?, 'draft', ?,?,?,?,?,?,?,?)`,
    [order_id, invoiceNumber(), buyer_name || null, buyer_company_name || null, buyer_tax_code || null, buyer_email || null, buyer_address || null, o.subtotal, o.tax_amount, o.total_amount]);
  for (const it of items)
    await pool.query(`INSERT INTO invoice_items (invoice_id,order_item_id,description,quantity,unit_price,tax_rate,tax_amount,line_total) VALUES (?,?,?,?,?,?,?,?)`,
      [r.insertId, it.id, it.product_name_snapshot, it.quantity, it.unit_price, 0, 0, it.total_amount]);
  const [[row]] = await pool.query('SELECT * FROM invoices WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.patch('/invoices/:id/status', authRequired, requirePerm('payments.write'), async (req, res) => {
  const { status } = req.body; // issued | cancelled
  if (status === 'issued') await pool.query("UPDATE invoices SET status='issued', issued_at=NOW(6) WHERE id=?", [req.params.id]);
  else await pool.query('UPDATE invoices SET status=? WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
});

// CASH FLOWS
router.get('/cash-flows', authRequired, requirePerm('reports.read'), async (req, res) => {
  const { from, to } = req.query;
  const where = []; const p = [];
  if (from) { where.push('occurred_at>=?'); p.push(from); }
  if (to) { where.push('occurred_at<=?'); p.push(to); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(`SELECT * FROM cash_flows ${w} ORDER BY occurred_at DESC LIMIT 500`, p);
  res.json(rows);
});
router.post('/cash-flows', authRequired, requirePerm('payments.write'), async (req, res) => {
  const { type, reference_type, reference_id, amount, currency, description, occurred_at } = req.body;
  if (!type || amount === undefined) return res.status(400).json({ error: 'Thieu type/amount' });
  const [r] = await pool.query(`INSERT INTO cash_flows (type,reference_type,reference_id,amount,currency,description,occurred_at,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [type, reference_type || null, reference_id || null, amount, currency || 'VND', description || null, occurred_at || new Date(), req.user.id]);
  const [[row]] = await pool.query('SELECT * FROM cash_flows WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});

// CAMPAIGNS & BANNERS
router.get('/campaigns', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM campaigns ORDER BY id DESC');
  res.json(rows);
});
router.post('/campaigns', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { name, description, status, starts_at, ends_at, product_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'Thieu name' });
  const [r] = await pool.query('INSERT INTO campaigns (name,description,status,starts_at,ends_at,created_by) VALUES (?,?,?,?,?,?)',
    [name, description || null, status || 'draft', starts_at || null, ends_at || null, req.user.id]);
  for (const pid of product_ids || []) await pool.query('INSERT IGNORE INTO campaign_products (campaign_id,product_id) VALUES (?,?)', [r.insertId, pid]);
  const [[row]] = await pool.query('SELECT * FROM campaigns WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.get('/banners', async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM banners WHERE status='active' ORDER BY sort_order LIMIT 50");
  res.json(rows);
});
router.get('/banners/all', authRequired, requirePerm('promotions.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM banners ORDER BY sort_order');
  res.json(rows);
});
router.post('/banners', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { title, image_media_id, mobile_image_media_id, link_url, alt_text, sort_order, status, starts_at, ends_at } = req.body;
  if (!title) return res.status(400).json({ error: 'Thieu title' });
  const [r] = await pool.query(`INSERT INTO banners (title,image_media_id,mobile_image_media_id,link_url,alt_text,sort_order,status,starts_at,ends_at,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [title, image_media_id || null, mobile_image_media_id || null, link_url || null, alt_text || null, sort_order || 0, status || 'draft', starts_at || null, ends_at || null, req.user.id]);
  const [[row]] = await pool.query('SELECT * FROM banners WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/banners/:id', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const [[b]] = await pool.query('SELECT * FROM banners WHERE id=?', [req.params.id]);
  if (!b) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...b, ...req.body };
  await pool.query('UPDATE banners SET title=?,image_media_id=?,mobile_image_media_id=?,link_url=?,alt_text=?,sort_order=?,status=?,starts_at=?,ends_at=? WHERE id=?',
    [f.title, f.image_media_id, f.mobile_image_media_id, f.link_url, f.alt_text, f.sort_order, f.status, f.starts_at, f.ends_at, b.id]);
  const [[row]] = await pool.query('SELECT * FROM banners WHERE id=?', [b.id]);
  res.json(row);
});

// SYSTEM: settings, notifications, logs, reports
router.get('/settings/public', async (req, res) => {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings WHERE is_public=1');
  res.json(rows);
});
router.get('/settings', authRequired, requirePerm('settings.write'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM system_settings');
  res.json(rows);
});
router.put('/settings/:key', authRequired, requirePerm('settings.write'), async (req, res) => {
  await pool.query('INSERT INTO system_settings (setting_key,setting_value,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by)',
    [req.params.key, JSON.stringify(req.body.value), req.user.id]);
  res.json({ ok: true });
});
router.get('/notifications', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json(rows);
});
router.post('/notifications', authRequired, requirePerm('users.write'), async (req, res) => {
  const { user_id, type, title, body, data } = req.body;
  if (!type || !title || !body) return res.status(400).json({ error: 'Thieu type/title/body' });
  const [r] = await pool.query('INSERT INTO notifications (user_id,type,title,body,data) VALUES (?,?,?,?,?)',
    [user_id || null, type, title, body, data ? JSON.stringify(data) : null]);
  const [[row]] = await pool.query('SELECT * FROM notifications WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.patch('/notifications/:id/read', authRequired, async (req, res) => {
  await pool.query('UPDATE notifications SET read_at=NOW(6) WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
router.get('/audit-logs', authRequired, requirePerm('audit.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200');
  res.json(rows);
});
router.get('/admin-logs', authRequired, requirePerm('audit.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM admin_activity_logs ORDER BY id DESC LIMIT 200');
  res.json(rows);
});
router.get('/reports/summary', authRequired, requirePerm('reports.read'), async (req, res) => {
  const [[orders]] = await pool.query("SELECT COUNT(*) total_orders, COALESCE(SUM(total_amount),0) revenue FROM orders WHERE status NOT IN ('cancelled')");
  const [[today]] = await pool.query("SELECT COUNT(*) n, COALESCE(SUM(total_amount),0) revenue FROM orders WHERE DATE(created_at)=CURDATE() AND status NOT IN ('cancelled')");
  const [top] = await pool.query(`SELECT oi.product_id, oi.product_name_snapshot name, SUM(oi.quantity) qty, SUM(oi.total_amount) revenue
    FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status NOT IN ('cancelled') GROUP BY oi.product_id, oi.product_name_snapshot ORDER BY qty DESC LIMIT 10`);
  const [low] = await pool.query('SELECT * FROM v_available_stock WHERE available_quantity <= reorder_level LIMIT 20');
  const [payStatus] = await pool.query('SELECT payment_status, COUNT(*) n FROM orders GROUP BY payment_status');
  res.json({ all_time: orders, today, top_products: top, low_stock: low, by_payment: payStatus });
});

module.exports = router;
