const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const { transferNumber, adjustmentNumber } = require('../utils/helpers');

const router = express.Router();

// Warehouses
router.get('/warehouses', authRequired, requirePerm('inventory.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM warehouses ORDER BY id');
  res.json(rows);
});
router.post('/warehouses', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const { code, name, address, province_code, district_code, ward_code, status } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Thieu code/name' });
  try {
    const [r] = await pool.query('INSERT INTO warehouses (code,name,address,province_code,district_code,ward_code,status) VALUES (?,?,?,?,?,?,?)',
      [code, name, address || null, province_code || null, district_code || null, ward_code || null, status || 'active']);
    const [[row]] = await pool.query('SELECT * FROM warehouses WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/warehouses/:id', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const [[w]] = await pool.query('SELECT * FROM warehouses WHERE id=?', [req.params.id]);
  if (!w) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...w, ...req.body };
  try {
    await pool.query('UPDATE warehouses SET code=?,name=?,address=?,province_code=?,district_code=?,ward_code=?,status=? WHERE id=?',
      [f.code, f.name, f.address, f.province_code, f.district_code, f.ward_code, f.status, w.id]);
    const [[row]] = await pool.query('SELECT * FROM warehouses WHERE id=?', [w.id]);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/warehouses/:id', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const [[w]] = await pool.query('SELECT * FROM warehouses WHERE id=?', [req.params.id]);
  if (!w) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ s }]] = await pool.query('SELECT COUNT(*) s FROM warehouse_stocks WHERE warehouse_id=? AND quantity>0', [w.id]);
  const [[{ m }]] = await pool.query('SELECT COUNT(*) m FROM stock_movements WHERE warehouse_id=?', [w.id]);
  const [[{ a }]] = await pool.query('SELECT COUNT(*) a FROM inventory_adjustments WHERE warehouse_id=?', [w.id]);
  const blocking = s + m + a;
  if (blocking > 0 && req.query.force !== '1')
    return res.status(409).json({ error: `Kho con ${s} muc ton, ${m} phieu nhap/xuat, ${a} phieu dieu chinh. Xoa hoac them ?force=1`, can_force: true, stock_rows: s, movements: m, adjustments: a });
  if (req.query.force === '1') {
    await pool.query('DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (SELECT id FROM inventory_adjustments WHERE warehouse_id=?)', [w.id]);
    await pool.query('DELETE FROM inventory_adjustments WHERE warehouse_id=?', [w.id]);
    await pool.query('DELETE FROM stock_movements WHERE warehouse_id=?', [w.id]);
    await pool.query('DELETE FROM stock_reservations WHERE warehouse_id=?', [w.id]);
  }
  await pool.query('DELETE FROM warehouse_stocks WHERE warehouse_id=?', [w.id]);
  await pool.query('DELETE FROM warehouses WHERE id=?', [w.id]);
  res.json({ ok: true, forced: req.query.force === '1' });
});

