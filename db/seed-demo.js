// Nap du lieu DEMO chuan cho toan he thong (xoa het du lieu cu tru RBAC/seed goc).
// Chay: npm run db:seed-demo (local) hoac trong container backend.
const bcrypt = require('bcryptjs');
const zlib = require('zlib');
const { pool } = require('../src/config/db');
const storage = require('../src/config/storage');

// Ve PNG gradient thuan Node (khong can thu vien anh)
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function gradientPNG(c1, c2, w = 320, h = 200) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const k = (x / w + y / h) / 2;
      raw.set([Math.round(c1[0] + (c2[0] - c1[0]) * k), Math.round(c1[1] + (c2[1] - c1[1]) * k), Math.round(c1[2] + (c2[2] - c1[2]) * k)], y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

const q = (sql, p) => pool.query(sql, p || []);

const KEEP = ['roles', 'permissions', 'role_permissions', 'payment_methods', 'shipping_providers', 'system_settings'];
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

const PNG_IMGS = {
  'demo-ao-thun.png': [[15, 76, 129], [47, 127, 208]],
  'demo-noi-inox.png': [[30, 41, 59], [100, 116, 139]],
  'demo-banner-sale.png': [[180, 83, 9], [251, 191, 36]],
  'demo-jeans.png': [[30, 58, 138], [129, 140, 248]],
  'demo-den.png': [[124, 58, 237], [196, 181, 253]],
  'demo-sac.png': [[4, 120, 87], [110, 231, 183]],
  'demo-tainghe.png': [[190, 24, 93], [249, 168, 212]],
};

async function createUser({ email, phone, pw, role, first, last, addr }) {
  const hash = await bcrypt.hash(pw, 10);
  const [r] = await q("INSERT INTO users (email, phone, password_hash, status, email_verified_at) VALUES (?,?,?,'active',NOW(6))", [email || null, phone || null, hash]);
  const uid = r.insertId;
  await q('INSERT INTO user_profiles (user_id, first_name, last_name, display_name) VALUES (?,?,?,?)',
    [uid, first || null, last || null, [first, last].filter(Boolean).join(' ') || email || phone]);
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
  // items: [{variantId, qty}] — gia lay tu DB, ton tru kho HCM
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
    if (c.type === 'free_shipping') orderDiscount = 0;
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
  await q(`INSERT INTO order_addresses (order_id, address_type, recipient_name, phone, email, province_name, district_name, ward_name, address_line)
    VALUES (?,'shipping',?,?,?,?,?,?,?)`,
    [oid, address.name, address.phone, address.email || null, address.province, address.district || null, address.ward || null, address.line]);
  await q(`INSERT INTO order_addresses (order_id, address_type, recipient_name, phone, email, province_name, district_name, ward_name, address_line)
    VALUES (?,'billing',?,?,?,?,?,?,?)`,
    [oid, address.name, address.phone, address.email || null, address.province, address.district || null, address.ward || null, address.line]);
  // lich su theo luong trang thai
  const flow = { pending: [], confirmed: ['confirmed'], processing: ['confirmed', 'processing'], shipping: ['confirmed', 'processing', 'packed', 'shipping'], delivered: ['confirmed', 'processing', 'packed', 'shipping', 'delivered'], completed: ['confirmed', 'processing', 'packed', 'shipping', 'delivered', 'completed'], cancelled: ['cancelled'] };
  let prev = null;
  await q('INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?,?,?,?)', [oid, null, 'pending', 'Tao don']);
  for (const s of flow[status] || []) {
    await q('INSERT INTO order_status_history (order_id, from_status, to_status) VALUES (?,?,?)', [oid, prev || 'pending', s]);
    prev = s;
  }
  // payment
  const [[pm]] = await q('SELECT id FROM payment_methods WHERE code=?', [payCode]);
  const paid = payStatus === 'paid';
  const payRowStatus = paid ? 'paid' : 'pending'; // payments.status khong co 'unpaid'
  const [py] = await q(`INSERT INTO payments (order_id, payment_method_id, status, amount, currency, paid_at)
    VALUES (?,?,?,?,'VND',${paid ? 'DATE_SUB(NOW(6), INTERVAL ? DAY)' : 'NULL'})`, paid ? [oid, pm.id, payRowStatus, total, daysAgo] : [oid, pm.id, payRowStatus, total]);
  await q(`INSERT INTO payment_transactions (payment_id, transaction_type, status, amount, processed_at)
    VALUES (?, 'charge', ?, ?, ${paid ? 'DATE_SUB(NOW(6), INTERVAL ? DAY)' : 'NULL'})`, paid ? [py.insertId, 'success', total, daysAgo] : [py.insertId, 'pending', total]);
  if (paid) await q(`INSERT INTO cash_flows (type, reference_type, reference_id, amount, currency, description, occurred_at)
    VALUES ('income','order',?,?,'VND',?,DATE_SUB(NOW(6), INTERVAL ? DAY))`, [oid, total, 'Thu tien don ' + num, daysAgo]);
  if (coupon && status !== 'cancelled') {
    const [[c]] = await q('SELECT id FROM coupons WHERE code=?', [coupon]);
    await q('INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?,?,?,?)', [c.id, userId, oid, orderDiscount]);
    await q('UPDATE coupons SET used_count = used_count + 1 WHERE id=?', [c.id]);
  }
  // shipment
  const shipStatus = { pending: 'pending', confirmed: 'pending', processing: 'ready', shipping: 'in_transit', delivered: 'delivered', completed: 'delivered', cancelled: 'cancelled' }[status];
  const [[sm]] = shipCode ? await q('SELECT id FROM shipping_methods WHERE code=?', [shipCode]) : [[null]];
  const [sh] = await q(`INSERT INTO shipments (order_id, shipping_method_id, tracking_number, status, shipping_fee, cod_amount)
    VALUES (?,?,?, ?,?,?)`, [oid, sm?.id || null, status === 'pending' || status === 'cancelled' ? null : 'VN' + String(100000 + oid), shipStatus, shipFee, payCode === 'cod' && !paid ? total : 0]);
  const [ois] = await q('SELECT id, quantity FROM order_items WHERE order_id=?', [oid]);
  for (const oi of ois) await q('INSERT INTO shipment_items (shipment_id, order_item_id, quantity) VALUES (?,?,?)', [sh.insertId, oi.id, oi.quantity]);
  if (shipStatus !== 'pending' && shipStatus !== 'cancelled') {
    await q(`INSERT INTO shipment_tracking_events (shipment_id, status, description, location, occurred_at)
      VALUES (?,?,'Da nhan hang','Kho TP.HCM',DATE_SUB(NOW(6), INTERVAL ? DAY))`, [sh.insertId, 'picked_up', daysAgo]);
    await q(`INSERT INTO shipment_tracking_events (shipment_id, status, description, location, occurred_at)
      VALUES (?,?,'Dang van chuyen','TP.HCM',DATE_SUB(NOW(6), INTERVAL ? DAY))`, [sh.insertId, shipStatus, Math.max(0, daysAgo - 1)]);
  }
  if (status === 'delivered' || status === 'completed')
    await q("UPDATE orders SET fulfillment_status='fulfilled' WHERE id=?", [oid]);
  if (status === 'completed')
    await q('UPDATE orders SET completed_at=DATE_SUB(NOW(6), INTERVAL 1 DAY) WHERE id=?', [oid]);
  return oid;
}

(async () => {
  console.log('== Xoa du lieu cu (giu RBAC + seed goc) ==');
  await q('SET FOREIGN_KEY_CHECKS=0');
  for (const tb of WIPE) await q(`TRUNCATE TABLE \`${tb}\``);
  await q('SET FOREIGN_KEY_CHECKS=1');

  console.log('== Anh demo ==');
  const demoImgs = {};
  try {
    await storage.ensureBucket();
    for (const [name, [c1, c2]] of Object.entries(PNG_IMGS)) {
      const buf = gradientPNG(c1, c2);
      const key = 'demo/' + name;
      await storage.putObject(key, buf, 'image/png');
      const [r] = await q(`INSERT INTO media_files (storage_provider, object_key, original_name, mime_type, size_bytes)
        VALUES ('minio',?,?,?,?)`, [key, name, 'image/png', buf.length]);
      demoImgs[name] = r.insertId;
    }
  } catch (e) { console.log('Bo qua anh demo (thieu S3):', e.message); }
  const imgId = (n) => demoImgs[n] || null;

  console.log('== Danh muc / thuong hieu / thuoc tinh ==');
  for (const [name, slug] of [['UniWear', 'uniwear'], ['CasaHome', 'casahome'], ['TechZone', 'techzone']])
    await q('INSERT INTO brands (name, slug, status) VALUES (?,?,\'active\')', [name, slug]);
  const [cFashion] = await q("INSERT INTO categories (name, slug, icon, sort_order, status) VALUES ('Thoi trang','thoi-trang','bi-bag',1,'active')");
  const fashionId = cFashion.insertId;
  const catIds = { fashion: fashionId };
  for (const [name, slug, parent, sort, icon] of [['Ao', 'ao', fashionId, 1, 'bi-tag'], ['Quan', 'quan', fashionId, 2, 'bi-tags'], ['Gia dung', 'gia-dung', null, 2, 'bi-house'], ['Phu kien', 'phu-kien', null, 3, 'bi-headphones']]) {
    const [r] = await q('INSERT INTO categories (parent_id, name, slug, icon, sort_order, status) VALUES (?,?,?,?,?,\'active\')', [parent, name, slug, icon, sort]);
    catIds[slug] = r.insertId;
  }
  const [aColor] = await q("INSERT INTO attributes (name, code, display_type) VALUES ('Mau sac','color','color')");
  const [aSize] = await q("INSERT INTO attributes (name, code, display_type) VALUES ('Co','size','text')");
  const colorIds = {}, sizeIds = {};
  for (const [v, d, hex] of [['Do', 'Do', '#dc2626'], ['Xanh', 'Xanh', '#2563eb'], ['Den', 'Den', '#111111']]) {
    const [r] = await q('INSERT INTO attribute_values (attribute_id, value, display_value, color_hex) VALUES (?,?,?,?)', [aColor.insertId, v, d, hex]);
    colorIds[v] = r.insertId;
  }
  for (const v of ['S', 'M', 'L']) {
    const [r] = await q('INSERT INTO attribute_values (attribute_id, value) VALUES (?,?)', [aSize.insertId, v]);
    sizeIds[v] = r.insertId;
  }

  console.log('== San pham ==');
  const V = {}; // sku -> variant id
  async function addProduct({ brand, cats, attrs, name, slug, price, desc, variants, img }) {
    const [[b]] = await q('SELECT id FROM brands WHERE slug=?', [brand]);
    const [r] = await q(`INSERT INTO products (brand_id, name, slug, short_description, status, base_price, published_at)
      VALUES (?,?,?,?,'active',?,NOW(6))`, [b.id, name, slug, desc, price]);
    const pid = r.insertId;
    for (let i = 0; i < cats.length; i++)
      await q('INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (?,?,?)', [pid, catIds[cats[i]], i === 0]);
    for (const a of attrs || []) {
      const aid = a === 'color' ? aColor.insertId : aSize.insertId;
      await q('INSERT IGNORE INTO product_attributes (product_id, attribute_id) VALUES (?,?)', [pid, aid]);
    }
    for (const [sku, vname, vprice, avids] of variants) {
      const [vr] = await q(`INSERT INTO product_variants (product_id, sku, name, price, status) VALUES (?,?,?,?,'active')`, [pid, sku, vname, vprice]);
      V[sku] = vr.insertId;
      for (const avid of avids || []) await q('INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES (?,?)', [vr.insertId, avid]);
    }
    if (img && imgId(img)) await q('INSERT INTO product_images (product_id, media_id, sort_order, is_primary) VALUES (?,?,0,TRUE)', [pid, imgId(img)]);
    return pid;
  }
  const p1 = await addProduct({ brand: 'uniwear', cats: ['ao'], attrs: ['color', 'size'], name: 'Ao thun basic', slug: 'ao-thun-basic', price: 250000, desc: 'Ao thun cotton thoáng mát', img: 'demo-ao-thun.png', variants: [
    ['ATS-DO-M', 'Do / M', 250000, [colorIds['Do'], sizeIds['M']]],
    ['ATS-XANH-L', 'Xanh / L', 250000, [colorIds['Xanh'], sizeIds['L']]],
    ['ATS-DEN-S', 'Den / S', 240000, [colorIds['Den'], sizeIds['S']]]] });
  const p2 = await addProduct({ brand: 'uniwear', cats: ['quan'], attrs: ['size'], name: 'Quan jeans slim', slug: 'quan-jeans-slim', price: 550000, desc: 'Jeans co giãn', img: 'demo-jeans.png', variants: [
    ['QJN-XANH-32', 'Xanh / 32', 550000, [colorIds['Xanh'], sizeIds['L']]],
    ['QJN-DEN-30', 'Den / 30', 550000, [colorIds['Den'], sizeIds['M']]]] });
  const p3 = await addProduct({ brand: 'casahome', cats: ['gia-dung'], name: 'Noi inox 5L', slug: 'noi-inox-5l', price: 890000, desc: 'Inox 304 đáy 5 lớp', img: 'demo-noi-inox.png', variants: [['NOI-5L', '5L', 890000, []]] });
  const p4 = await addProduct({ brand: 'casahome', cats: ['gia-dung'], name: 'Den ban LED', slug: 'den-ban-led', price: 320000, desc: 'Chống cận 3 màu', img: 'demo-den.png', variants: [['DEN-LED', 'Trắng', 320000, []]] });
  const p5 = await addProduct({ brand: 'techzone', cats: ['phu-kien'], name: 'Sac du phong 20000mAh', slug: 'sac-du-phong-20k', price: 490000, desc: 'Sạc nhanh 22.5W', img: 'demo-sac.png', variants: [['SAC-20K', 'Đen', 490000, []]] });
  const p6 = await addProduct({ brand: 'techzone', cats: ['phu-kien'], name: 'Tai nghe bluetooth', slug: 'tai-nghe-bluetooth', price: 750000, desc: 'Chống ồn ENC', img: 'demo-tainghe.png', variants: [['TNG-BT', 'Đen', 750000, []]] });

  console.log('== Kho ==');
  await q("INSERT INTO warehouses (code, name, address, status) VALUES ('HCM','Kho TP.HCM','Quận 7, TP.HCM','active'),('HN','Kho Ha Noi','Cầu Giấy, Ha Noi','active')");
  for (const sku of Object.keys(V)) {
    await q('INSERT INTO warehouse_stocks (warehouse_id, variant_id, quantity, reserved_quantity, reorder_level) VALUES (1,?,100,0,10)', [V[sku]]);
    if (['ATS-DO-M', 'NOI-5L', 'SAC-20K'].includes(sku))
      await q('INSERT INTO warehouse_stocks (warehouse_id, variant_id, quantity, reserved_quantity, reorder_level) VALUES (2,?,50,0,5)', [V[sku]]);
  }

  console.log('== Ship / coupon / KM ==');
  await q("INSERT INTO shipping_methods (provider_id, code, name, base_fee, is_active, sort_order) VALUES (1,'NHANH','Giao nhanh',30000,TRUE,1),(1,'TIETKIEM','Giao tiet kiem',18000,TRUE,2),(1,'HOATOC','Hoa toc',50000,TRUE,3)");
  await q(`INSERT INTO coupons (code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, used_count, starts_at, expires_at, status)
    VALUES ('CHAO10','percentage',10,200000,50000,1000,0,'2020-01-01','2030-01-01','active'),
           ('FREESHIP','free_shipping',0,NULL,NULL,1000,0,'2020-01-01','2030-01-01','active')`);
  await q(`INSERT INTO promotions (name, code, type, value, maximum_discount_amount, starts_at, ends_at, priority, status)
    VALUES ('Sale he','SALEHE','percentage',15,100000,'2020-01-01','2030-01-01',10,'active')`);

  console.log('== Nguoi dung ==');
  const adminId = await createUser({ email: 'admin@example.com', phone: '0900000001', pw: 'Admin123!', role: 'super_admin', first: 'Quản', last: 'Trị' });
  await createUser({ email: 'manager@example.com', phone: '0900000002', pw: 'Staff123!', role: 'store_manager', first: 'Cửa hàng', last: 'Trưởng' });
  await createUser({ email: 'kho@example.com', phone: '0900000003', pw: 'Staff123!', role: 'warehouse_staff', first: 'Thủ', last: 'Kho' });
  await createUser({ email: 'cskh@example.com', phone: '0900000004', pw: 'Staff123!', role: 'customer_support', first: 'Chăm sóc', last: 'Khách' });
  await createUser({ email: 'mkt@example.com', phone: '0900000005', pw: 'Staff123!', role: 'marketing', first: 'Tiếp', last: 'Thị' });
  const anId = await createUser({ email: 'an@example.com', phone: '0911111111', pw: 'Khach123!', role: 'customer', first: 'An', last: 'Nguyễn',
    addr: { name: 'Nguyễn Văn An', phone: '0911111111', province: 'TP Hồ Chí Minh', district: 'Quận 1', ward: 'P. Bến Nghé', line: '123 Lê Lợi' } });
  const binhId = await createUser({ email: 'binh@example.com', phone: '0922222222', pw: 'Khach123!', role: 'customer', first: 'Bình', last: 'Trần',
    addr: { name: 'Trần Văn Bình', phone: '0922222222', province: 'Hà Nội', district: 'Cầu Giấy', ward: 'P. Dịch Vọng', line: '45 Xuân Thủy' } });
  const chiId = await createUser({ email: 'chi@example.com', phone: '0933333333', pw: 'Khach123!', role: 'customer', first: 'Chi', last: 'Lê',
    addr: { name: 'Lê Thị Chi', phone: '0933333333', province: 'TP Hồ Chí Minh', district: 'Quận 3', ward: 'P.6', line: '78 Cách Mạng Tháng 8' } });
  await q('INSERT INTO wishlists (user_id, name) VALUES (?,?)', [anId, 'Yêu thích']);
  const [[wl]] = await q('SELECT id FROM wishlists WHERE user_id=?', [anId]);
  await q('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?,?)', [wl.id, p6]);

  const addrAn = { name: 'Nguyễn Văn An', phone: '0911111111', email: 'an@example.com', province: 'TP Hồ Chí Minh', district: 'Quận 1', ward: 'P. Bến Nghé', line: '123 Lê Lợi' };
  const addrBinh = { name: 'Trần Văn Bình', phone: '0922222222', email: 'binh@example.com', province: 'Hà Nội', district: 'Cầu Giấy', ward: 'P. Dịch Vọng', line: '45 Xuân Thủy' };
  const addrChi = { name: 'Lê Thị Chi', phone: '0933333333', email: 'chi@example.com', province: 'TP Hồ Chí Minh', district: 'Quận 3', ward: 'P.6', line: '78 Cách Mạng Tháng 8' };

  console.log('== Don hang ==');
  await createOrder({ num: 'ORD-DEMO-0001', userId: anId, status: 'pending', payStatus: 'unpaid', payCode: 'cod',
    items: [{ variantId: V['ATS-DO-M'], qty: 1 }], shipCode: 'NHANH', shipFee: 30000, daysAgo: 1, address: addrAn, note: 'Giao giờ hành chính' });
  await createOrder({ num: 'ORD-DEMO-0002', userId: binhId, status: 'confirmed', payStatus: 'paid', payCode: 'bank_transfer',
    items: [{ variantId: V['QJN-XANH-32'], qty: 1 }], coupon: 'CHAO10', shipCode: 'NHANH', shipFee: 30000, daysAgo: 3, address: addrBinh });
  await createOrder({ num: 'ORD-DEMO-0003', userId: chiId, status: 'shipping', payStatus: 'paid', payCode: 'cod',
    items: [{ variantId: V['SAC-20K'], qty: 2 }], shipCode: 'HOATOC', shipFee: 50000, daysAgo: 2, address: addrChi });
  const o4 = await createOrder({ num: 'ORD-DEMO-0004', userId: anId, status: 'delivered', payStatus: 'paid', payCode: 'cod',
    items: [{ variantId: V['NOI-5L'], qty: 1 }], shipCode: 'TIETKIEM', shipFee: 18000, daysAgo: 5, address: addrAn });
  const o5 = await createOrder({ num: 'ORD-DEMO-0005', userId: binhId, status: 'completed', payStatus: 'paid', payCode: 'cod',
    items: [{ variantId: V['DEN-LED'], qty: 1 }, { variantId: V['TNG-BT'], qty: 1 }], shipCode: 'NHANH', shipFee: 30000, daysAgo: 6, address: addrBinh });
  await createOrder({ num: 'ORD-DEMO-0006', userId: chiId, status: 'cancelled', payStatus: 'unpaid', payCode: 'cod',
    items: [{ variantId: V['ATS-DEN-S'], qty: 1 }], shipCode: 'NHANH', shipFee: 30000, daysAgo: 1, address: addrChi, note: 'Khách đổi ý' });

  console.log('== Review / doi tra / banner / campaign ==');
  await q(`INSERT INTO reviews (product_id, user_id, order_id, rating, title, content, is_verified_purchase, status)
    VALUES (?,?,?,5,'Rất tốt','Sạc nhanh, pin trâu',TRUE,'published')`, [p5, binhId, o5]);
  await q(`INSERT INTO reviews (product_id, user_id, rating, title, content, status)
    VALUES (?,?,4,'Ổn','Đèn sáng đẹp', 'pending')`, [p4, chiId]);
  if (imgId('demo-ao-thun.png'))
    await q(`INSERT INTO review_images (review_id, media_id) VALUES (1,?)`, [imgId('demo-ao-thun.png')]);
  const [[oi4]] = await q('SELECT id FROM order_items WHERE order_id=? LIMIT 1', [o4]);
  const [rr] = await q(`INSERT INTO returns (order_id, user_id, return_number, status, reason_code, reason_detail, customer_note)
    VALUES (?,?,'RET-DEMO-001','requested','wrong_size','Size chật','Muốn đổi size lớn hơn')`, [o4, anId]);
  await q('INSERT INTO return_items (return_id, order_item_id, requested_quantity) VALUES (?,?,1)', [rr.insertId, oi4.id]);
  await q('INSERT INTO return_status_history (return_id, to_status) VALUES (?,?)', [rr.insertId, 'requested']);
  await q(`INSERT INTO banners (title, image_media_id, link_url, sort_order, status) VALUES
    ('Sale hè rực rỡ',?,'/khuyen-mai',1,'active'),('Hàng mới về',?,'/san-pham-moi',2,'active')`,
    [imgId('demo-banner-sale.png'), imgId('demo-ao-thun.png')]);
  const [cp] = await q(`INSERT INTO campaigns (name, description, status, created_by) VALUES ('Khuyến mãi tháng 9','Giảm giá đầu tháng','active',?)`, [adminId]);
  await q('INSERT INTO campaign_products (campaign_id, product_id) VALUES (?,?),(?,?)', [cp.insertId, p1, cp.insertId, p5]);
  await q(`INSERT INTO notifications (user_id, type, title, body) VALUES
    (?, 'order', 'Đơn mới', 'Có đơn hàng mới cần xác nhận'),
    (NULL, 'system', 'Bảo trì', 'Hệ thống bảo trì lúc 2h sáng Chủ nhật')`, [adminId]);
  await q(`INSERT INTO system_settings (setting_key, setting_value, description, is_public) VALUES
    ('shop.menu', ?, 'Menu web bán hàng', TRUE)
    ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), is_public=TRUE`,
    [JSON.stringify([
      { label: 'Hàng Mới', link: '/san-pham' },
      { label: 'Bán Chạy', link: '/san-pham?sap-xep=gia-giam' },
      { label: 'Ưu Đãi Đặc Biệt', link: '/khuyen-mai' },
    ])]);

  const [[u]] = await q('SELECT COUNT(*) n FROM users');
  const [[o]] = await q('SELECT COUNT(*) n FROM orders');
  const [[p]] = await q('SELECT COUNT(*) n FROM products');
  console.log(`== XONG: users=${u.n} orders=${o.n} products=${p.n} ==`);
  await pool.end();
})().catch(async (e) => { console.error('SEED FAIL:', e.message); try { await pool.end(); } catch {} process.exit(1); });
