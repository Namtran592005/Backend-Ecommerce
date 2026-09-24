const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Thử kết nối lại tối đa ~60s (chờ MySQL trong Docker sẵn sàng TCP)
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
  const email = 'admin@example.com';
  const password = 'Admin123!';
  const hash = await bcrypt.hash(password, 10);
  let [[u]] = await pool.query('SELECT * FROM users WHERE email=?', [email]);
  if (!u) {
    const [r] = await pool.query("INSERT INTO users (email, password_hash, status, email_verified_at) VALUES (?,?, 'active', NOW(6))", [email, hash]);
    u = { id: r.insertId };
    await pool.query('INSERT INTO user_profiles (user_id, display_name) VALUES (?,?)', [u.id, 'Admin']);
    console.log('created admin id', u.id);
  } else {
    await pool.query("UPDATE users SET password_hash=?, status='active' WHERE id=?", [hash, u.id]);
    console.log('updated admin id', u.id);
  }
  const [[role]] = await pool.query("SELECT id FROM roles WHERE code='super_admin'");
  await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [u.id, role.id]);
  console.log(`Seed admin xong: ${email} / ${password}`);
  await pool.end();
})();
