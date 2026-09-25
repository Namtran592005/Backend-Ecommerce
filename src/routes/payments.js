const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const { refundNumber, paged } = require('../utils/helpers');

const router = express.Router();

// Payment methods
router.get('/methods', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM payment_methods ORDER BY sort_order');
  res.json(rows);
});
router.post('/methods', authRequired, requirePerm('payments.write'), async (req, res) => {
  const { code, name, provider, type, is_active, sort_order, config } = req.body;
  if (!code || !name || !type) return res.status(400).json({ error: 'Thieu code/name/type' });
  const [r] = await pool.query('INSERT INTO payment_methods (code,name,provider,type,is_active,sort_order,config) VALUES (?,?,?,?,?,?,?)',
    [code, name, provider || null, type, is_active !== false, sort_order || 0, config ? JSON.stringify(config) : null]);
  const [[row]] = await pool.query('SELECT * FROM payment_methods WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/methods/:id', authRequired, requirePerm('payments.write'), async (req, res) => {
  const [[m]] = await pool.query('SELECT * FROM payment_methods WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...m, ...req.body };
  if (!f.code || !f.name || !f.type) return res.status(400).json({ error: 'Thieu code/name/type' });
  try {
    await pool.query('UPDATE payment_methods SET code=?,name=?,provider=?,type=?,is_active=?,sort_order=?,config=? WHERE id=?',
      [f.code, f.name, f.provider, f.type, f.is_active === undefined ? m.is_active : !!f.is_active, f.sort_order || 0,
        f.config ? JSON.stringify(f.config) : null, m.id]);
    const [[row]] = await pool.query('SELECT * FROM payment_methods WHERE id=?', [m.id]);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/methods/:id/toggle', authRequired, requirePerm('payments.write'), async (req, res) => {
  const [[m]] = await pool.query('SELECT * FROM payment_methods WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Khong tim thay' });
  const next = m.is_active ? 0 : 1;
  await pool.query('UPDATE payment_methods SET is_active=? WHERE id=?', [next, m.id]);
  const [[row]] = await pool.query('SELECT * FROM payment_methods WHERE id=?', [m.id]);
  res.json(row);
});
router.delete('/methods/:id', authRequired, requirePerm('payments.write'), async (req, res) => {
  const [[m]] = await pool.query('SELECT * FROM payment_methods WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM payments WHERE payment_method_id=?', [m.id]);
  if (n > 0) {
    if (req.query.force !== '1')
      return res.status(409).json({ error: `Phuong thuc da duoc dung cho ${n} thanh toan. Tat di thay vi xoa, hoac them ?force=1`, can_force: true, payment_count: n });
    await pool.query('UPDATE payments SET payment_method_id=NULL WHERE payment_method_id=?', [m.id]);
  }
  await pool.query('DELETE FROM payment_methods WHERE id=?', [m.id]);
  res.json({ ok: true, detached_payments: n });
});

// Payments
router.get('/', authRequired, async (req, res) => {
  const { order_id, status } = req.query;
  const where = []; const p = [];
  if (order_id) { where.push('pay.order_id=?'); p.push(order_id); }
  if (status) { where.push('pay.status=?'); p.push(status); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(`SELECT pay.*, pm.code method_code FROM payments pay JOIN payment_methods pm ON pm.id=pay.payment_method_id ${w} ORDER BY pay.id DESC LIMIT 200`, p);
  res.json(rows);
});
router.get('/:id', authRequired, async (req, res) => {
  const [[pay]] = await pool.query('SELECT * FROM payments WHERE id=?', [req.params.id]);
  if (!pay) return res.status(404).json({ error: 'Khong tim thay' });
  const [txs] = await pool.query('SELECT * FROM payment_transactions WHERE payment_id=? ORDER BY id', [pay.id]);
  res.json({ ...pay, transactions: txs });
});
// Tao payment cho order (neu chua co)
router.post('/', authRequired, async (req, res) => {
  const { order_id, payment_method_code } = req.body;
  if (!order_id) return res.status(400).json({ error: 'Thieu order_id' });
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [order_id]);
  if (!o) return res.status(404).json({ error: 'Order khong ton tai' });
  const [[pm]] = await pool.query('SELECT * FROM payment_methods WHERE code=?', [payment_method_code || 'cod']);
  const [r] = await pool.query(`INSERT INTO payments (order_id,payment_method_id,status,amount,currency) VALUES (?,?, 'pending', ?, 'VND')`, [order_id, pm ? pm.id : 1, o.total_amount]);
  res.status(201).json({ id: r.insertId });
});
// Transaction idempotent (webhook mo phong)
router.post('/:id/transactions', async (req, res) => {
  const { transaction_type = 'charge', status = 'success', amount, idempotency_key, provider_transaction_id } = req.body;
  const pid = req.params.id;
  const [[pay]] = await pool.query('SELECT * FROM payments WHERE id=?', [pid]);
  if (!pay) return res.status(404).json({ error: 'Khong tim thay payment' });
  if (idempotency_key) {
    const [[ex]] = await pool.query('SELECT * FROM payment_transactions WHERE idempotency_key=?', [idempotency_key]);
    if (ex) return res.json({ ...ex, deduped: true });
  }
  const [r] = await pool.query(`INSERT INTO payment_transactions (payment_id,transaction_type,status,idempotency_key,provider_transaction_id,amount,processed_at)
    VALUES (?,?,?,?,?,?,IF(?='success',NOW(6),NULL))`,
    [pid, transaction_type, status, idempotency_key || null, provider_transaction_id || null, amount ?? pay.amount, status]);
  if (status === 'success' && ['charge', 'capture'].includes(transaction_type)) {
    await pool.query("UPDATE payments SET status='paid', paid_at=NOW(6) WHERE id=?", [pid]);
    await pool.query("UPDATE orders SET payment_status='paid' WHERE id=?", [pay.order_id]);
    const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [pay.order_id]);
    await pool.query(`INSERT INTO cash_flows (type,reference_type,reference_id,amount,currency,description,occurred_at) VALUES ('income','order',?,?,'VND',?,NOW(6))`,
      [o.id, pay.amount, 'Thu tien don ' + o.order_number]);
  } else if (status === 'failed') {
    await pool.query("UPDATE payments SET status='failed' WHERE id=?", [pid]);
    await pool.query("UPDATE orders SET payment_status='failed' WHERE id=?", [pay.order_id]);
  }
  const [[row]] = await pool.query('SELECT * FROM payment_transactions WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.post('/:id/mark-paid', authRequired, requirePerm('payments.write'), async (req, res) => {
  const [[pay]] = await pool.query('SELECT * FROM payments WHERE id=?', [req.params.id]);
  if (!pay) return res.status(404).json({ error: 'Khong tim thay' });
  await pool.query("UPDATE payments SET status='paid', paid_at=NOW(6) WHERE id=?", [pay.id]);
  await pool.query("UPDATE orders SET payment_status='paid' WHERE id=?", [pay.order_id]);
  await pool.query(`INSERT INTO payment_transactions (payment_id,transaction_type,status,amount,processed_at) VALUES (?, 'charge', 'success', ?, NOW(6))`, [pay.id, pay.amount]);
  res.json({ ok: true });
});

// Refunds
router.get('/refunds/list', authRequired, requirePerm('payments.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM refunds ORDER BY id DESC LIMIT 200');
  res.json(rows);
});
router.post('/refunds', authRequired, requirePerm('payments.write'), async (req, res) => {
  const { order_id, payment_id, amount, reason, items } = req.body;
  if (!order_id || !amount) return res.status(400).json({ error: 'Thieu order/amount' });
  const [r] = await pool.query(`INSERT INTO refunds (order_id,payment_id,refund_number,status,reason,amount,requested_by) VALUES (?,?,?,?,?,?,?)`,
    [order_id, payment_id || null, refundNumber(), 'requested', reason || null, amount, req.user.id]);
  if (Array.isArray(items)) for (const it of items)
    await pool.query('INSERT INTO refund_items (refund_id,order_item_id,quantity,amount) VALUES (?,?,?,?)', [r.insertId, it.order_item_id, it.quantity, it.amount]);
  const [[row]] = await pool.query('SELECT * FROM refunds WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.patch('/refunds/:id/status', authRequired, requirePerm('payments.write'), async (req, res) => {
  const { status } = req.body;
  await pool.query('UPDATE refunds SET status=? WHERE id=?', [status, req.params.id]);
  if (status === 'completed') {
    const [[rf]] = await pool.query('SELECT * FROM refunds WHERE id=?', [req.params.id]);
    if (rf) {
      await pool.query("UPDATE orders SET payment_status='refunded' WHERE id=?", [rf.order_id]);
      if (rf.payment_id) await pool.query("UPDATE payments SET status='refunded' WHERE id=?", [rf.payment_id]);
      await pool.query(`INSERT INTO cash_flows (type,reference_type,reference_id,amount,currency,description,occurred_at) VALUES ('refund','refund',?,?,'VND',?,NOW(6))`, [rf.id, -Math.abs(rf.amount), 'Hoan tien ' + rf.refund_number]);
    }
  }
  res.json({ ok: true });
});

module.exports = router;
