const express = require('express');
const { pool } = require('../config/db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

async function getOrCreateCart({ user_id, session_id }) {
  if (user_id) {
    const [[c]] = await pool.query("SELECT * FROM carts WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", [user_id]);
    if (c) return c;
    const [r] = await pool.query("INSERT INTO carts (user_id, session_id, status) VALUES (?,?,'active')", [user_id, session_id || null]);
    const [[row]] = await pool.query('SELECT * FROM carts WHERE id=?', [r.insertId]);
    return row;
  }
  if (!session_id) throw new Error('Can session_id cho khach vang lai');
  const [[c]] = await pool.query('SELECT * FROM carts WHERE session_id=? AND status=?', [session_id, 'active']);
  if (c) return c;
  const [r] = await pool.query("INSERT INTO carts (session_id, status) VALUES (?,'active')", [session_id]);
  const [[row]] = await pool.query('SELECT * FROM carts WHERE id=?', [r.insertId]);
  return row;
}

async function cartDetail(cartId) {
  const [[cart]] = await pool.query('SELECT * FROM carts WHERE id=?', [cartId]);
  if (!cart) return null;
  const [items] = await pool.query(`SELECT ci.*, v.sku, v.name variant_name, v.price, p.name product_name, p.id product_id
    FROM cart_items ci JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id WHERE ci.cart_id=?`, [cartId]);
  const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  return { ...cart, items, subtotal };
}

// GET /api/cart?session_id=
router.get('/', authOptional, async (req, res) => {
  try {
    const user_id = req.user ? req.user.id : null;
    const session_id = req.query.session_id || req.body.session_id || null;
    const cart = await getOrCreateCart({ user_id, session_id });
    res.json(await cartDetail(cart.id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/cart/items {variant_id, quantity, session_id?}
router.post('/items', authOptional, async (req, res) => {
  const { variant_id, quantity = 1, session_id } = req.body;
  if (!variant_id) return res.status(400).json({ error: 'Thieu variant_id' });
  try {
    const user_id = req.user ? req.user.id : null;
    const cart = await getOrCreateCart({ user_id, session_id });
    const [[v]] = await pool.query("SELECT * FROM product_variants WHERE id=? AND status='active'", [variant_id]);
    if (!v) return res.status(404).json({ error: 'Bien the khong ton tai' });
    await pool.query(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`, [cart.id, variant_id, Math.max(1, quantity)]);
    res.status(201).json(await cartDetail(cart.id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/cart/items/:itemId {quantity}
router.put('/items/:itemId', authOptional, async (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity < 1) return res.status(400).json({ error: 'quantity >= 1' });
  await pool.query('UPDATE cart_items SET quantity=? WHERE id=?', [quantity, req.params.itemId]);
  const [[it]] = await pool.query('SELECT * FROM cart_items WHERE id=?', [req.params.itemId]);
  if (!it) return res.status(404).json({ error: 'Khong tim thay' });
  res.json(await cartDetail(it.cart_id));
});

// DELETE /api/cart/items/:itemId
router.delete('/items/:itemId', async (req, res) => {
  const [[it]] = await pool.query('SELECT * FROM cart_items WHERE id=?', [req.params.itemId]);
  if (!it) return res.status(404).json({ error: 'Khong tim thay' });
  await pool.query('DELETE FROM cart_items WHERE id=?', [it.id]);
  res.json(await cartDetail(it.cart_id));
});

// DELETE /api/cart?session_id=  (xoa trang)
router.delete('/', authOptional, async (req, res) => {
  const user_id = req.user ? req.user.id : null;
  const session_id = req.query.session_id || null;
  const cart = await getOrCreateCart({ user_id, session_id });
  await pool.query('DELETE FROM cart_items WHERE cart_id=?', [cart.id]);
  res.json({ ok: true });
});

// Wishlist (can dang nhap)
router.get('/wishlist', authRequired, async (req, res) => {
  let [wl] = await pool.query('SELECT * FROM wishlists WHERE user_id=?', [req.user.id]);
  if (!wl.length) {
    await pool.query('INSERT INTO wishlists (user_id, name) VALUES (?,?)', [req.user.id, 'Yêu thích']);
    [wl] = await pool.query('SELECT * FROM wishlists WHERE user_id=?', [req.user.id]);
  }
  const [items] = await pool.query(`SELECT wi.*, p.name, p.slug, p.base_price FROM wishlist_items wi JOIN products p ON p.id=wi.product_id WHERE wi.wishlist_id=?`, [wl[0].id]);
  res.json({ ...wl[0], items });
});
router.post('/wishlist/items', authRequired, async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Thieu product_id' });
  const [[wl]] = await pool.query('SELECT * FROM wishlists WHERE user_id=? LIMIT 1', [req.user.id]);
  let wid = wl?.id;
  if (!wid) { const [r] = await pool.query('INSERT INTO wishlists (user_id) VALUES (?)', [req.user.id]); wid = r.insertId; }
  await pool.query('INSERT IGNORE INTO wishlist_items (wishlist_id, product_id) VALUES (?,?)', [wid, product_id]);
  res.status(201).json({ ok: true });
});
router.delete('/wishlist/items/:productId', authRequired, async (req, res) => {
  const [[wl]] = await pool.query('SELECT * FROM wishlists WHERE user_id=? LIMIT 1', [req.user.id]);
  if (wl) await pool.query('DELETE FROM wishlist_items WHERE wishlist_id=? AND product_id=?', [wl.id, req.params.productId]);
  res.json({ ok: true });
});

module.exports = router;
