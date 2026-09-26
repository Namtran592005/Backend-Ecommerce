const express = require('express');
const { pool } = require('../config/db');
const { authRequired, authOptional, requirePerm, logAudit } = require('../middleware/auth');
const { orderNumber, paged } = require('../utils/helpers');

const router = express.Router();

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipping', 'cancelled'],
  shipping: ['delivered', 'returned'],
  delivered: ['completed', 'returned'],
  completed: [], cancelled: [], returned: ['refunded'], refunded: [],
};

function calcCouponDiscount(coupon, subtotal, shippingFee) {
  if (!coupon) return { orderDiscount: 0, shipDiscount: 0 };
  if (coupon.status !== 'active') return { orderDiscount: 0, shipDiscount: 0 };
  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return { orderDiscount: 0, shipDiscount: 0 };
  if (coupon.expires_at && new Date(coupon.expires_at) < now) return { orderDiscount: 0, shipDiscount: 0 };
  if (coupon.minimum_order_amount && Number(subtotal) < Number(coupon.minimum_order_amount)) return { orderDiscount: 0, shipDiscount: 0 };
  let orderDiscount = 0, shipDiscount = 0;
  if (coupon.type === 'percentage') {
    orderDiscount = Number(subtotal) * Number(coupon.value) / 100;
    if (coupon.maximum_discount_amount) orderDiscount = Math.min(orderDiscount, Number(coupon.maximum_discount_amount));
  } else if (coupon.type === 'fixed') {
    orderDiscount = Math.min(Number(coupon.value), Number(subtotal));
  } else if (coupon.type === 'free_shipping') {
    shipDiscount = Number(shippingFee);
  }
  return { orderDiscount: Math.round(orderDiscount), shipDiscount: Math.round(shipDiscount) };
}

