const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');
const { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } = require('./db/admin-defaults');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIN_LEN = 8;

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

  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  if (password.length < MIN_LEN) {
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
    "INSERT INTO users (email, password_hash, status, email_verified_at, must_change_password) VALUES (?,?, 'active', NOW(6), 1)",
    [email, hash]
  );
  await pool.query('INSERT INTO user_profiles (user_id, display_name) VALUES (?,?)', [r.insertId, name]);
  await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [r.insertId, role.id]);

  console.log('============================================================');
  console.log('  Da tao tai khoan quan tri mac dinh');
  console.log(`  Email:    ${email}`);
  console.log(`  Mat khau: ${password}`);
  console.log('  -> Lan dang nhap dau tien, he thong bat buoc doi mat khau.');
  console.log('============================================================');

  await pool.end();
})().catch(async (e) => {
  console.error('Seed admin that bai:', e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