// Stocks
router.get('/stocks', authRequired, requirePerm('inventory.read'), async (req, res) => {
  const { warehouse_id, variant_id, low } = req.query;
  const where = []; const p = [];
  if (warehouse_id) { where.push('ws.warehouse_id=?'); p.push(warehouse_id); }
  if (variant_id) { where.push('ws.variant_id=?'); p.push(variant_id); }
  if (low === '1') where.push('ws.quantity - ws.reserved_quantity <= ws.reorder_level');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(`SELECT ws.*, v.sku, v.name variant_name, wh.code warehouse_code FROM warehouse_stocks ws
    JOIN product_variants v ON v.id=ws.variant_id JOIN warehouses wh ON wh.id=ws.warehouse_id ${w} ORDER BY ws.updated_at DESC LIMIT 500`, p);
  res.json(rows);
});
router.get('/stocks/available', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_available_stock LIMIT 500');
  res.json(rows);
});
// Upsert stock
router.put('/stocks', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const { warehouse_id, variant_id, quantity, reorder_level } = req.body;
  if (!warehouse_id || !variant_id || quantity === undefined) return res.status(400).json({ error: 'Thieu warehouse/variant/quantity' });
  await pool.query(`INSERT INTO warehouse_stocks (warehouse_id,variant_id,quantity,reserved_quantity,reorder_level) VALUES (?,?,?,0,?)
    ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), reorder_level=VALUES(reorder_level)`,
    [warehouse_id, variant_id, quantity, reorder_level || 0]);
  await pool.query(`INSERT INTO stock_movements (warehouse_id,variant_id,type,quantity,note,created_by) VALUES (?,?,?,?,?,?)`,
    [warehouse_id, variant_id, 'adjustment', quantity, 'Nhap/t set ton kho thu cong', req.user.id]);
  const [[row]] = await pool.query('SELECT * FROM warehouse_stocks WHERE warehouse_id=? AND variant_id=?', [warehouse_id, variant_id]);
  res.json(row);
});
router.delete('/stocks', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const warehouse_id = req.query.warehouse_id ?? req.body?.warehouse_id;
  const variant_id = req.query.variant_id ?? req.body?.variant_id;
  if (!warehouse_id || !variant_id) return res.status(400).json({ error: 'Thieu warehouse_id/variant_id' });
  const [[s]] = await pool.query('SELECT * FROM warehouse_stocks WHERE warehouse_id=? AND variant_id=?', [warehouse_id, variant_id]);
  if (!s) return res.status(404).json({ error: 'Khong tim thay' });
  if (Number(s.reserved_quantity) > 0)
    return res.status(409).json({ error: `Con ${s.reserved_quantity} san pham dang duoc dat trong gio, khong the xoa`, can_force: false, reserved: s.reserved_quantity });
  if (req.query.force !== '1' && Number(s.quantity) !== 0)
    return res.status(409).json({ error: `Con ${s.quantity} san pham trong kho. Chon "Xoa va ghi tang -${s.quantity}"`, can_force: true, quantity: s.quantity });
  if (Number(s.quantity) !== 0)
    await pool.query(`INSERT INTO stock_movements (warehouse_id,variant_id,type,quantity,note,created_by) VALUES (?,?,'adjustment',?,?,?)`,
      [warehouse_id, variant_id, -Number(s.quantity), 'Xoa muc ton kho', req.user.id]);
  await pool.query('DELETE FROM warehouse_stocks WHERE warehouse_id=? AND variant_id=?', [warehouse_id, variant_id]);
  res.json({ ok: true, cleared_quantity: Number(s.quantity) });
});
router.get('/stock-movements', authRequired, requirePerm('inventory.read'), async (req, res) => {
  const { variant_id, warehouse_id } = req.query;
  const where = []; const p = [];
  if (variant_id) { where.push('sm.variant_id=?'); p.push(variant_id); }
  if (warehouse_id) { where.push('sm.warehouse_id=?'); p.push(warehouse_id); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(`SELECT sm.* FROM stock_movements sm ${w} ORDER BY sm.id DESC LIMIT 200`, p);
  res.json(rows);
});

// Adjustments
router.get('/adjustments', authRequired, requirePerm('inventory.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM inventory_adjustments ORDER BY id DESC LIMIT 100');
  res.json(rows);
});
router.post('/adjustments', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const { warehouse_id, reason, items } = req.body; // items: [{variant_id,new_quantity}]
  if (!warehouse_id || !reason || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Thieu du lieu' });
  // tao adjustment + items, chua post
  const number = adjustmentNumber();
  const [ar] = await pool.query('INSERT INTO inventory_adjustments (warehouse_id,adjustment_number,reason,status,created_by) VALUES (?,?,?,?,?)',
    [warehouse_id, number, reason, 'draft', req.user.id]);
  for (const it of items) {
    const [[s]] = await pool.query('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND variant_id=?', [warehouse_id, it.variant_id]);
    const oldQ = s ? s.quantity : 0;
    await pool.query('INSERT INTO inventory_adjustment_items (adjustment_id,variant_id,old_quantity,new_quantity,difference_quantity) VALUES (?,?,?,?,?)',
      [ar.insertId, it.variant_id, oldQ, it.new_quantity, it.new_quantity - oldQ]);
  }
  const [[row]] = await pool.query('SELECT * FROM inventory_adjustments WHERE id=?', [ar.insertId]);
  const [its] = await pool.query('SELECT * FROM inventory_adjustment_items WHERE adjustment_id=?', [ar.insertId]);
  res.status(201).json({ ...row, items: its });
});
router.post('/adjustments/:id/post', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const [[adj]] = await pool.query('SELECT * FROM inventory_adjustments WHERE id=?', [req.params.id]);
  if (!adj) return res.status(404).json({ error: 'Khong tim thay' });
  if (adj.status !== 'draft') return res.status(400).json({ error: 'Chi post tu draft' });
  const [items] = await pool.query('SELECT * FROM inventory_adjustment_items WHERE adjustment_id=?', [adj.id]);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const it of items) {
      await conn.query(`INSERT INTO warehouse_stocks (warehouse_id,variant_id,quantity,reserved_quantity) VALUES (?,?,?,0)
        ON DUPLICATE KEY UPDATE quantity=?`, [adj.warehouse_id, it.variant_id, it.new_quantity, it.new_quantity]);
      await conn.query(`INSERT INTO stock_movements (warehouse_id,variant_id,type,quantity,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?)`,
        [adj.warehouse_id, it.variant_id, 'adjustment', it.difference_quantity, 'adjustment', adj.id, adj.reason, req.user.id]);
    }
    await conn.query("UPDATE inventory_adjustments SET status='posted', posted_by=?, posted_at=NOW(6) WHERE id=?", [req.user.id, adj.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); res.status(500).json({ error: e.message }); } finally { conn.release(); }
});

// Transfers
router.get('/transfers', authRequired, requirePerm('inventory.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM warehouse_transfers ORDER BY id DESC LIMIT 100');
  res.json(rows);
});
router.post('/transfers', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const { source_warehouse_id, destination_warehouse_id, note } = req.body;
  if (!source_warehouse_id || !destination_warehouse_id) return res.status(400).json({ error: 'Thieu kho' });
  if (String(source_warehouse_id) === String(destination_warehouse_id)) return res.status(400).json({ error: '2 kho phai khac nhau' });
  const [r] = await pool.query('INSERT INTO warehouse_transfers (transfer_number,source_warehouse_id,destination_warehouse_id,status,note,created_by) VALUES (?,?,?,?,?,?)',
    [transferNumber(), source_warehouse_id, destination_warehouse_id, 'draft', note || null, req.user.id]);
  const [[row]] = await pool.query('SELECT * FROM warehouse_transfers WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.patch('/transfers/:id/status', authRequired, requirePerm('inventory.write'), async (req, res) => {
  const { status } = req.body;
  await pool.query('UPDATE warehouse_transfers SET status=? WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
