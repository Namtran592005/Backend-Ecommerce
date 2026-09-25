// Nap du lieu DEMO chuan cho toan he thong (xoa het du lieu cu tru RBAC/seed goc).
// Chay: npm run db:seed-demo (local) hoac trong container backend.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const storage = require('../src/config/storage');
const { productArt, bannerArt, categoryArt } = require('./demo-art');

const q = (sql, p) => pool.query(sql, p || []);

const WIPE = ['review_votes', 'review_images', 'reviews', 'return_status_history', 'return_items', 'returns',
  'coupon_redemptions', 'promotion_products', 'promotion_variants', 'promotion_categories', 'coupons', 'promotions',
  'shipment_tracking_events', 'shipment_items', 'shipments', 'refund_items', 'refunds', 'payment_transactions', 'payments',
  'order_notes', 'order_status_history', 'order_addresses', 'order_items', 'orders', 'invoice_items', 'invoices', 'cash_flows',
  'cart_items', 'carts', 'wishlist_items', 'wishlists', 'stock_reservations', 'stock_movements', 'warehouse_stocks',
  'warehouses', 'warehouse_transfers', 'inventory_adjustment_items', 'inventory_adjustments', 'variant_attribute_values',
  'product_attributes', 'product_images', 'product_categories', 'product_variants', 'products',
  'attribute_values', 'attributes', 'categories', 'brands', 'media_files', 'notifications', 'notification_preferences',
  'user_sessions', 'user_roles', 'user_addresses', 'user_profiles', 'users', 'audit_logs', 'admin_activity_logs',
  'campaign_products', 'campaigns', 'banners', 'shipping_methods'];

const PALETTES = {
  blue: { bg1: '#e0f2fe', bg2: '#dbeafe', main: '#0b3d9e', main2: '#2f7fd0' },
  navy: { bg1: '#e2e8f0', bg2: '#cbd5e1', main: '#1e293b', main2: '#475569' },
  rose: { bg1: '#ffe4e6', bg2: '#fecdd3', main: '#9f1239', main2: '#fb7185' },
  amber: { bg1: '#fef3c7', bg2: '#fde68a', main: '#b45309', main2: '#f59e0b' },
  green: { bg1: '#dcfce7', bg2: '#bbf7d0', main: '#166534', main2: '#22c55e' },
  violet: { bg1: '#ede9fe', bg2: '#ddd6fe', main: '#5b21b6', main2: '#8b5cf6' },
  teal: { bg1: '#ccfbf1', bg2: '#99f6e4', main: '#115e59', main2: '#14b8a6' },
  slate: { bg1: '#f1f5f9', bg2: '#e2e8f0', main: '#334155', main2: '#64748b' },
};

const ART = {
  aoThun: { kind: 'tshirt', p: PALETTES.blue },
  aoKhoac: { kind: 'tshirt', p: PALETTES.navy },
  aoSo: { kind: 'tshirt', p: PALETTES.violet },
  quanJeans: { kind: 'jeans', p: PALETTES.navy },
  quanTay: { kind: 'jeans', p: PALETTES.slate },
  vay: { kind: 'dress', p: PALETTES.rose },
  giay: { kind: 'shoe', p: PALETTES.blue },
  dep: { kind: 'shoe', p: PALETTES.rose },
  balo: { kind: 'bag', p: PALETTES.green },
  tui: { kind: 'bag', p: PALETTES.amber },
  noi: { kind: 'pot', p: PALETTES.slate },
  chai: { kind: 'pot', p: PALETTES.teal },
  den: { kind: 'lamp', p: PALETTES.amber },
  quat: { kind: 'lamp', p: PALETTES.blue },
  taiNghe: { kind: 'headphone', p: PALETTES.navy },
  sac: { kind: 'phone', p: PALETTES.violet },
  dongHo: { kind: 'watch', p: PALETTES.slate },
  dienThoai: { kind: 'phone', p: PALETTES.blue },
  co: { kind: 'mug', p: PALETTES.green },
  ghe: { kind: 'chair', p: PALETTES.amber },
};

async function putArt(key, svg) {  const buf = Buffer.from(svg, 'utf8');
  await storage.putObject(key, buf, 'image/svg+xml');
  const [r] = await q(`INSERT INTO media_files (storage_provider, object_key, original_name, mime_type, size_bytes)
    VALUES ('minio',?,?,'image/svg+xml',?)`, [key, key.split('/').pop(), buf.length]);
  return r.insertId;
}

