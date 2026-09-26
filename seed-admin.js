const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('./src/config/db');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIN_LEN = 12;

function randomPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const sym = '!@#$%^&*-_=+';
  const all = upper + lower + digit + sym;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(sym)];
  while (chars.length < 20) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Chờ kết nối DB nội bộ (lần đầu MySQL trong Docker sẵn sàng TCP)
async function waitForDb(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      console.log(`Cho MySQL... lan ${i}/${retries} (${e.code || e.message})`);
      if (i === retries) throw e;
      await sleep(delayMs);
    }
  }
}

(async () => {
  await waitForDb();

  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;

  if (!password) {
    password = randomPassword();
    generated = true;
  } else if (password.length < MIN_LEN) {
    console.error(`ADMIN_PASSWORD phai it nhat ${MIN_LEN} ky tu.`);
    process.exit(1);
  }

  const [[role]] = await pool.query("SELECT id FROM roles WHERE code='super_admin'");
  if (!role) {
    console.error('Khong tim thay role super_admin. Can nap lai schema truoc (npm run db:init + down -v + up -d).');
    process.exit(1);
  }

  const [[existing]] = await pool.query(
    'SELECT u.id, u.email FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role_id = ? LIMIT 1',
    [role.id]
  );
  if (existing) {
    console.log(`Da co tai khoan quan tri (${existing.email}). Giu nguyen mat khau, khong doi gi.`);
    await pool.end();
    return;
  }

  if (await pool.query('SELECT 1 FROM users WHERE email=?', [email]).then(([r]) => r.length)) {
    console.error(`Email ${email} da ton tai nhung chua gan role super_admin. Gan tay hoac doi ADMIN_EMAIL.`);
    process.exit(1);
  }

  const name = (process.env.ADMIN_NAME || 'Admin').trim();
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query(
    "INSERT INTO users (email, password_hash, status, email_verified_at) VALUES (?,?, 'active', NOW(6))",
    [email, hash]
  );
  await pool.query('INSERT INTO user_profiles (user_id, display_name) VALUES (?,?)', [r.insertId, name]);
  await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [r.insertId, role.id]);

  console.log('============================================================');
  console.log('  Da tao tai khoan quan tri');
  console.log(`  Email:    ${email}`);
  if (generated) {
    console.log(`  Mat khau: ${password}`);
    console.log('  -> Mat khau sinh ngau nhien, CHI IN O DAY MOT LAN.');
    console.log('  -> Luu lai ngay, doi trong trang quan tri sau khi dang nhap.');
  } else {
    console.log('  Mat khau: lay tu ADMIN_PASSWORD');
  }
  console.log('============================================================');

  await pool.end();
})().catch(async (e) => {
  console.error('Seed admin that bai:', e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
