// Test end-to-end UniMate API (Node 18+ co fetch san)
// Mặc định test local (:3000); test stack Docker: API_BASE=http://127.0.0.1/api node test-api.js
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
let pass = 0, fail = 0;
async function t(name, fn) {
  try { const r = await fn(); pass++; console.log(`✅ ${name}`); return r; }
  catch (e) { fail++; console.log(`❌ ${name}: ${e.message}`); return null; }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assert fail'); }
async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

(async () => {
  console.log('=== UniMate API E2E ===');
  const health = await t('health', () => api('GET', '/health'));
  assert(health.ok, 'health fail');

  const adminLogin = await t('admin login', () => api('POST', '/auth/login', { identifier: 'admin@unimate.vn', password: 'Admin123!' }));
  const ADMIN = adminLogin?.token; assert(ADMIN, 'no admin token');

  const custEmail = `test${Date.now()}@gmail.com`;
  const reg = await t('register customer', () => api('POST', '/auth/register', { email: custEmail, password: 'Test123!', first_name: 'Test', last_name: 'User' }));
  const TOKEN = reg?.token; assert(TOKEN, 'no customer token');

  await t('get me', () => api('GET', '/auth/me', null, TOKEN));

  // CATALOG (admin tao)
  const brand = await t('create brand', () => api('POST', '/brands', { name: 'Test Brand ' + Date.now() }, ADMIN));
  const cat = await t('create category', () => api('POST', '/categories', { name: 'Cat ' + Date.now() }, ADMIN));
  const product = await t('create product', () => api('POST', '/products', {
    name: 'Ao thun test ' + Date.now(), base_price: 250000, status: 'active', brand_id: brand.id, category_ids: [cat.id], sku: 'SKU' + Date.now(),
  }, ADMIN));
  const variant = await t('create variant', () => api('POST', `/products/${product.id}/variants`, { sku: 'V' + Date.now(), price: 250000, name: 'Size M' }, ADMIN));

  // WAREHOUSE + STOCK
  const wh = await t('create warehouse', () => api('POST', '/inventory/warehouses', { code: 'WH' + Date.now(), name: 'Kho HCM' }, ADMIN));
  await t('set stock 100', () => api('PUT', '/inventory/stocks', { warehouse_id: wh.id, variant_id: variant.id, quantity: 100, reorder_level: 5 }, ADMIN));

  // CART
  const session = 'sess-' + Date.now();
  await t('add to cart', () => api('POST', '/cart/items', { variant_id: variant.id, quantity: 2, session_id: session }));
  await t('get cart', () => api('GET', `/cart?session_id=${session}`));

  // COUPON
  const coupon = await t('create coupon', () => api('POST', '/promos/coupons', { code: 'SALE' + String(Date.now()).slice(-6), type: 'percentage', value: 10, maximum_discount_amount: 50000 }, ADMIN));
  await t('validate coupon', () => api('POST', '/promos/coupons/validate', { code: coupon.code, order_amount: 500000 }));

  // CHECKOUT (quan trong nhat: transaction + tru kho server-side)
  const order = await t('checkout', () => api('POST', '/orders/checkout', {
    items: [{ variant_id: variant.id, quantity: 2 }],
    shipping_address: { recipient_name: 'Nguyen Van A', phone: '0901234567', province_name: 'TP Ho Chi Minh', address_line: '123 Le Loi' },
    coupon_code: coupon.code, payment_method_code: 'cod', customer_note: 'Giao gio hanh chinh',
  }, TOKEN));
  assert(order && order.order_number, 'checkout no order_number');
  console.log('   order_number:', order.order_number, 'total:', order.total_amount);

  await t('get order detail', () => api('GET', `/orders/${order.id}`, null, TOKEN));
  const stocks = await t('check stock giam', () => api('GET', `/inventory/stocks?variant_id=${variant.id}`, null, ADMIN));
  assert(stocks[0].quantity === 98, 'stock phai = 98, got ' + JSON.stringify(stocks[0]));

  // PAYMENT mark paid
  const pays = await t('list payments', () => api('GET', `/payments?order_id=${order.id}`, null, ADMIN));
  await t('mark paid', () => api('POST', `/payments/${pays[0].id}/mark-paid`, {}, ADMIN));

  // SHIPPING
  const ships = await t('list shipments', () => api('GET', `/shipping/shipments?order_id=${order.id}`, null, ADMIN));
  await t('ship status in_transit', () => api('PATCH', `/shipping/shipments/${ships[0].id}/status`, { status: 'in_transit' }, ADMIN));

  // ORDER status flow
  await t('order confirmed', () => api('PATCH', `/orders/${order.id}/status`, { status: 'confirmed' }, ADMIN));
  await t('order processing', () => api('PATCH', `/orders/${order.id}/status`, { status: 'processing' }, ADMIN));

  // REVIEW
  await t('create review', () => api('POST', '/reviews', { product_id: product.id, rating: 5, title: 'Tot', content: 'Chat luong ok' }, TOKEN));

  // REPORT
  await t('report summary', () => api('GET', '/reports/summary', null, ADMIN));

  // PROMO/banner/campaign
  await t('create banner', () => api('POST', '/banners', { title: 'Sale 9.9', status: 'active' }, ADMIN));
  await t('public banners', () => api('GET', '/banners'));

  // MEDIA (can object storage; skip neu chua cau hinh S3)
  await t('upload media', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
    const res = await fetch(BASE + '/media/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN }, body: fd });
    if (res.status === 503) { console.log('   (skip: chua cau hinh S3)'); return; }
    const m = await res.json();
    if (!res.ok) throw new Error('upload -> ' + res.status + ' ' + JSON.stringify(m).slice(0, 200));
    assert(m.id && m.url, 'thieu id/url');
    const f = await fetch(m.url);
    const buf = Buffer.from(await f.arrayBuffer());
    assert(f.status === 200 && buf.length === png.length, 'tai lai file sai');
    const link = await api('POST', `/products/${product.id}/images`, { media_id: m.id, is_primary: true }, ADMIN);
    assert(link.id, 'gan anh SP fail');
    const delUsed = await fetch(BASE + `/media/${m.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + ADMIN } });
    assert(delUsed.status === 409, 'xoa anh dang dung phai 409');
    await api('DELETE', `/product-images/${link.id}`, undefined, ADMIN);
    await api('DELETE', `/media/${m.id}`, undefined, ADMIN);
  });

  console.log(`\n=== KET QUA: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
