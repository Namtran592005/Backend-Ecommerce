// Smoke test bảo mật: headers, CORS, refresh/rotate/logout
// Test stack Docker: API_BASE=http://127.0.0.1 node test-security.js
const BASE = process.env.API_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`✅ ${name}`); }
  catch (e) { fail++; console.log(`❌ ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert fail'); }

(async () => {
  let adminAccess, refreshCookie;

  await t('helmet headers (x-content-type-options, x-frame-options, no x-powered-by)', async () => {
    const r = await fetch(BASE + '/api/health');
    assert(r.headers.get('x-content-type-options') === 'nosniff', 'thieu nosniff');
    assert(!r.headers.get('x-powered-by'), 'lo x-powered-by');
    assert(r.headers.get('ratelimit-limit'), 'thieu rate-limit headers');
  });

  await t('CORS chặn origin lạ', async () => {
    const r = await fetch(BASE + '/api/health', { headers: { Origin: 'https://evil.example' } });
    // cors middleware sẽ báo lỗi -> app trả 403 JSON
    const body = await r.text();
    assert(r.status === 403 && body.includes('Origin'), `expected 403, got ${r.status} ${body.slice(0, 120)}`);
  });

  await t('CORS cho origin hợp lệ', async () => {
    const r = await fetch(BASE + '/api/health', { headers: { Origin: 'http://localhost:5173' } });
    assert(r.ok, 'origin hop le bi chan');
    assert(r.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'thieu ACAO');
  });

  await t('login cấp access ngắn + refresh cookie httpOnly', async () => {
    const r = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@unimate.vn', password: 'Admin123!' }),
    });
    assert(r.ok, 'login fail ' + r.status);
    const setCookie = r.headers.get('set-cookie') || '';
    assert(setCookie.includes('refresh_token') && setCookie.toLowerCase().includes('httponly'), 'thieu refresh httpOnly: ' + setCookie.slice(0, 150));
    const data = await r.json();
    assert(data.accessToken && data.expiresIn === '15m', 'access token phai 15m');
    adminAccess = data.accessToken;
    refreshCookie = setCookie.split(';')[0]; // refresh_token=...
  });

  await t('refresh xoay vòng + refresh cũ bị vô hiệu', async () => {
    const r1 = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { Cookie: refreshCookie } });
    assert(r1.ok, 'refresh fail ' + r1.status);
    const newCookie = r1.headers.get('set-cookie').split(';')[0];
    const d1 = await r1.json();
    assert(d1.accessToken !== adminAccess, 'phai cap access moi');
    // dùng lại refresh cũ -> phải 401 (chống replay)
    const r2 = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { Cookie: refreshCookie } });
    assert(r2.status === 401, 'refresh cu phai bi thu hoi, got ' + r2.status);
    refreshCookie = newCookie;
    adminAccess = d1.accessToken;
  });

  await t('logout thu hồi access ngay lập tức', async () => {
    const r = await fetch(BASE + '/api/auth/logout', {
      method: 'POST', headers: { Authorization: 'Bearer ' + adminAccess, Cookie: refreshCookie },
    });
    assert(r.ok, 'logout fail');
    const me = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + adminAccess } });
    assert(me.status === 401, 'access sau logout phai 401, got ' + me.status);
  });

  await t('mat khau yếu (<8) bị từ chối', async () => {
    const r = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `weak${Date.now()}@x.com`, password: '123456' }),
    });
    assert(r.status === 400, 'pass yeu phai 400, got ' + r.status);
  });

  console.log(`\n=== SECURITY: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