async function createUser({ email, phone, pw, role, first, last, addr, gender = 'unknown' }) {
  const hash = await bcrypt.hash(pw, 10);
  const [r] = await q("INSERT INTO users (email, phone, password_hash, status, email_verified_at, last_login_at) VALUES (?,?,?,'active',NOW(6),DATE_SUB(NOW(6), INTERVAL ? HOUR))",
    [email || null, phone || null, hash, Math.floor(Math.random() * 72)]);
  const uid = r.insertId;
  await q('INSERT INTO user_profiles (user_id, first_name, last_name, display_name, gender, marketing_opt_in) VALUES (?,?,?,?,?,?)',
    [uid, first || null, last || null, [first, last].filter(Boolean).join(' ') || email || phone, gender, Math.random() > 0.5]);
  const [[rl]] = await q('SELECT id FROM roles WHERE code=?', [role]);
  await q('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [uid, rl.id]);
  if (addr) {
    await q(`INSERT INTO user_addresses (user_id, label, recipient_name, phone, province_name, district_name, ward_name, address_line, is_default)
      VALUES (?,?,?,?,?,?,?,?,TRUE)`,
      [uid, addr.label || 'Nhà', addr.name, addr.phone, addr.province, addr.district || null, addr.ward || null, addr.line]);
  }
  return uid;
}

async function createOrder({ num, userId, status, payStatus, payCode, items, coupon, shipCode, shipFee, note, daysAgo, address }) {
  let subtotal = 0;
  const lines = [];
  for (const it of items) {
    const [[v]] = await q('SELECT v.*, p.name product_name, p.id product_id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?', [it.variantId]);
    const line = v.price * it.qty;
    subtotal += line;
    lines.push({ v, qty: it.qty, line });
  }
  let orderDiscount = 0;
  if (coupon) {
    const [[c]] = await q('SELECT * FROM coupons WHERE code=?', [coupon]);
    if (c.type === 'percentage') orderDiscount = Math.min(subtotal * Number(c.value) / 100, Number(c.maximum_discount_amount || 1e15));
    else if (c.type === 'fixed') orderDiscount = Math.min(Number(c.value), subtotal);
  }
  const total = Math.max(0, subtotal - orderDiscount + shipFee);
  const [or] = await q(`INSERT INTO orders (order_number, user_id, status, payment_status, fulfillment_status, currency,
      subtotal, item_discount_amount, order_discount_amount, shipping_discount_amount, shipping_fee, tax_amount, total_amount,
      customer_note, coupon_code, placed_at, created_at)
    VALUES (?,?,?,?,'unfulfilled','VND', ?,0,?,0,?,0,?, ?,?, DATE_SUB(NOW(6), INTERVAL ? DAY), DATE_SUB(NOW(6), INTERVAL ? DAY))`,
    [num, userId, status, payStatus, subtotal, orderDiscount, shipFee, total, note || null, coupon || null, daysAgo, daysAgo]);
  const oid = or.insertId;
  for (const l of lines) {
    await q(`INSERT INTO order_items (order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
      sku_snapshot, unit_price, quantity, discount_amount, tax_amount, total_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [oid, l.v.product_id, l.v.id, l.v.product_name, l.v.name, l.v.sku, l.v.price, l.qty, 0, 0, l.line]);
    if (status !== 'cancelled') {
      await q('UPDATE warehouse_stocks SET quantity = quantity - ? WHERE warehouse_id=1 AND variant_id=?', [l.qty, l.v.id]);
      await q(`INSERT INTO stock_movements (warehouse_id, variant_id, type, quantity, reference_type, reference_id, note)
        VALUES (1,?,'sale',?,?,?,?)`, [l.v.id, -l.qty, 'order', oid, 'Ban hang ' + num]);
    }
  }
  for (const type of ['shipping', 'billing']) {
    await q(`INSERT INTO order_addresses (order_id, address_type, recipient_name, phone, email, province_name, district_name, ward_name, address_line)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [oid, type, address.name, address.phone, address.email || null, address.province, address.district || null, address.ward || null, address.line]);
  }
  const flow = { pending: [], confirmed: ['confirmed'], processing: ['confirmed', 'processing'], shipping: ['confirmed', 'processing', 'packed', 'shipping'], delivered: ['confirmed', 'processing', 'packed', 'shipping', 'delivered'], completed: ['confirmed', 'processing', 'packed', 'shipping', 'delivered', 'completed'], cancelled: ['cancelled'] };
  let prev = null;
  await q('INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?,?,?,?)', [oid, null, 'pending', 'Tao don']);
  for (const s of flow[status] || []) {
    await q('INSERT INTO order_status_history (order_id, from_status, to_status) VALUES (?,?,?)', [oid, prev || 'pending', s]);
    prev = s;
  }
  const [[pm]] = await q('SELECT id FROM payment_methods WHERE code=?', [payCode]);
  const paid = payStatus === 'paid';
  const [py] = await q(`INSERT INTO payments (order_id, payment_method_id, status, amount, currency, paid_at)
    VALUES (?,?,?,?,'VND',${paid ? 'DATE_SUB(NOW(6), INTERVAL ? DAY)' : 'NULL'})`, paid ? [oid, pm.id, 'paid', total, daysAgo] : [oid, pm.id, 'pending', total]);
  await q(`INSERT INTO payment_transactions (payment_id, transaction_type, status, amount, processed_at)
    VALUES (?, 'charge', ?, ?, ${paid ? 'DATE_SUB(NOW(6), INTERVAL ? DAY)' : 'NULL'})`, paid ? [py.insertId, 'success', total, daysAgo] : [py.insertId, 'pending', total]);
  if (paid) await q(`INSERT INTO cash_flows (type, reference_type, reference_id, amount, currency, description, occurred_at)
    VALUES ('income','order',?,?,'VND',?,DATE_SUB(NOW(6), INTERVAL ? DAY))`, [oid, total, 'Thu tien don ' + num, daysAgo]);
  if (coupon && status !== 'cancelled') {
    const [[c]] = await q('SELECT id FROM coupons WHERE code=?', [coupon]);
    await q('INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?,?,?,?)', [c.id, userId, oid, orderDiscount]);
    await q('UPDATE coupons SET used_count = used_count + 1 WHERE id=?', [c.id]);
  }
  const shipStatus = { pending: 'pending', confirmed: 'ready', processing: 'ready', shipping: 'in_transit', delivered: 'delivered', completed: 'delivered', cancelled: 'cancelled' }[status];
  const [[sm]] = shipCode ? await q('SELECT id FROM shipping_methods WHERE code=?', [shipCode]) : [[null]];
  const [sh] = await q(`INSERT INTO shipments (order_id, shipping_method_id, tracking_number, status, shipping_fee, cod_amount)
    VALUES (?,?,?, ?,?,?)`, [oid, sm?.id || null, ['pending', 'cancelled'].includes(status) ? null : 'VN' + String(100000 + oid), shipStatus, shipFee, payCode === 'cod' && !paid ? total : 0]);
  const [ois] = await q('SELECT id, quantity FROM order_items WHERE order_id=?', [oid]);
  for (const oi of ois) await q('INSERT INTO shipment_items (shipment_id, order_item_id, quantity) VALUES (?,?,?)', [sh.insertId, oi.id, oi.quantity]);
  if (!['pending', 'cancelled'].includes(shipStatus)) {
    await q(`INSERT INTO shipment_tracking_events (shipment_id, status, description, location, occurred_at)
      VALUES (?,?,'Da nhan hang','Kho TP.HCM',DATE_SUB(NOW(6), INTERVAL ? DAY))`, [sh.insertId, 'picked_up', daysAgo]);
    await q(`INSERT INTO shipment_tracking_events (shipment_id, status, description, location, occurred_at)
      VALUES (?,?,'Dang van chuyen','TP.HCM',DATE_SUB(NOW(6), INTERVAL ? DAY))`, [sh.insertId, shipStatus, Math.max(0, daysAgo - 1)]);
  }
  if (['delivered', 'completed'].includes(status)) await q("UPDATE orders SET fulfillment_status='fulfilled' WHERE id=?", [oid]);
  if (status === 'completed') await q('UPDATE orders SET completed_at=DATE_SUB(NOW(6), INTERVAL 1 DAY) WHERE id=?', [oid]);
  return oid;
}

(async () => {
  console.log('== Xoa du lieu cu (giu RBAC + phuong thuc thanh toan) ==');
  await q('SET FOREIGN_KEY_CHECKS=0');
  for (const tb of WIPE) await q(`TRUNCATE TABLE \`${tb}\``);
  await q('SET FOREIGN_KEY_CHECKS=1');

  console.log('== Anh minh hoa (SVG) ==');
  let storageOk = true;
  try { await storage.ensureBucket(); } catch (e) { storageOk = false; console.log('Bo qua anh (thieu S3):', e.message); }

  console.log('== Thuong hieu / danh muc / thuoc tinh ==');
  const BRANDS = [
    ['UniWear', 'uniwear', 'Thoi trang phong cach, phoi do moi ngay'],
    ['CasaHome', 'casahome', 'Do dung gia dung ben vung'],
    ['TechZone', 'techzone', 'Phu kien cong nghe chinh hieu'],
    ['GlowLab', 'glowlab', 'Cham soc sac dep tu nhien'],
    ['ActiveFit', 'activefit', 'Dung cu the thao va sinh hoat'],
    ['OfficePro', 'officepro', 'Do dung van phong chuyen ngiep'],
  ];
  for (const [n, s, d] of BRANDS) await q("INSERT INTO brands (name,slug,description,status) VALUES (?,?,?,'active')", [n, s, d]);

  const CATS = [
    ['thoi-trang', 'Thoi trang', 'bi-person', 1, [
      ['ao', 'Ao', 'bi-tag', 1], ['quan', 'Quan', 'bi-layers', 2], ['giay-dep', 'Giay dep', 'bi-handbag', 3], ['phu-kien', 'Phu kien', 'bi-bag', 4]]],
    ['phu-kien-thoi-trang', 'Phu kien', 'bi-bag-heart', 2, [
      ['balo-tui', 'Balo & tui', 'bi-briefcase', 1], ['dong-ho', 'Dong ho', 'bi-smartwatch', 2]]],
    ['gia-dung', 'Gia dung', 'bi-house-door', 3, [
      ['noi-chao', 'Noi & chao', 'bi-circle', 1], ['dung-cu', 'Dung cu', 'bi-cup-hot', 2]]],
    ['dien-tu', 'Dien tu', 'bi-cpu', 4, [
      ['tai-nghe', 'Tai nghe', 'bi-headphones', 1], ['sac-pin', 'Sac & pin', 'bi-battery-charging', 2], ['dien-thoai', 'Dien thoai', 'bi-phone', 3]]],
    ['the-thao', 'The thao', 'bi-bicycle', 5, [
      ['dung-cu-the-thao', 'Dung cu', 'bi-basketball', 1]]],
    ['lam-dep', 'Lam dep', 'bi-heart-pulse', 6, [
      ['cham-soc-da', 'Cham soc da', 'bi-droplet', 1]]],
    ['van-phong', 'Van phong', 'bi-briefcase', 7, [
      ['ghe-ban', 'Ghe & ban', 'bi-chair', 1]]],
  ];
  const catIds = {};
  const CAT_PALETTE = [PALETTES.blue, PALETTES.rose, PALETTES.green, PALETTES.violet, PALETTES.amber, PALETTES.teal, PALETTES.slate];
  let catIdx = 0;
  for (const [slug, name, icon, sort, kids] of CATS) {
    const pal = CAT_PALETTE[catIdx++ % CAT_PALETTE.length];
    let imgId = null;
    if (storageOk) imgId = await putArt(`demo/cat-${slug}.svg`, categoryArt({ bg1: pal.bg1, bg2: pal.bg2, main: pal.main, label: name }));
    const [r] = await q("INSERT INTO categories (parent_id,name,slug,icon,image_media_id,sort_order,status) VALUES (NULL,?,?,?,?,?,'active')",
      [name, slug, icon, imgId, sort]);
    catIds[slug] = r.insertId;
    for (const [ks, kn, ki, ksrt] of kids) {
      const kpal = CAT_PALETTE[catIdx++ % CAT_PALETTE.length];
      let kImgId = null;
      if (storageOk) kImgId = await putArt(`demo/cat-${ks}.svg`, categoryArt({ bg1: kpal.bg1, bg2: kpal.bg2, main: kpal.main, label: kn }));
      const [kr] = await q("INSERT INTO categories (parent_id,name,slug,icon,image_media_id,sort_order,status) VALUES (?,?,?,?,?,?,'active')", [r.insertId, kn, ks, ki, kImgId, ksrt]);
      catIds[ks] = kr.insertId;
    }
  }

  const ATTRS = [
    ['Mau sac', 'color', 'color', [['Do', '#dc2626'], ['Xanh duong', '#2563eb'], ['Den', '#111827'], ['Trang', '#f8fafc'], ['Be', '#d6bfa4'], ['Xanh olive', '#4d7c0f']]],
    ['Kich co', 'size', 'text', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']]],
    ['Dung tich', 'capacity', 'text', [['1L', '1 lít'], ['1.5L', '1.5 lít'], ['2L', '2 lít'], ['20K', '20.000 mAh'], ['65W', '65W']]],
  ];
  const attrIds = {}, valIds = {};
  for (const [name, code, dtype, vals] of ATTRS) {
    const [a] = await q('INSERT INTO attributes (name,code,display_type,sort_order) VALUES (?,?,?,?)', [name, code, dtype, attrIds[name] ? 1 : 0]);
    attrIds[code] = a.insertId;
    valIds[code] = {};
    for (const [v, d] of vals) {
      const hex = code === 'color' ? d : null;
      const [r] = await q('INSERT INTO attribute_values (attribute_id,value,display_value,color_hex) VALUES (?,?,?,?)', [a.insertId, v, d, hex]);
      valIds[code][v] = r.insertId;
    }
  }

  console.log('== San pham ==');
  const V = {};
  async function addProduct({ brand, cats, attrs = [], name, slug, price, compare, desc, short, variants, art, tag, imgs = 2 }) {
    const [[b]] = await q('SELECT id FROM brands WHERE slug=?', [brand]);
    const [r] = await q(`INSERT INTO products (brand_id,name,slug,short_description,description,status,base_price,compare_at_price,published_at)
      VALUES (?,?,?,?,?,'active',?,?,NOW(6))`, [b.id, name, slug, short, desc, price, compare || null]);
    const pid = r.insertId;
    for (let i = 0; i < cats.length; i++)
      await q('INSERT INTO product_categories (product_id,category_id,is_primary) VALUES (?,?,?)', [pid, catIds[cats[i]], i === 0]);
    for (const a of attrs) await q('INSERT IGNORE INTO product_attributes (product_id,attribute_id) VALUES (?,?)', [pid, attrIds[a]]);
    for (const [sku, vname, vprice, avids] of variants) {
      const [vr] = await q(`INSERT INTO product_variants (product_id,sku,name,price,compare_at_price,weight_grams,status)
        VALUES (?,?,?,?,?,?,'active')`, [pid, sku, vname, vprice, compare || null, 200 + Math.floor(Math.random() * 800)]);
      V[sku] = vr.insertId;
      for (const avid of avids || []) await q('INSERT IGNORE INTO variant_attribute_values (variant_id,attribute_value_id) VALUES (?,?)', [vr.insertId, avid]);
    }
    if (storageOk && art) {
      for (let i = 0; i < imgs; i++) {
        const svg = productArt({ ...art.p, kind: art.kind, label: i === 0 ? name : name, tag: i === 0 ? tag : '' });
        const mid = await putArt(`demo/p-${slug}-${i + 1}.svg`, svg);
        await q('INSERT INTO product_images (product_id,media_id,sort_order,is_primary) VALUES (?,?,?,?)', [pid, mid, i, i === 0]);
      }
    }
    return pid;
  }

  const P = {};
  const defs = [
    ['ao-thun-cotton', { brand: 'uniwear', cats: ['ao'], attrs: ['color', 'size'], name: 'Ao thun cotton basic', price: 249000, compare: 349000, art: ART.aoThun, tag: 'Hot', desc: 'Ao thun cotton 100% thoang mat, reu sau nhieu lan giat, phom dang nhat cho ca nam va nu.', short: 'Cotton 100%, thoang mat, reu sau nhieu lan giat' },
      [['ATS-DO-M', 'Do / M', 249000, [valIds.color['Do'], valIds.size.M]], ['ATS-XD-L', 'Xanh duong / L', 249000, [valIds.color['Xanh duong'], valIds.size.L]], ['ATS-DEN-S', 'Den / S', 239000, [valIds.color['Den'], valIds.size.S]], ['ATS-BE-XL', 'Be / XL', 259000, [valIds.color.Be, valIds.size.XL]]]],
    ['ao-khoac-gio', { brand: 'uniwear', cats: ['ao'], attrs: ['color', 'size'], name: 'Ao khoac gio nhe', price: 549000, compare: 699000, art: ART.aoKhoac, tag: 'Moi', desc: 'Ao khoac gio nhe, chong nang nhe, phu trang khong bi rut vet.', short: 'Chong nang nhe, phu trang khong rut vet' },
      [['AKG-DEN-L', 'Den / L', 549000, [valIds.color.Den, valIds.size.L]], ['AKG-BE-M', 'Be / M', 549000, [valIds.color.Be, valIds.size.M]]]],
    ['ao-so-len', { brand: 'uniwear', cats: ['ao'], attrs: ['color', 'size'], name: 'Ao so len nữ basic', price: 299000, compare: null, art: ART.aoSo, tag: null, desc: 'Ao so len cotton dai tay, gam tay, khong xuyen la.', short: 'Cotton dai tay, gam tay, khong xuyen la' },
      [['ASL-TRANG-M', 'Trang / M', 299000, [valIds.color.Trang, valIds.size.M]], ['ASL-HB-S', 'Xanh duong / S', 299000, [valIds.color['Xanh duong'], valIds.size.S]]]],
    ['quan-jeans-slim', { brand: 'uniwear', cats: ['quan'], attrs: ['color', 'size'], name: 'Quan jeans slim', price: 549000, compare: 699000, art: ART.quanJeans, tag: 'Hot', desc: 'Quan jeans co gian, form slim, phoi doi duoc moi phong cach.', short: 'Dan co gian, form slim, phong cach' },
      [['QJN-XD-32', 'Xanh duong / 32', 549000, [valIds.color['Xanh duong'], valIds.size.L]], ['QJN-DEN-30', 'Den / 30', 549000, [valIds.color.Den, valIds.size.M]]]],
    ['quan-tay-lien', { brand: 'officepro', cats: ['quan'], attrs: ['color', 'size'], name: 'Quan tay lien nhiet', price: 469000, compare: null, art: ART.quanTay, tag: null, desc: 'Quan tay lien nhiet, mat nhung nang, thich hop lam do ng nghiep.', short: 'Mat nhung nang, do ng nghiep' },
      [['QTL-DEN-L', 'Den / L', 469000, [valIds.color.Den, valIds.size.L]], ['QTL-XD-M', 'Xanh duong / M', 469000, [valIds.color['Xanh duong'], valIds.size.M]]]],
    ['vay-midi', { brand: 'uniwear', cats: ['ao'], attrs: ['color', 'size'], name: 'Vay midi hoa tiep', price: 469000, compare: 599000, art: ART.vay, tag: 'Moi', desc: 'Vay midi hoa tiep nhe, ton trang, phu doi giay dep.', short: 'Hoa tiep nhe, ton trang' },
      [['VAY-BE-M', 'Be / M', 469000, [valIds.color.Be, valIds.size.M]], ['VAY-DEN-S', 'Den / S', 469000, [valIds.color.Den, valIds.size.S]]]],
    ['giay-sneaker', { brand: 'activefit', cats: ['giay-dep'], attrs: ['color', 'size'], name: 'Giay sneaker nữ', price: 699000, compare: 899000, art: ART.giay, tag: 'Hot', desc: 'Giay sneaker de dem, gon nang, phu duoc moi do.', short: 'De dem, gon nang, phu moi do' },
      [['GSN-TRANG-37', 'Trang / 37', 699000, [valIds.color.Trang, valIds.size.M]], ['GSN-DEN-38', 'Den / 38', 699000, [valIds.color.Den, valIds.size.L]]]],
    ['dep-sandal', { brand: 'activefit', cats: ['giay-dep'], attrs: ['color', 'size'], name: 'Dep sandal da', price: 329000, compare: null, art: ART.dep, tag: null, desc: 'Dep sandal da that, chan doi mem, phoi don gian.', short: 'Da that, chan doi mem' },
      [['DSP-BE-37', 'Be / 37', 329000, [valIds.color.Be, valIds.size.M]], ['DSP-TRANG-38', 'Trang / 38', 329000, [valIds.color.Trang, valIds.size.L]]]],
    ['balo-hoc-tap', { brand: 'officepro', cats: ['balo-tui'], attrs: ['color'], name: 'Balo hoc tap chong nuoc', price: 449000, compare: 549000, art: ART.balo, tag: 'Moi', desc: 'Balo chong nuoc, ngan chua laptop 15.6 inch, day de chiu.', short: 'Chong nuoc, chua laptop 15.6 inch' },
      [['BLO-DEN', 'Den', 449000, [valIds.color.Den]], ['BLO-XL', 'Xanh olive', 449000, [valIds.color['Xanh olive']]]]],
    ['tui-deu', { brand: 'officepro', cats: ['balo-tui'], attrs: ['color'], name: 'Tui deu mini', price: 289000, compare: null, art: ART.tui, tag: null, desc: 'Tui deu mini, dau day chai, dung cho di chuyen ngan.', short: 'Dau day chai, di chuyen ngan' },
      [['TUI-DEN', 'Den', 289000, [valIds.color.Den]], ['TUI-BE', 'Be', 289000, [valIds.color.Be]]]],
    ['dong-ho-thong-minh', { brand: 'techzone', cats: ['dong-ho'], attrs: ['color'], name: 'Dong ho thong minh', price: 1290000, compare: 1590000, art: ART.dongHo, tag: 'Hot', desc: 'Dong ho thong minh theo doi nhip tim, giam sat moi, chong nuoc IP68.', short: 'Theo doi nhip tim, giam sat moi, IP68' },
      [['DHS-DEN', 'Den', 1290000, [valIds.color.Den]], ['DHS-ROSE', 'Be', 1290000, [valIds.color.Be]]]],
    ['noi-inox-5l', { brand: 'casahome', cats: ['noi-chao'], attrs: ['color', 'capacity'], name: 'Noi inox 5L day 5 lop', price: 890000, compare: 1090000, art: ART.noi, tag: 'Moi', desc: 'Noi inox 304 day 5 lop, giu nhiet tot, dung cho moi loai bep.', short: 'Inox 304, giu nhiet, moi loai bep' },
      [['NOI-5L', '5 lít', 890000, [valIds.color.Trang, valIds.capacity['2L']]]]],
    ['noi-dien-ap', { brand: 'casahome', cats: ['noi-chao'], attrs: ['color', 'capacity'], name: 'Noi dien ap 1.5L', price: 649000, compare: null, art: ART.noi, tag: null, desc: 'Noi dien ap 1.5L, long inox, bat nhanh, hao dien it.', short: 'Long inox, bat nhanh, it hao dien' },
      [['NDA-15L', '1.5 lít', 649000, [valIds.size.M, valIds.capacity['1.5L']]]]],
    ['chai-thuy-tinh', { brand: 'casahome', cats: ['noi-chao'], attrs: ['capacity'], name: 'Chai thuy tinh chong nhiet', price: 189000, compare: 249000, art: ART.chai, tag: null, desc: 'Chai thuy tinh chong nhiet, dung cho nuoc chanh va tra.', short: 'Chong nhiet, dung cho nuoc uong' },
      [['CTN-1L', '1 lít', 189000, [valIds.capacity['1L']]]]],
    ['den-ban-hoc', { brand: 'officepro', cats: ['dung-cu'], attrs: ['color'], name: 'Den ban hoc LED 3 mau', price: 329000, compare: 399000, art: ART.den, tag: 'Hot', desc: 'Den ban hoc LED khong chap, 3 mau sang, di chinh do sang.', short: 'Khong chap, 3 mau sang, di chinh do sang' },
      [['DBH-TRANG', 'Trang', 329000, [valIds.color.Trang]], ['DBH-DEN', 'Den', 329000, [valIds.color.Den]]]],
    ['quat-cam-tay', { brand: 'casahome', cats: ['dung-cu'], attrs: ['color'], name: 'Quat cam tay sac nhanh', price: 189000, compare: null, art: ART.quat, tag: null, desc: 'Quat cam tay sac nhanh, 3 cap do, ngan gop.', short: 'Sac nhanh, 3 cap do, ngan gop' },
      [['QCT-TRANG', 'Trang', 189000, [valIds.color.Trang]]]],
    ['tai-nghe-chong-on', { brand: 'techzone', cats: ['tai-nghe'], attrs: ['color'], name: 'Tai nghe chong on ENC', price: 749000, compare: 999000, art: ART.taiNghe, tag: 'Moi', desc: 'Tai nghe Bluetooth chong on ENC, pin 30 gio, sac nhanh.', short: 'Chong on ENC, pin 30 gio' },
      [['TNG-BT-DEN', 'Den', 749000, [valIds.color.Den]], ['TNG-BT-TRANG', 'Trang', 749000, [valIds.color.Trang]]]],
    ['sac-du-phong-20k', { brand: 'techzone', cats: ['sac-pin'], attrs: ['color', 'capacity'], name: 'Sac du phong 20000mAh', price: 489000, compare: 649000, art: ART.sac, tag: 'Hot', desc: 'Sac du phong 20000mAh, sac nhanh 22.5W, 2 cong ra.', short: '20000mAh, sac nhanh 22.5W, 2 cong' },
      [['SAC-20K-DEN', 'Den', 489000, [valIds.color.Den, valIds.capacity['20K']]]]],
    ['sac-nhanh-65w', { brand: 'techzone', cats: ['sac-pin'], attrs: ['capacity'], name: 'Sac nhanh GaN 65W', price: 679000, compare: null, art: ART.sac, tag: null, desc: 'Bam sac nhanh GaN 65W, sac laptop va dien thoai, nho gon.', short: 'GaN 65W, sac laptop va dien thoai' },
      [['SCN-65W', '65W', 679000, [valIds.capacity['65W']]]]],
    ['dien-thoai-unimate-x', { brand: 'techzone', cats: ['dien-thoai'], attrs: ['color'], name: 'Dien thoai UniMate X', price: 8990000, compare: 9990000, art: ART.dienThoai, tag: 'Moi', desc: 'Man 6.7 inch, camera 108MP, pin 5000mAh, sac 65W.', short: 'Man 6.7 inch, camera 108MP, pin 5000mAh' },
      [['DTU-DEN', 'Den', 8990000, [valIds.color.Den]]]],
    ['co-giay-inox', { brand: 'casahome', cats: ['dung-cu'], attrs: ['color'], name: 'Co gay inox ca', price: 149000, compare: 189000, art: ART.co, tag: null, desc: 'Co gay inox 304, chan nhiet tot, dung cho ca phe.', short: 'Inox 304, chan nhiet tot' },
      [['CGI-TRANG', 'Trang', 149000, [valIds.color.Trang]]]],
    ['ghe-van-phong', { brand: 'officepro', cats: ['ghe-ban'], attrs: ['color'], name: 'Ghe van phong da mesh', price: 2890000, compare: 3290000, art: ART.ghe, tag: 'Hot', desc: 'Ghe van phong da mesh, chong gia, nghi ngoi, di chuyen gon.', short: 'Da mesh, chong gia, di chuyen gon' },
      [['GVP-DEN', 'Den', 2890000, [valIds.color.Den]]]],
  ];

  for (const [slug, cfg, variants] of defs) {
    P[slug] = await addProduct({ ...cfg, slug, variants });
  }

  console.log('== Kho hang ==');
  await q("INSERT INTO warehouses (code,name,address,province_code,status) VALUES ('HCM','Kho TP.HCM','Khu cong nghe 1, Quang Trung, Quan 7','79','active'),('HN','Kho Ha Noi','Nam Thang Long, Nam Tu Liem','01','active')");
  for (const [sku, variantId] of Object.entries(V)) {
    const qty = 20 + Math.floor(Math.random() * 180);
    await q('INSERT INTO warehouse_stocks (warehouse_id,variant_id,quantity,reserved_quantity,reorder_level) VALUES (1,?,?,0,?)', [variantId, qty, 15]);
    if (Math.random() > 0.4) await q('INSERT INTO warehouse_stocks (warehouse_id,variant_id,quantity,reserved_quantity,reorder_level) VALUES (2,?,?,0,?)', [variantId, 10 + Math.floor(Math.random() * 60), 8]);
  }
  for (const sku of ['NOI-5L', 'NDA-15L', 'DBH-TRANG']) {
    await q("INSERT INTO stock_movements (warehouse_id,variant_id,type,quantity,note) VALUES (1,?,'adjustment',-1,'Kiem ke mat hang')", [V[sku]]);
  }

  console.log('== Hinh thuc giao / coupon / khuyen mai ==');
  await q("INSERT INTO shipping_methods (provider_id,code,name,description,base_fee,is_active,sort_order) VALUES (1,'NHANH','Giao nhanh','Nhan trong 24 gio noi bang','30000',TRUE,1),(1,'TIETKIEM','Giao tiet kiem','Tiet kiem 3-5 ngay','18000',TRUE,2),(1,'HOATOC','Giao hoa toc','Sanh 2 gio trong TP.HCM','50000',TRUE,3),(1,'CHUYEN','Giao chuyen kho','Chuyen kho dac biet','0',TRUE,4)");
  await q(`INSERT INTO coupons (code,type,value,minimum_order_amount,maximum_discount_amount,usage_limit,used_count,starts_at,expires_at,status)
    VALUES ('CHAO10','percentage',10,200000,50000,1000,0,'2020-01-01','2030-01-01','active'),
           ('FREESHIP','free_shipping',0,500000,NULL,500,0,'2020-01-01','2030-01-01','active'),
           ('NEW50','fixed',50000,300000,50000,300,0,'2020-01-01','2030-01-01','active'),
           ('HETDUNG','percentage',20,100000,30000,100,0,'2020-01-01','2020-02-01','expired')`);
  await q(`INSERT INTO promotions (name,code,description,type,value,maximum_discount_amount,starts_at,ends_at,priority,stackable,status)
    VALUES (CONCAT('Sale he ', YEAR(CURDATE())),'SALEHE','Giam gia toan bo thoi trang','percentage',15,150000,'2020-01-01','2030-01-01',10,FALSE,'active'),
           ('Mua 2 giam them','MUA2','Giam them cho don tu 2 san pham','percentage',5,50000,'2020-01-01','2030-01-01',5,TRUE,'active')`);

  console.log('== Nguoi dung ==');
  const adminId = await createUser({ email: 'admin@example.com', phone: '0900000001', pw: 'Admin123!', role: 'super_admin', first: 'Quan', last: 'Tri' });
  await createUser({ email: 'manager@example.com', phone: '0900000002', pw: 'Staff123!', role: 'store_manager', first: 'Cua hang', last: 'Truong' });
  await createUser({ email: 'kho@example.com', phone: '0900000003', pw: 'Staff123!', role: 'warehouse_staff', first: 'Thu', last: 'Kho' });
  await createUser({ email: 'cskh@example.com', phone: '0900000004', pw: 'Staff123!', role: 'customer_support', first: 'Cham soc', last: 'Khach' });
  await createUser({ email: 'mkt@example.com', phone: '0900000005', pw: 'Staff123!', role: 'marketing', first: 'Tiep', last: 'Thi' });

  const CUSTOMERS = [
    ['an@example.com', '0911111111', 'An', 'Nguyen', 'male', 'Nguyen Van An', 'TP Ho Chi Minh', 'Quan 1', 'Phuong Ben Nghe', '123 Le Loi'],
    ['binh@example.com', '0922222222', 'Binh', 'Tran', 'male', 'Tran Van Binh', 'Ha Noi', 'Cau Giay', 'Phuong Dich Vong', '45 Xuan Thuy'],
    ['chi@example.com', '0933333333', 'Chi', 'Le', 'female', 'Le Thi Chi', 'TP Ho Chi Minh', 'Quan 3', 'Phuong 6', '78 Cach Mang Thang 8'],
    ['dung@example.com', '0944444444', 'Dung', 'Pham', 'female', 'Pham Thu Dung', 'Da Nang', 'Hai Chau', 'Phuong Hai Chau', '12 Tran Phu'],
    ['hieu@example.com', '0955555555', 'Hieu', 'Vo', 'male', 'Vo Anh Hieu', 'TP Ho Chi Minh', 'Binh Thanh', 'Phuong 25', '200 Nguyen Van Luu'],
    ['lan@example.com', '0966666666', 'Lan', 'Ho', 'female', 'Ho Thanh Lan', 'Ha Noi', 'Hoan Kiem', 'Phuong Hang Bai', '8 Hang Tho'],
    ['minh@example.com', '0977777777', 'Minh', 'Dang', 'male', 'Dang Duc Minh', 'Can Tho', 'Ninh Kieu', 'Phuong An Hung', '30 Hai Ba Trung'],
  ];
  const customers = {};
  for (const [email, phone, first, last, gender, rname, province, district, ward, line] of CUSTOMERS) {
    customers[email] = await createUser({
      email, phone, pw: 'Khach123!', role: 'customer', first, last, gender,
      addr: { name: rname, phone, province, district, ward, line },
    });
  }
  const anId = customers['an@example.com'];
  const binhId = customers['binh@example.com'];
  const chiId = customers['chi@example.com'];
  const dungId = customers['dung@example.com'];
  const hieuId = customers['hieu@example.com'];
  const lanId = customers['lan@example.com'];
  const minhId = customers['minh@example.com'];

  const ADDR = {
    an: { name: 'Nguyen Van An', phone: '0911111111', email: 'an@example.com', province: 'TP Ho Chi Minh', district: 'Quan 1', ward: 'Phuong Ben Nghe', line: '123 Le Loi' },
    binh: { name: 'Tran Van Binh', phone: '0922222222', email: 'binh@example.com', province: 'Ha Noi', district: 'Cau Giay', ward: 'Phuong Dich Vong', line: '45 Xuan Thuy' },
    chi: { name: 'Le Thi Chi', phone: '0933333333', email: 'chi@example.com', province: 'TP Ho Chi Minh', district: 'Quan 3', ward: 'Phuong 6', line: '78 Cach Mang Thang 8' },
    dung: { name: 'Pham Thu Dung', phone: '0944444444', email: 'dung@example.com', province: 'Da Nang', district: 'Hai Chau', ward: 'Phuong Hai Chau', line: '12 Tran Phu' },
    hieu: { name: 'Vo Anh Hieu', phone: '0955555555', email: 'hieu@example.com', province: 'TP Ho Chi Minh', district: 'Binh Thanh', ward: 'Phuong 25', line: '200 Nguyen Van Luu' },
    lan: { name: 'Ho Thanh Lan', phone: '0966666666', email: 'lan@example.com', province: 'Ha Noi', district: 'Hoan Kiem', ward: 'Phuong Hang Bai', line: '8 Hang Tho' },
  };

  console.log('== Don hang ==');
  const ORDERS = [
    { num: 'ORD-DEMO-0001', u: anId, status: 'pending', pay: 'unpaid', pc: 'cod', items: [['ATS-DO-M', 1]], ship: 'NHANH', fee: 30000, d: 0, a: ADDR.an, note: 'Giao gio hanh chinh' },
    { num: 'ORD-DEMO-0002', u: binhId, status: 'confirmed', pay: 'paid', pc: 'bank_transfer', items: [['QJN-XD-32', 1]], coupon: 'CHAO10', ship: 'NHANH', fee: 30000, d: 2, a: ADDR.binh },
    { num: 'ORD-DEMO-0003', u: chiId, status: 'shipping', pay: 'paid', pc: 'cod', items: [['SAC-20K-DEN', 2]], ship: 'HOATOC', fee: 50000, d: 3, a: ADDR.chi },
    { num: 'ORD-DEMO-0004', u: anId, status: 'delivered', pay: 'paid', pc: 'cod', items: [['NOI-5L', 1]], ship: 'TIETKIEM', fee: 18000, d: 5, a: ADDR.an },
    { num: 'ORD-DEMO-0005', u: binhId, status: 'completed', pay: 'paid', pc: 'cod', items: [['DBH-TRANG', 1], ['TNG-BT-DEN', 1]], ship: 'NHANH', fee: 30000, d: 7, a: ADDR.binh },
    { num: 'ORD-DEMO-0006', u: chiId, status: 'cancelled', pay: 'unpaid', pc: 'cod', items: [['ATS-DEN-S', 1]], ship: 'NHANH', fee: 30000, d: 1, a: ADDR.chi, note: 'Khach doi y' },
    { num: 'ORD-DEMO-0007', u: dungId, status: 'completed', pay: 'paid', pc: 'vnpay', items: [['COGI-TRANG', 2]], coupon: 'NEW50', ship: 'TIETKIEM', fee: 18000, d: 9, a: ADDR.dung },
    { num: 'ORD-DEMO-0008', u: hieuId, status: 'completed', pay: 'paid', pc: 'cod', items: [['GSN-TRANG-37', 1], ['TUI-DEN', 1]], ship: 'HOATOC', fee: 50000, d: 12, a: ADDR.hieu },
    { num: 'ORD-DEMO-0009', u: lanId, status: 'delivered', pay: 'paid', pc: 'bank_transfer', items: [['DHS-DEN', 1]], ship: 'NHANH', fee: 30000, d: 14, a: ADDR.lan },
    { num: 'ORD-DEMO-0010', u: minhId, status: 'completed', pay: 'paid', pc: 'cod', items: [['QCT-TRANG', 1], ['CTN-1L', 2]], coupon: 'CHAO10', ship: 'TIETKIEM', fee: 18000, d: 17, a: { name: 'Dang Duc Minh', phone: '0977777777', province: 'Can Tho', district: 'Ninh Kieu', ward: 'Phuong An Hung', line: '30 Hai Ba Trung' } },
    { num: 'ORD-DEMO-0011', u: anId, status: 'completed', pay: 'paid', pc: 'vnpay', items: [['SCN-65W', 1]], ship: 'NHANH', fee: 30000, d: 20, a: ADDR.an },
    { num: 'ORD-DEMO-0012', u: chiId, status: 'completed', pay: 'paid', pc: 'cod', items: [['BLO-DEN', 1]], coupon: 'FREESHIP', ship: 'TIETKIEM', fee: 0, d: 23, a: ADDR.chi },
    { num: 'ORD-DEMO-0013', u: dungId, status: 'processing', pay: 'pending', pc: 'bank_transfer', items: [['VAY-BE-M', 1]], ship: 'NHANH', fee: 30000, d: 1, a: ADDR.dung },
    { num: 'ORD-DEMO-0014', u: hieuId, status: 'completed', pay: 'paid', pc: 'cod', items: [['NDA-15L', 1], ['CTN-1L', 2]], ship: 'HOATOC', fee: 50000, d: 27, a: ADDR.hieu },
  ];
  const orderIds = {};
  for (const o of ORDERS) {
    const items = o.items.filter(([sku]) => V[sku]).map(([sku, qty]) => ({ variantId: V[sku], qty }));
    if (!items.length) continue;
    orderIds[o.num] = await createOrder({ num: o.num, userId: o.u, status: o.status, payStatus: o.pay, payCode: o.pc, items, coupon: o.coupon, shipCode: o.ship, shipFee: o.fee, daysAgo: o.d, address: o.a, note: o.note });
  }

  console.log('== Review / doi tra / banner / campaign ==');
  const REVIEWS = [
    ['sac-du-phong-20k', binhId, 'ORD-DEMO-0005', 5, 'Pin tru, sac nhanh', 'Sac nhanh het 50% trong 30 phut, pin dung ca ngay.'],
    ['den-ban-hoc', binhId, 'ORD-DEMO-0005', 4, 'Sang dep', 'De nhin, khong chap, nhung hoi nang khi bat ca dem.'],
    ['tai-nghe-chong-on', binhId, 'ORD-DEMO-0005', 5, 'Am thanh tot', 'Chong on tot, nghe nhac lau khong met tai.'],
    ['quan-jeans-slim', binhId, 'ORD-DEMO-0002', 4, 'Form dep', 'Dung form, dung kich co.'],
    ['noi-inox-5l', anId, 'ORD-DEMO-0004', 5, 'Giu nhiet rat tot', 'Noi qua kieu gas van giu nhiet lau.'],
    ['giay-sneaker', hieuId, 'ORD-DEMO-0008', 4, 'De chan', 'De chan, nhe chan, phoi dep.'],
    ['dong-ho-thong-minh', lanId, 'ORD-DEMO-0009', 5, 'Dong pin ngon', 'Dong 5 ngay, theo doi nhip tim chinh xac.'],
    ['co-giay-inox', dungId, 'ORD-DEMO-0007', 4, 'Chat luong on', 'Inox mat, khong gi.'],
    ['balo-hoc-tap', chiId, 'ORD-DEMO-0012', 5, 'Rong, gon', 'Chua duoc laptop 15 inch, ngan phu cham qua nhieu.'],
  ];
  for (const [slug, uid, orNum, rating, title, content] of REVIEWS) {
    if (!P[slug] || !uid) continue;
    await q(`INSERT INTO reviews (product_id,user_id,order_id,rating,title,content,is_verified_purchase,status)
      VALUES (?,?,?,?,?,?,TRUE,'published')`, [P[slug], uid, orderIds[orNum] || null, rating, title, content]);
  }
  await q(`INSERT INTO reviews (product_id,user_id,rating,title,content,status) VALUES (?,?,4,'Dep','San pham dep, dung kich co','pending')`, [P['quan-tay-lien'], chiId]);

  const [oi4rows] = await q("SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.order_number='ORD-DEMO-0004' LIMIT 1");
  if (oi4rows[0]) {
    const [rr] = await q(`INSERT INTO returns (order_id,user_id,return_number,status,reason_code,reason_detail,customer_note)
      VALUES (?,?,'RET-DEMO-001','requested','wrong_size','Size chan','Muon doi size lon hon')`, [orderIds['ORD-DEMO-0004'], anId]);
    await q('INSERT INTO return_items (return_id,order_item_id,requested_quantity) VALUES (?,?,1)', [rr.insertId, oi4rows[0].id]);
    await q('INSERT INTO return_status_history (return_id,to_status) VALUES (?,?)', [rr.insertId, 'requested']);
  }

  console.log('== Banner (anh minh hoa) ==');
  const BANNERS = [
    { key: 'banner-sale', title: 'Sale he giam toi da 20%', kicker: 'Uu dai mua sam', sub: 'Ap dung cho toan bo thoi trang, giao nhanh toan quoc', cta: 'Xem ngay', link: '/khuyen-mai', bg1: '#0b3d9e', bg2: '#2f7fd0', deco: '#f59e0b', sort: 1 },
    { key: 'banner-new', title: 'Hang moi ve thu 9', kicker: 'Moi', sub: 'Phong cach moi, chat lieu tot hon, gia thanh nhat', cta: 'Kham pha', link: '/san-pham', bg1: '#065f46', bg2: '#10b981', deco: '#fde68a', sort: 2 },
    { key: 'banner-tech', title: 'Phu kien cong nghe chinh hang', kicker: 'TechZone', sub: 'Tai nghe chong on, sac nhanh, bao hanh 12 thang', cta: 'Mua ngay', link: '/san-pham?danh-muc=dien-thoai', bg1: '#4c1d95', bg2: '#8b5cf6', deco: '#fbbf24', sort: 3 },
  ];
  for (const b of BANNERS) {
    let mid = null;
    let midMobile = null;
    if (storageOk) {
      mid = await putArt(`demo/${b.key}.svg`, bannerArt({ bg1: b.bg1, bg2: b.bg2, kicker: b.kicker, title: b.title, sub: b.sub, cta: b.cta, deco: b.deco }));
      midMobile = await putArt(`demo/${b.key}-m.svg`, bannerArt({ bg1: b.bg1, bg2: b.bg2, kicker: b.kicker, title: b.title, sub: b.sub, cta: b.cta, deco: b.deco, mobile: true }));
    }
    await q("INSERT INTO banners (title,image_media_id,mobile_image_media_id,link_url,alt_text,sort_order,status) VALUES (?,?,?,?,?,?,'active')",
      [b.title, mid, midMobile, b.link, b.title, b.sort]);
  }

  const [cp] = await q("INSERT INTO campaigns (name,description,status,created_by) VALUES ('Khai truong UniMate','Giam gia toan bo 20% trong 2 tuan dau','active',?)", [adminId]);
  await q('INSERT INTO campaign_products (campaign_id,product_id) VALUES (?,?),(?,?),(?,?)', [cp.insertId, P['ao-thun-cotton'], cp.insertId, P['sac-du-phong-20k'], cp.insertId, P['tai-nghe-chong-on']]);
  await q(`INSERT INTO notifications (user_id,type,title,body) VALUES
    (?, 'order', 'Don moi', 'Co don hang moi can xac nhan'),
    (NULL, 'system', 'Bao tri', 'He thong bao tri luc 2h sang Chu nhat')`, [adminId]);
  await q(`INSERT INTO system_settings (setting_key,setting_value,description,is_public) VALUES
    ('shop.menu', ?, 'Menu web ban hang', TRUE)
    ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), is_public=TRUE`,
    [JSON.stringify([
      { label: 'Hang Moi', link: '/san-pham' },
      { label: 'Ban Chay', link: '/san-pham?sap-xep=gia-giam' },
      { label: 'Uu Dai Dac Biet', link: '/khuyen-mai' },
    ])]);

  const [[u]] = await q('SELECT COUNT(*) n FROM users');
  const [[o]] = await q('SELECT COUNT(*) n FROM orders');
  const [[p]] = await q('SELECT COUNT(*) n FROM products');
  const [[m]] = await q('SELECT COUNT(*) n FROM media_files');
  console.log(`== XONG: users=${u.n} orders=${o.n} products=${p.n} media=${m.n} ==`);
  await pool.end();
})().catch(async (e) => { console.error('SEED FAIL:', e.message); try { await pool.end(); } catch { } process.exit(1); });
