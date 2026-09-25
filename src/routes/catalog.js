const express = require('express');
const { pool } = require('../config/db');
const { authRequired, authOptional, requirePerm, logAudit } = require('../middleware/auth');
const { slugify, paged } = require('../utils/helpers');

const router = express.Router();

// ---------- BRANDS ----------
router.get('/brands', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM brands ORDER BY id DESC');
  res.json(rows);
});
router.post('/brands', authRequired, requirePerm('products.write'), async (req, res) => {
  const { name, description, logo_media_id, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Thieu name' });
  const slug = slugify(req.body.slug || name);
  try {
    const [r] = await pool.query('INSERT INTO brands (name, slug, description, logo_media_id, status) VALUES (?,?,?,?,?)',
      [name, slug, description || null, logo_media_id || null, status || 'active']);
    const [[row]] = await pool.query('SELECT * FROM brands WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/brands/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[b]] = await pool.query('SELECT * FROM brands WHERE id=?', [req.params.id]);
  if (!b) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...b, ...req.body };
  await pool.query('UPDATE brands SET name=?,slug=?,description=?,logo_media_id=?,status=? WHERE id=?',
    [f.name, f.slug, f.description, f.logo_media_id, f.status, b.id]);
  const [[row]] = await pool.query('SELECT * FROM brands WHERE id=?', [b.id]);
  res.json(row);
});
router.delete('/brands/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  await pool.query("UPDATE brands SET status='inactive' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ---------- CATEGORIES ----------
router.get('/categories', async (req, res) => {
  const [rows] = await pool.query(`SELECT c.*, m.object_key image_key FROM categories c
    LEFT JOIN media_files m ON m.id = c.image_media_id ORDER BY c.sort_order, c.id`);
  res.json(rows);
});
router.get('/categories/tree', async (req, res) => {
  const [rows] = await pool.query(`SELECT c.*, m.object_key image_key FROM categories c
    LEFT JOIN media_files m ON m.id = c.image_media_id
    WHERE c.status='active' ORDER BY c.sort_order, c.id`);
  const map = {}; rows.forEach(r => { r.children = []; map[r.id] = r; });
  const roots = [];
  rows.forEach(r => { if (r.parent_id && map[r.parent_id]) map[r.parent_id].children.push(r); else roots.push(r); });
  res.json(roots);
});
router.post('/categories', authRequired, requirePerm('categories.write'), async (req, res) => {
  const { parent_id, name, description, image_media_id, icon, sort_order, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Thieu name' });
  const slug = slugify(req.body.slug || name);
  const [r] = await pool.query('INSERT INTO categories (parent_id,name,slug,description,image_media_id,icon,sort_order,status) VALUES (?,?,?,?,?,?,?,?)',
    [parent_id || null, name, slug, description || null, image_media_id || null, icon || null, sort_order || 0, status || 'active']);
  const [[row]] = await pool.query('SELECT * FROM categories WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/categories/:id', authRequired, requirePerm('categories.write'), async (req, res) => {
  const [[c]] = await pool.query('SELECT * FROM categories WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...c, ...req.body };
  await pool.query('UPDATE categories SET parent_id=?,name=?,slug=?,description=?,image_media_id=?,icon=?,sort_order=?,status=? WHERE id=?',
    [f.parent_id, f.name, f.slug, f.description, f.image_media_id, f.icon || null, f.sort_order, f.status, c.id]);
  const [[row]] = await pool.query('SELECT * FROM categories WHERE id=?', [c.id]);
  res.json(row);
});
router.delete('/categories/:id', authRequired, requirePerm('categories.write'), async (req, res) => {
  await pool.query("UPDATE categories SET status='inactive' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ---------- PRODUCTS ----------
router.get('/products', authOptional, async (req, res) => {
  const { page, limit, offset } = paged(req);
  const { search = '', category_id, brand_id, status } = req.query;
  const where = []; const p = [];
  const isAdmin = req.user && (req.user.roles.includes('super_admin') || req.user.permissions.includes('products.write'));
  if (search) { where.push('(pr.name LIKE ? OR pr.sku LIKE ?)'); p.push(`%${search}%`, `%${search}%`); }
  if (brand_id) { where.push('pr.brand_id=?'); p.push(brand_id); }
  if (status && isAdmin) { where.push('pr.status=?'); p.push(status); }
  else if (!isAdmin) { where.push("pr.status='active'"); }
  if (category_id) { where.push('EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id=pr.id AND pc.category_id=?)'); p.push(category_id); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM products pr ${w}`, p);
  const [rows] = await pool.query(`SELECT pr.*, b.name brand_name,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('id',pi.id,'media_id',pi.media_id,'is_primary',pi.is_primary,'sort_order',pi.sort_order,'object_key',mf.object_key)) FROM product_images pi LEFT JOIN media_files mf ON mf.id=pi.media_id WHERE pi.product_id=pr.id) images,
    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id=pr.id) variant_count
    FROM products pr LEFT JOIN brands b ON b.id=pr.brand_id ${w} ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/products/slug/:slug', async (req, res) => {
  const [[pr]] = await pool.query('SELECT pr.*, b.name brand_name FROM products pr LEFT JOIN brands b ON b.id=pr.brand_id WHERE pr.slug=?', [req.params.slug]);
  if (!pr) return res.status(404).json({ error: 'Khong tim thay' });
  const [variants] = await pool.query(`SELECT v.*, (SELECT COALESCE(SUM(ws.quantity - ws.reserved_quantity),0) FROM warehouse_stocks ws WHERE ws.variant_id=v.id) available_qty FROM product_variants v WHERE v.product_id=?`, [pr.id]);
  const [images] = await pool.query(`SELECT pi.*, mf.object_key, mf.mime_type FROM product_images pi
    LEFT JOIN media_files mf ON mf.id=pi.media_id WHERE pi.product_id=? ORDER BY is_primary DESC, sort_order`, [pr.id]);
  const [cats] = await pool.query('SELECT c.* FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=?', [pr.id]);
  const [reviews] = await pool.query("SELECT COUNT(*) c, AVG(rating) avg_rating FROM reviews WHERE product_id=? AND status='published'", [pr.id]);
  res.json({ ...pr, variants, images, categories: cats, review_summary: reviews[0] });
});

router.get('/products/:id', async (req, res) => {
  const [[pr]] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!pr) return res.status(404).json({ error: 'Khong tim thay' });
  const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id=?', [pr.id]);
  const [images] = await pool.query(`SELECT pi.*, mf.object_key, mf.mime_type FROM product_images pi
    LEFT JOIN media_files mf ON mf.id=pi.media_id WHERE pi.product_id=? ORDER BY sort_order`, [pr.id]);
  const [cats] = await pool.query('SELECT c.* FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=?', [pr.id]);
  res.json({ ...pr, variants, images, categories: cats });
});

router.post('/products', authRequired, requirePerm('products.write'), async (req, res) => {
  const { brand_id, name, description, short_description, product_type, status, base_price, compare_at_price, cost_price, sku, barcode, weight_grams, tax_class, seo_title, seo_description, category_ids } = req.body;
  if (!name || base_price === undefined) return res.status(400).json({ error: 'Thieu name/base_price' });
  const slug = slugify(req.body.slug || name);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(`INSERT INTO products (brand_id,name,slug,description,short_description,product_type,status,base_price,compare_at_price,cost_price,sku,barcode,weight_grams,tax_class,seo_title,seo_description,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [brand_id || null, name, slug, description || null, short_description || null, product_type || 'physical', status || 'draft', base_price, compare_at_price || null, cost_price || null, sku || null, barcode || null, weight_grams || null, tax_class || null, seo_title || null, seo_description || null, status === 'active' ? new Date() : null]);
    const pid = r.insertId;
    if (Array.isArray(category_ids)) for (const [i, cid] of category_ids.entries())
      await conn.query('INSERT IGNORE INTO product_categories (product_id, category_id, is_primary) VALUES (?,?,?)', [pid, cid, i === 0]);
    await conn.commit();
    await logAudit({ actor_user_id: req.user.id, action: 'products.create', entity_type: 'product', entity_id: pid, new_values: req.body, req });
    const [[row]] = await pool.query('SELECT * FROM products WHERE id=?', [pid]);
    res.status(201).json(row);
  } catch (e) { await conn.rollback(); res.status(400).json({ error: e.message }); } finally { conn.release(); }
});

router.put('/products/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[pr]] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!pr) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...pr, ...req.body };
  try {
    await pool.query(`UPDATE products SET brand_id=?,name=?,slug=?,description=?,short_description=?,product_type=?,status=?,base_price=?,compare_at_price=?,cost_price=?,sku=?,barcode=?,weight_grams=?,tax_class=?,seo_title=?,seo_description=? WHERE id=?`,
      [f.brand_id, f.name, f.slug, f.description, f.short_description, f.product_type, f.status, f.base_price, f.compare_at_price, f.cost_price, f.sku, f.barcode, f.weight_grams, f.tax_class, f.seo_title, f.seo_description, pr.id]);
    if (Array.isArray(req.body.category_ids)) {
      await pool.query('DELETE FROM product_categories WHERE product_id=?', [pr.id]);
      for (const [i, cid] of req.body.category_ids.entries())
        await pool.query('INSERT IGNORE INTO product_categories (product_id, category_id, is_primary) VALUES (?,?,?)', [pr.id, cid, i === 0]);
    }
    const [[row]] = await pool.query('SELECT * FROM products WHERE id=?', [pr.id]);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const PRODUCT_STATUS = ['draft', 'active', 'inactive', 'archived'];
router.patch('/products/:id/status', authRequired, requirePerm('products.write'), async (req, res) => {
  const status = req.body?.status;
  if (!PRODUCT_STATUS.includes(status)) return res.status(400).json({ error: 'Trang thai khong hop le' });
  const [[pr]] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!pr) return res.status(404).json({ error: 'Khong tim thay' });
  const shown = status === 'active' || status === 'draft';
  await pool.query(
    `UPDATE products SET status=?, deleted_at=${shown ? 'NULL' : 'COALESCE(deleted_at,NOW(6))'},
     published_at=${status === 'active' ? 'COALESCE(published_at,NOW(6))' : 'published_at'} WHERE id=?`,
    [status, pr.id]);
  const [[row]] = await pool.query('SELECT * FROM products WHERE id=?', [pr.id]);
  res.json(row);
});
router.delete('/products/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[pr]] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!pr) return res.status(404).json({ error: 'Khong tim thay' });
  await pool.query("UPDATE products SET status='archived', deleted_at=NOW(6) WHERE id=?", [pr.id]);
  res.json({ ok: true, soft: true });
});
router.delete('/products/:id/permanent', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[pr]] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!pr) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) n FROM order_items WHERE product_id=? AND EXISTS (SELECT 1 FROM orders WHERE orders.id=order_items.order_id AND orders.status NOT IN (\'cancelled\',\'returned\',\'refunded\'))',
    [pr.id]);
  if (req.query.force !== '1' && n > 0)
    return res.status(409).json({ error: `San pham da co ${n} don hinh thinh. Chi xoa an (archive) hoac them ?force=1`, can_force: true, order_count: n });
  const [[{ n: oi }]] = await pool.query('SELECT COUNT(*) n FROM order_items WHERE product_id=?', [pr.id]);
  await pool.query('DELETE FROM products WHERE id=?', [pr.id]);
  res.json({ ok: true, soft: false, detached_order_items: oi });
});

// ---------- VARIANTS ----------
router.post('/products/:id/variants', authRequired, requirePerm('products.write'), async (req, res) => {
  const { sku, barcode, name, price, compare_at_price, cost_price, weight_grams, status, attribute_value_ids } = req.body;
  if (!sku || price === undefined) return res.status(400).json({ error: 'Thieu sku/price' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(`INSERT INTO product_variants (product_id,sku,barcode,name,price,compare_at_price,cost_price,weight_grams,status) VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.params.id, sku, barcode || null, name || null, price, compare_at_price || null, cost_price || null, weight_grams || null, status || 'active']);
    if (Array.isArray(attribute_value_ids)) for (const avid of attribute_value_ids)
      await conn.query('INSERT IGNORE INTO variant_attribute_values (variant_id, attribute_value_id) VALUES (?,?)', [r.insertId, avid]);
    await conn.commit();
    const [[row]] = await pool.query('SELECT * FROM product_variants WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { await conn.rollback(); res.status(400).json({ error: e.message }); } finally { conn.release(); }
});
router.put('/variants/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[v]] = await pool.query('SELECT * FROM product_variants WHERE id=?', [req.params.id]);
  if (!v) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...v, ...req.body };
  await pool.query('UPDATE product_variants SET sku=?,barcode=?,name=?,price=?,compare_at_price=?,cost_price=?,weight_grams=?,status=? WHERE id=?',
    [f.sku, f.barcode, f.name, f.price, f.compare_at_price, f.cost_price, f.weight_grams, f.status, v.id]);
  const [[row]] = await pool.query('SELECT * FROM product_variants WHERE id=?', [v.id]);
  res.json(row);
});
router.delete('/variants/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  await pool.query("UPDATE product_variants SET status='inactive' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ---------- ATTRIBUTES ----------
router.get('/attributes', async (req, res) => {
  const [attrs] = await pool.query('SELECT * FROM attributes ORDER BY sort_order');
  const [vals] = await pool.query('SELECT * FROM attribute_values ORDER BY attribute_id, sort_order');
  res.json(attrs.map(a => ({ ...a, values: vals.filter(v => v.attribute_id === a.id) })));
});
router.post('/attributes', authRequired, requirePerm('products.write'), async (req, res) => {
  const { name, code, display_type, sort_order } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Thieu name/code' });
  const [r] = await pool.query('INSERT INTO attributes (name,code,display_type,sort_order) VALUES (?,?,?,?)', [name, code, display_type || 'text', sort_order || 0]);
  const [[row]] = await pool.query('SELECT * FROM attributes WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.post('/attributes/:id/values', authRequired, requirePerm('products.write'), async (req, res) => {
  const { value, display_value, color_hex, image_media_id, sort_order } = req.body;
  if (!value) return res.status(400).json({ error: 'Thieu value' });
  const [r] = await pool.query('INSERT INTO attribute_values (attribute_id,value,display_value,color_hex,image_media_id,sort_order) VALUES (?,?,?,?,?,?)',
    [req.params.id, value, display_value || null, color_hex || null, image_media_id || null, sort_order || 0]);
  const [[row]] = await pool.query('SELECT * FROM attribute_values WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/attributes/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[a]] = await pool.query('SELECT * FROM attributes WHERE id=?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...a, ...req.body };
  if (!f.name || !f.code) return res.status(400).json({ error: 'Thieu name/code' });
  try {
    await pool.query('UPDATE attributes SET name=?,code=?,display_type=?,sort_order=? WHERE id=?',
      [f.name, f.code, f.display_type || 'text', f.sort_order || 0, a.id]);
    const [[row]] = await pool.query('SELECT * FROM attributes WHERE id=?', [a.id]);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/attributes/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[a]] = await pool.query('SELECT * FROM attributes WHERE id=?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM product_attributes WHERE attribute_id=?', [a.id]);
  await pool.query('DELETE FROM attributes WHERE id=?', [a.id]);
  res.json({ ok: true, removed_values: true, affected_products: n });
});
router.put('/attribute-values/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[v]] = await pool.query('SELECT * FROM attribute_values WHERE id=?', [req.params.id]);
  if (!v) return res.status(404).json({ error: 'Khong tim thay' });
  const f = { ...v, ...req.body };
  if (!f.value) return res.status(400).json({ error: 'Thieu value' });
  try {
    await pool.query('UPDATE attribute_values SET value=?,display_value=?,color_hex=?,image_media_id=?,sort_order=? WHERE id=?',
      [f.value, f.display_value || null, f.color_hex || null, f.image_media_id || null, f.sort_order || 0, v.id]);
    const [[row]] = await pool.query('SELECT * FROM attribute_values WHERE id=?', [v.id]);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/attribute-values/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[v]] = await pool.query('SELECT * FROM attribute_values WHERE id=?', [req.params.id]);
  if (!v) return res.status(404).json({ error: 'Khong tim thay' });
  await pool.query('DELETE FROM attribute_values WHERE id=?', [v.id]);
  res.json({ ok: true });
});

// ---------- PRODUCT IMAGES / MEDIA ----------
router.post('/products/:id/images', authRequired, requirePerm('products.write'), async (req, res) => {
  const { media_id, variant_id, sort_order, is_primary, alt_text } = req.body;
  if (!media_id) return res.status(400).json({ error: 'Thieu media_id' });
  const [r] = await pool.query('INSERT INTO product_images (product_id,variant_id,media_id,sort_order,is_primary,alt_text) VALUES (?,?,?,?,?,?)',
    [req.params.id, variant_id || null, media_id, sort_order || 0, !!is_primary, alt_text || null]);
  const [[row]] = await pool.query('SELECT * FROM product_images WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});
router.put('/product-images/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  const [[im]] = await pool.query('SELECT * FROM product_images WHERE id=?', [req.params.id]);
  if (!im) return res.status(404).json({ error: 'Khong tim thay' });
  const { sort_order, is_primary, alt_text, variant_id } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (is_primary) await conn.query('UPDATE product_images SET is_primary=FALSE WHERE product_id=?', [im.product_id]);
    await conn.query('UPDATE product_images SET sort_order=COALESCE(?,sort_order), is_primary=COALESCE(?,is_primary), alt_text=COALESCE(?,alt_text), variant_id=COALESCE(?,variant_id) WHERE id=?',
      [sort_order ?? null, is_primary !== undefined ? !!is_primary : null, alt_text !== undefined ? alt_text : null, variant_id !== undefined ? variant_id : null, im.id]);
    await conn.commit();
    const [[row]] = await pool.query('SELECT * FROM product_images WHERE id=?', [im.id]);
    res.json(row);
  } catch (e) { await conn.rollback(); res.status(400).json({ error: e.message }); } finally { conn.release(); }
});
router.delete('/product-images/:id', authRequired, requirePerm('products.write'), async (req, res) => {
  await pool.query('DELETE FROM product_images WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
router.get('/media', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM media_files ORDER BY id DESC LIMIT 100');
  res.json(rows);
});
router.post('/media', authRequired, requirePerm('products.write'), async (req, res) => {
  const { storage_provider, object_key, original_name, mime_type, size_bytes } = req.body;
  if (!object_key) return res.status(400).json({ error: 'Thieu object_key' });
  const [r] = await pool.query('INSERT INTO media_files (owner_user_id,storage_provider,object_key,original_name,mime_type,size_bytes) VALUES (?,?,?,?,?,?)',
    [req.user.id, storage_provider || 'local', object_key, original_name || null, mime_type || null, size_bytes || null]);
  const [[row]] = await pool.query('SELECT * FROM media_files WHERE id=?', [r.insertId]);
  res.status(201).json(row);
});

module.exports = router;