// POST /api/orders/checkout  (transaction day du)
router.post('/checkout', authOptional, async (req, res) => {
  const { items, shipping_address, billing_address, coupon_code, payment_method_code = 'cod', shipping_method_code, customer_note, user_id: bodyUserId } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Gio hang rong' });
  if (!shipping_address || !shipping_address.recipient_name || !shipping_address.phone || !shipping_address.province_name || !shipping_address.address_line)
    return res.status(400).json({ error: 'Thieu dia chi giao hang' });
  // Nhân viên (orders.write) được đặt hộ: user_id trong body thắng user đăng nhập.
  // Khách thường: đơn gắn chính mình (hoặc vãng lai nếu chưa login).
  const staff = req.user && (req.user.roles.includes('super_admin') || req.user.permissions.includes('orders.write'));
  if (bodyUserId) {
    const [[target]] = await pool.query('SELECT id FROM users WHERE id=? AND deleted_at IS NULL', [bodyUserId]);
    if (!target) return res.status(400).json({ error: 'Khach hang khong ton tai' });
    if (!staff) return res.status(403).json({ error: 'Khong co quyen dat ho' });
  }
  const userId = (bodyUserId && staff) ? bodyUserId : (req.user ? req.user.id : (bodyUserId || null));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Lock + lay gia variants (server-side, khong tin client)
    let subtotal = 0;
    const lines = [];
    for (const it of items) {
      const [[v]] = await conn.query('SELECT v.*, p.name product_name, p.id product_id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? FOR UPDATE', [it.variant_id]);
      if (!v || v.status !== 'active') throw new Error('Bien the ' + it.variant_id + ' khong kha dung');
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      // lock ton kho: lay warehouse co hang (uu tien warehouse dau tien du hang)
      const [stocks] = await conn.query('SELECT * FROM warehouse_stocks WHERE variant_id=? AND (quantity - reserved_quantity) >= ? ORDER BY quantity DESC LIMIT 1 FOR UPDATE', [v.id, qty]);
      if (!stocks.length) throw new Error('Het hang: ' + v.sku);
      const price = Number(v.price);
      subtotal += price * qty;
      lines.push({ v, qty, price, warehouse_id: stocks[0].warehouse_id });
    }

    // 2. Coupon
    let coupon = null;
    if (coupon_code) {
      const [[c]] = await conn.query('SELECT * FROM coupons WHERE code=?', [coupon_code]);
      if (!c) throw new Error('Ma giam gia khong ton tai');
      if (c.usage_limit && c.used_count >= c.usage_limit) throw new Error('Ma da het luot su dung');
      if (userId && c.usage_limit_per_user) {
        const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=? AND user_id=?', [c.id, userId]);
        if (n >= c.usage_limit_per_user) throw new Error('Ban da dung het luot cho ma nay');
      }
      coupon = c;
    }

    // 3. Shipping fee tu shipping_methods (default 30000)
    let shippingFee = 30000;
    let shippingMethodId = null;
    if (shipping_method_code) {
      const [[m]] = await conn.query("SELECT * FROM shipping_methods WHERE code=? AND is_active=1", [shipping_method_code]);
      if (m) { shippingFee = Number(m.base_fee); shippingMethodId = m.id; }
    }
    const { orderDiscount, shipDiscount } = calcCouponDiscount(coupon, subtotal, shippingFee);
    const shippingAfter = Math.max(0, shippingFee - shipDiscount);
    const total = Math.max(0, subtotal - orderDiscount + shippingAfter);

    // 4. Tao order
    const num = orderNumber();
    const [or] = await conn.query(`INSERT INTO orders (order_number,user_id,status,payment_status,fulfillment_status,currency,subtotal,item_discount_amount,order_discount_amount,shipping_discount_amount,shipping_fee,tax_amount,total_amount,customer_note,coupon_code,placed_at)
      VALUES (?,?, 'pending','unpaid','unfulfilled','VND', ?, 0, ?, ?, ?, 0, ?, ?, ?, NOW(6))`,
      [num, userId, subtotal, orderDiscount, shipDiscount, shippingAfter, total, customer_note || null, coupon_code || null]);
    const orderId = or.insertId;

    // 5. Order items snapshot + tru kho + movement
    for (const l of lines) {
      const lineTotal = l.price * l.qty;
      await conn.query(`INSERT INTO order_items (order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,sku_snapshot,unit_price,quantity,discount_amount,tax_amount,total_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [orderId, l.v.product_id, l.v.id, l.v.product_name, l.v.name, l.v.sku, l.price, l.qty, 0, 0, lineTotal]);
      await conn.query('UPDATE warehouse_stocks SET quantity = quantity - ?, reserved_quantity = reserved_quantity WHERE warehouse_id=? AND variant_id=?',
        [l.qty, l.warehouse_id, l.v.id]);
      await conn.query(`INSERT INTO stock_movements (warehouse_id,variant_id,type,quantity,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?)`,
        [l.warehouse_id, l.v.id, 'sale', -l.qty, 'order', orderId, 'Checkout ' + num, userId]);
    }

    // 6. Addresses snapshot
    const mkAddr = async (type, a) => {
      await conn.query(`INSERT INTO order_addresses (order_id,address_type,recipient_name,phone,email,province_code,province_name,district_code,district_name,ward_code,ward_name,address_line,postal_code)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [orderId, type, a.recipient_name, a.phone, a.email || null, a.province_code || null, a.province_name, a.district_code || null, a.district_name || null, a.ward_code || null, a.ward_name || null, a.address_line, a.postal_code || null]);
    };
    await mkAddr('shipping', shipping_address);
    await mkAddr('billing', billing_address || shipping_address);

    // 7. Payment mac dinh (pending)
    const [[pm]] = await conn.query('SELECT * FROM payment_methods WHERE code=?', [payment_method_code]);
    const pmId = pm ? pm.id : 1;
    const [payr] = await conn.query(`INSERT INTO payments (order_id,payment_method_id,status,amount,currency) VALUES (?,?, 'pending', ?, 'VND')`, [orderId, pmId, total]);
    await conn.query(`INSERT INTO payment_transactions (payment_id,transaction_type,status,amount) VALUES (?, 'charge', 'pending', ?)`, [payr.insertId, total]);
    if (payment_method_code === 'cod') {
      // COD: giu unpaid, tao shipment pending + cash_flow du kien? khong ghi cash_flow cho den khi thu tien
    }

    // 8. Coupon redemption
    if (coupon) {
      await conn.query('INSERT INTO coupon_redemptions (coupon_id,user_id,order_id,discount_amount) VALUES (?,?,?,?)', [coupon.id, userId, orderId, orderDiscount + shipDiscount]);
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id=?', [coupon.id]);
    }

    // 9. Shipment pending
    const [shr] = await conn.query(`INSERT INTO shipments (order_id,shipping_method_id,status,shipping_fee,cod_amount) VALUES (?,?, 'pending', ?, ?)`,
      [orderId, shippingMethodId, shippingAfter, payment_method_code === 'cod' ? total : 0]);
    const [ois] = await conn.query('SELECT id, quantity FROM order_items WHERE order_id=?', [orderId]);
    for (const oi of ois) await conn.query('INSERT INTO shipment_items (shipment_id,order_item_id,quantity) VALUES (?,?,?)', [shr.insertId, oi.id, oi.quantity]);

    await conn.query('INSERT INTO order_status_history (order_id,from_status,to_status,note,changed_by) VALUES (?,?,?,?,?)', [orderId, null, 'pending', 'Tao don', userId]);
    await conn.commit();
    const [[order]] = await pool.query('SELECT * FROM orders WHERE id=?', [orderId]);
    res.status(201).json({ ...order, payment_id: payr.insertId, shipment_id: shr.insertId });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally { conn.release(); }
});

