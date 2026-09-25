const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');

const router = express.Router();

router.get('/providers', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM shipping_providers ORDER BY id');
  res.json(rows);
});
router.get('/methods', async (req, res) => {
  if (req.query.all === '1') {
    const [all] = await pool.query('SELECT sm.*, sp.name provider_name, (SELECT COUNT(*) FROM shipments sh WHERE sh.shipping_method_id=sm.id) shipment_count FROM shipping_methods sm LEFT JOIN shipping_providers sp ON sp.id=sm.provider_id ORDER BY sm.sort_order, sm.id');
    return res.json(all);
  }
  const [rows] = await pool.query("SELECT sm.*, sp.name provider_name FROM shipping_methods sm LEFT JOIN shipping_providers sp ON sp.id=sm.provider_id WHERE sm.is_active=1 ORDER BY sm.sort_order, sm.id");
  res.json(rows);
});
router.post('/methods', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const { provider_id, code, name, description, base_fee, is_active, sort_order } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Thieu code/name' });
  const [r] = await pool.query('INSERT INTO shipping_methods (provider_id,code,name,description,base_fee,is_active,sort_order) VALUES (?,?,?,?,?,?,?)',
    [provider_id || null, code, name, description || null, base_fee || 0, is_active !== false && is_active !== 0 && is_active !== '0', sort_order || 0]);
  const [[row]] = await pool.query('SELECT * FROM shipping_methods WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/methods/:id', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const [[m]] = await pool.query('SELECT * FROM shipping_methods WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...m, ...req.body };
  if (!f.code || !f.name) return res.status(400).json({ error: 'Thieu code/name' });
  try {
    await pool.query('UPDATE shipping_methods SET provider_id=?,code=?,name=?,description=?,base_fee=?,is_active=?,sort_order=? WHERE id=?',
      [f.provider_id, f.code, f.name, f.description, f.base_fee, f.is_active ? 1 : 0, f.sort_order || 0, m.id]);
    const [[row]] = await pool.query('SELECT * FROM shipping_methods WHERE id=?', [m.id]);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/methods/:id/toggle', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const [[m]] = await pool.query('SELECT * FROM shipping_methods WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Khong tim thay' });
  await pool.query('UPDATE shipping_methods SET is_active=? WHERE id=?', [m.is_active ? 0 : 1, m.id]);
  const [[row]] = await pool.query('SELECT * FROM shipping_methods WHERE id=?', [m.id]);
  res.json(row);
});
router.delete('/methods/:id', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const [[m]] = await pool.query('SELECT * FROM shipping_methods WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM shipments WHERE shipping_method_id=?', [m.id]);
  const [[{ o }]] = await pool.query("SELECT COUNT(*) o FROM orders WHERE shipping_method_id=? AND status NOT IN ('cancelled','returned','refunded')", [m.id]);
  if ((n > 0 || o > 0) && req.query.force !== '1')
    return res.status(409).json({ error: `Hinh thuc giao da dung cho ${n} van don va ${o} don hang. Tat di thay vi xoa, hoac them ?force=1`, can_force: true, shipment_count: n, order_count: o });
  if (o > 0) await pool.query('UPDATE orders SET shipping_method_id=NULL WHERE shipping_method_id=?', [m.id]);
  await pool.query('DELETE FROM shipping_methods WHERE id=?', [m.id]);
  res.json({ ok: true, detached_shipments: n });
});

// Shipments
router.get('/shipments', authRequired, requirePerm('shipping.read'), async (req, res) => {
  const { order_id, status } = req.query;
  const where = []; const p = [];
  if (order_id) { where.push('order_id=?'); p.push(order_id); }
  if (status) { where.push('status=?'); p.push(status); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(`SELECT * FROM shipments ${w} ORDER BY id DESC LIMIT 200`, p);
  res.json(rows);
});
router.get('/shipments/:id', authRequired, async (req, res) => {
  const [[s]] = await pool.query('SELECT * FROM shipments WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Khong tim thay' });
  const [items] = await pool.query('SELECT * FROM shipment_items WHERE shipment_id=?', [s.id]);
  const [events] = await pool.query('SELECT * FROM shipment_tracking_events WHERE shipment_id=? ORDER BY occurred_at', [s.id]);
  res.json({ ...s, items, tracking: events });
});
router.post('/shipments', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const { order_id, shipping_method_id, warehouse_id, tracking_number, shipping_fee, cod_amount } = req.body;
  if (!order_id) return res.status(400).json({ error: 'Thieu order_id' });
  const [r] = await pool.query(`INSERT INTO shipments (order_id,shipping_method_id,warehouse_id,tracking_number,status,shipping_fee,cod_amount) VALUES (?,?,?,?, 'pending', ?, ?)`,
    [order_id, shipping_method_id || null, warehouse_id || null, tracking_number || null, shipping_fee || 0, cod_amount || 0]);
  const [[row]] = await pool.query('SELECT * FROM shipments WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.patch('/shipments/:id/status', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const { status, tracking_number, description, location } = req.body;
  await pool.query('UPDATE shipments SET status=?, tracking_number=COALESCE(?,tracking_number) WHERE id=?', [status, tracking_number || null, req.params.id]);
  await pool.query(`INSERT INTO shipment_tracking_events (shipment_id,status,description,location,occurred_at) VALUES (?,?,?,?,NOW(6))`,
    [req.params.id, status, description || status, location || null]);
  if (status === 'delivered') {
    await pool.query('UPDATE shipments SET delivered_at=NOW(6) WHERE id=?', [req.params.id]);
    const [[s]] = await pool.query('SELECT order_id FROM shipments WHERE id=?', [req.params.id]);
    if (s) await pool.query("UPDATE orders SET status='delivered', fulfillment_status='fulfilled' WHERE id=?", [s.order_id]);
  }
  res.json({ ok: true });
});
router.post('/shipments/:id/tracking', authRequired, requirePerm('shipping.write'), async (req, res) => {
  const { status, description, location } = req.body;
  const [r] = await pool.query(`INSERT INTO shipment_tracking_events (shipment_id,status,description,location,occurred_at) VALUES (?,?,?,?,NOW(6))`,
    [req.params.id, status, description || null, location || null]);
  const [[row]] = await pool.query('SELECT * FROM shipment_tracking_events WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});

module.exports = router;