// GET /api/orders/lookup — tra cứu đơn hàng cho khách CHƯA có tài khoản.
// Công khai, nhưng bắt buộc đủ 3 yếu tố: mã đơn + số điện thoại + ngày đặt.
// Chỉ trả về thông tin tối thiểu, không lộ dữ liệu người dùng khác.
const lookupHits = new Map();
router.get('/lookup', async (req, res) => {
  const orderNumberIn = String(req.query.order_number || '').trim();
  const phoneIn = String(req.query.phone || '').replace(/[^\d+]/g, '');
  const dateIn = String(req.query.date || '').trim();
  if (!orderNumberIn || !phoneIn || !dateIn)
    return res.status(400).json({ error: 'Vui long nhap ma don, so dien thoai va ngay dat hang' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIn))
    return res.status(400).json({ error: 'Ngay dat hang sai dinh dang' });
  if (orderNumberIn.length > 50 || phoneIn.length > 20)
    return res.status(400).json({ error: 'Thong tin tra cuu khong hop le' });

  // Chống dò số đơn: mỗi IP tối đa 20 lần / 10 phút
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const seen = (lookupHits.get(ip) || []).filter((t) => now - t < 600000);
  if (seen.length >= 20) return res.status(429).json({ error: 'Qua nhieu lan tra cuu. Vui long thu lai sau' });
  seen.push(now);
  lookupHits.set(ip, seen);

  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_status,
              o.subtotal, o.shipping_fee, o.total_amount, o.currency, o.placed_at, o.created_at,
              o.coupon_code,
              oa.recipient_name, oa.province_name, oa.district_name, oa.ward_name, oa.address_line
       FROM orders o
       JOIN order_addresses oa ON oa.order_id=o.id AND oa.address_type='shipping'
       WHERE o.order_number=? AND oa.phone=? AND DATE(COALESCE(o.placed_at,o.created_at))=?
       LIMIT 1`,
      [orderNumberIn, phoneIn, dateIn]);
    const o = rows[0];
    if (!o) return res.status(404).json({ error: 'Khong tim thay don hang. Kiem tra lai ma don, so dien thoai va ngay dat' });
    const [items] = await pool.query(
      `SELECT oi.quantity, oi.unit_price, oi.total_amount, oi.product_name_snapshot, p.slug product_slug
       FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`, [o.id]);
    const [track] = await pool.query(
      `SELECT s.status, s.tracking_number, ev.status ev_status, ev.description, ev.location, ev.occurred_at
       FROM shipments s
       LEFT JOIN shipment_tracking_events ev ON ev.shipment_id=s.id
       WHERE s.order_id=? ORDER BY ev.occurred_at DESC LIMIT 1`, [o.id]);
    res.json({
      order: {
        order_number: o.order_number,
        status: o.status,
        payment_status: o.payment_status,
        fulfillment_status: o.fulfillment_status,
        subtotal: o.subtotal,
        shipping_fee: o.shipping_fee,
        total_amount: o.total_amount,
        currency: o.currency,
        coupon_code: o.coupon_code,
        placed_at: o.placed_at || o.created_at,
        recipient_name: o.recipient_name,
        address: [o.address_line, o.ward_name, o.district_name, o.province_name].filter(Boolean).join(', '),
      },
      items: items.map((i) => ({ product_name: i.product_name_snapshot, product_slug: i.product_slug, quantity: i.quantity, unit_price: i.unit_price, total_amount: i.total_amount })),
      tracking: track[0] || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Khong tra cuu duoc. Vui long thu lai sau' });
  }
});

// GET /api/orders
router.get('/', authRequired, async (req, res) => {
  const { page, limit, offset } = paged(req);
  const { status, payment_status, search } = req.query;
  const isAdmin = req.user.roles.includes('super_admin') || req.user.permissions.includes('orders.read');
  const where = []; const p = [];
  if (!isAdmin) { where.push('o.user_id=?'); p.push(req.user.id); }
  if (status) { where.push('o.status=?'); p.push(status); }
  if (payment_status) { where.push('o.payment_status=?'); p.push(payment_status); }
  if (search) { where.push('o.order_number LIKE ?'); p.push(`%${search}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM orders o ${w}`, p);
  const [rows] = await pool.query(`SELECT o.* FROM orders o ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// GET /api/orders/:id
router.get('/:id', authRequired, async (req, res) => {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Khong tim thay' });
  const isAdmin = req.user.roles.includes('super_admin') || req.user.permissions.includes('orders.read');
  if (!isAdmin && String(o.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Khong co quyen' });
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  const [addrs] = await pool.query('SELECT * FROM order_addresses WHERE order_id=?', [o.id]);
  const [hist] = await pool.query('SELECT * FROM order_status_history WHERE order_id=? ORDER BY id', [o.id]);
  const [pays] = await pool.query('SELECT * FROM payments WHERE order_id=?', [o.id]);
  const [ships] = await pool.query('SELECT * FROM shipments WHERE order_id=?', [o.id]);
  const [notes] = await pool.query('SELECT * FROM order_notes WHERE order_id=? ORDER BY id', [o.id]);
  res.json({ ...o, items, addresses: addrs, history: hist, payments: pays, shipments: ships, notes });
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', authRequired, requirePerm('orders.write'), async (req, res) => {
  const { status, note } = req.body;
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Khong tim thay' });
  const allowed = VALID_TRANSITIONS[o.status] || [];
  if (!allowed.includes(status)) return res.status(400).json({ error: `Khong the chuyen ${o.status} -> ${status}. Cho phep: ${allowed.join(',') || 'none'}` });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE orders SET status=? WHERE id=?', [status, o.id]);
    await conn.query('INSERT INTO order_status_history (order_id,from_status,to_status,note,changed_by) VALUES (?,?,?,?,?)', [o.id, o.status, status, note || null, req.user.id]);
    if (status === 'delivered') await conn.query("UPDATE orders SET fulfillment_status='fulfilled' WHERE id=?", [o.id]);
    if (status === 'cancelled') {
      await conn.query('UPDATE orders SET cancelled_at=NOW(6) WHERE id=?', [o.id]);
      // hoan kho
      const [items] = await conn.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
      for (const it of items) {
        const [[st]] = await conn.query('SELECT warehouse_id FROM warehouse_stocks WHERE variant_id=? ORDER BY quantity DESC LIMIT 1', [it.variant_id]);
        const wid = st ? st.warehouse_id : 1;
        await conn.query(`INSERT INTO warehouse_stocks (warehouse_id,variant_id,quantity,reserved_quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity+?`, [wid, it.variant_id, it.quantity, it.quantity]);
        await conn.query(`INSERT INTO stock_movements (warehouse_id,variant_id,type,quantity,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?)`, [wid, it.variant_id, 'return', it.quantity, 'order', o.id, 'Huy don ' + o.order_number]);
      }
    }
    if (status === 'completed') await conn.query('UPDATE orders SET completed_at=NOW(6) WHERE id=?', [o.id]);
    await conn.commit();
    await logAudit({ actor_user_id: req.user.id, action: 'orders.status', entity_type: 'order', entity_id: o.id, old_values: { status: o.status }, new_values: { status }, req });
    const [[row]] = await pool.query('SELECT * FROM orders WHERE id=?', [o.id]);
    res.json(row);
  } catch (e) { await conn.rollback(); res.status(500).json({ error: e.message }); } finally { conn.release(); }
});

// POST /api/orders/:id/cancel (customer tu huy khi pending/confirmed)
router.post('/:id/cancel', authRequired, async (req, res) => {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Khong tim thay' });
  const isAdmin = req.user.roles.includes('super_admin') || req.user.permissions.includes('orders.write');
  if (!isAdmin && String(o.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Khong co quyen' });
  if (!['pending', 'confirmed'].includes(o.status)) return res.status(400).json({ error: 'Chi huy duoc don pending/confirmed' });
  await pool.query("UPDATE orders SET status='cancelled', cancelled_at=NOW(6) WHERE id=?", [o.id]);
  await pool.query('INSERT INTO order_status_history (order_id,from_status,to_status,note,changed_by) VALUES (?,?,?,?,?)', [o.id, o.status, 'cancelled', req.body?.note || 'Khach huy', req.user.id]);
  res.json({ ok: true });
});

// Notes
router.post('/:id/notes', authRequired, async (req, res) => {
  const { note, is_internal = true } = req.body;
  if (!note) return res.status(400).json({ error: 'Thieu note' });
  const [r] = await pool.query('INSERT INTO order_notes (order_id,author_user_id,note,is_internal) VALUES (?,?,?,?)', [req.params.id, req.user.id, note, !!is_internal]);
  const [[row]] = await pool.query('SELECT * FROM order_notes WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});

module.exports = router;
