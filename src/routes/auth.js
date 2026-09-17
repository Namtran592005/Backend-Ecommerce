const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/db');
const { signAccess, signRefresh, hashToken, refreshCookieOptions, authRequired } = require('../middleware/auth');

const router = express.Router();
const check = (req, res) => {
  const e = validationResult(req);
  if (!e.isEmpty()) { res.status(400).json({ error: 'Du lieu khong hop le', details: e.array() }); return false; }
  return true;
};
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : null);

// Luu cặp access/refresh vào user_sessions (logout/refresh có hiệu lực ngay)
async function createSession(userId, req, access, refresh) {
  await pool.query(`INSERT INTO user_sessions (user_id, session_token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
    VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [userId, hashToken(access), hashToken(refresh), req.ip || null, String(req.headers['user-agent'] || '').slice(0, 900)]);
}
function issuePair(res, user) {
  const access = signAccess(user);
  const refresh = signRefresh(user);
  res.cookie('refresh_token', refresh, refreshCookieOptions());
  return { access, refresh };
}

// POST /api/auth/register
router.post('/register',
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isLength({ min: 6, max: 20 }),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Mat khau toi thieu 8 ky tu'),
  async (req, res) => {
    if (!check(req, res)) return;
    const { phone, password, first_name, last_name } = req.body;
    const email = normEmail(req.body.email);
    if (!email && !phone) return res.status(400).json({ error: 'Can email hoac phone' });
    try {
      if (email) { const [[ex]] = await pool.query('SELECT id FROM users WHERE email=?', [email]); if (ex) return res.status(409).json({ error: 'Email da ton tai' }); }
      if (phone) { const [[ex]] = await pool.query('SELECT id FROM users WHERE phone=?', [phone]); if (ex) return res.status(409).json({ error: 'Phone da ton tai' }); }
      const hash = await bcrypt.hash(password, 12);
      const [r] = await pool.query(
        "INSERT INTO users (email, phone, password_hash, status) VALUES (?,?,?,'active')", [email, phone || null, hash]);
      const uid = r.insertId;
      await pool.query(`INSERT INTO user_profiles (user_id, first_name, last_name, display_name) VALUES (?,?,?,?)`,
        [uid, first_name || null, last_name || null, [first_name, last_name].filter(Boolean).join(' ') || email || phone]);
      const [[role]] = await pool.query("SELECT id FROM roles WHERE code='customer'");
      if (role) await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [uid, role.id]);
      const [[user]] = await pool.query('SELECT * FROM users WHERE id=?', [uid]);
      const { access, refresh } = issuePair(res, user);
      await createSession(uid, req, access, refresh);
      res.status(201).json({ token: access, accessToken: access, expiresIn: process.env.JWT_EXPIRES_IN || '15m', user: { id: uid, email, phone, status: 'active' } });
    } catch (e) {
      const prod = process.env.NODE_ENV === 'production';
      res.status(500).json({ error: prod ? 'Loi server' : e.message });
    }
  });

// POST /api/auth/login
router.post('/login', body('identifier').notEmpty().trim(), body('password').notEmpty(), async (req, res) => {
  if (!check(req, res)) return;
  const identifier = String(req.body.identifier).trim();
  const idLower = identifier.toLowerCase();
  const { password } = req.body;
  try {
    const [[user]] = await pool.query('SELECT * FROM users WHERE (email=? OR email=? OR phone=?) AND deleted_at IS NULL', [identifier, idLower, identifier]);
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Sai tai khoan/mat khau' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Sai tai khoan/mat khau' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Tai khoan: ' + user.status });
    await pool.query('UPDATE users SET last_login_at=NOW(6) WHERE id=?', [user.id]);
    const { access, refresh } = issuePair(res, user);
    await createSession(user.id, req, access, refresh);
    const [roles] = await pool.query(`SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`, [user.id]);
    res.json({ token: access, accessToken: access, expiresIn: process.env.JWT_EXPIRES_IN || '15m', user: { id: user.id, email: user.email, phone: user.phone, roles: roles.map(r => r.code) } });
  } catch (e) {
    const prod = process.env.NODE_ENV === 'production';
    res.status(500).json({ error: prod ? 'Loi server' : e.message });
  }
});

// POST /api/auth/refresh — xoay vòng refresh token (chống replay)
router.post('/refresh', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const old = req.cookies?.refresh_token || req.body?.refresh_token;
  if (!old) return res.status(401).json({ error: 'Thieu refresh token' });
  try {
    const payload = jwt.verify(old, process.env.JWT_SECRET || 'unimate-dev-secret-change-me');
    if (payload.typ !== 'refresh') return res.status(401).json({ error: 'Sai loai token' });
    const [[sess]] = await pool.query(
      'SELECT * FROM user_sessions WHERE refresh_token_hash=? AND revoked_at IS NULL AND expires_at > NOW(6)', [hashToken(old)]);
    if (!sess) return res.status(401).json({ error: 'Refresh token het han hoac da thu hoi' });
    const [[user]] = await pool.query('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [payload.id]);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'User bi khoa' });
    // thu hồi cặp cũ, cấp cặp mới
    await pool.query('UPDATE user_sessions SET revoked_at=NOW(6) WHERE id=?', [sess.id]);
    const { access, refresh } = issuePair(res, user);
    await createSession(user.id, req, access, refresh);
    res.json({ token: access, accessToken: access, expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
  } catch (e) {
    const prod = process.env.NODE_ENV === 'production';
    return res.status(401).json({ error: 'Refresh token khong hop le', detail: prod ? undefined : e.message });
  }
});

// POST /api/auth/logout — thu hồi cả access + refresh
router.post('/logout', authRequired, async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) await pool.query('UPDATE user_sessions SET revoked_at=NOW(6) WHERE session_token_hash=?', [hashToken(token)]);
  const rf = req.cookies?.refresh_token;
  if (rf) await pool.query('UPDATE user_sessions SET revoked_at=NOW(6) WHERE refresh_token_hash=?', [hashToken(rf)]);
  res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authRequired, async (req, res) => {
  const [[profile]] = await pool.query('SELECT * FROM user_profiles WHERE user_id=?', [req.user.id]);
  const [addresses] = await pool.query('SELECT * FROM user_addresses WHERE user_id=? ORDER BY is_default DESC, id DESC', [req.user.id]);
  res.json({ user: { id: req.user.id, email: req.user.email, phone: req.user.phone, status: req.user.status, roles: req.user.roles, permissions: req.user.permissions }, profile, addresses });
});

// PUT /api/auth/me
router.put('/me', authRequired, async (req, res) => {
  const { first_name, last_name, display_name, avatar_url, date_of_birth, gender, marketing_opt_in } = req.body;
  await pool.query(`INSERT INTO user_profiles (user_id, first_name, last_name, display_name, avatar_url, date_of_birth, gender, marketing_opt_in)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name),
    display_name=VALUES(display_name), avatar_url=VALUES(avatar_url), date_of_birth=VALUES(date_of_birth),
    gender=VALUES(gender), marketing_opt_in=VALUES(marketing_opt_in)`,
    [req.user.id, first_name || null, last_name || null, display_name || null, avatar_url || null, date_of_birth || null, gender || 'unknown', !!marketing_opt_in]);
  res.json({ ok: true });
});

// PUT /api/auth/password — đổi pass thì đá mọi phiên khác
router.put('/password', authRequired, body('old_password').notEmpty(), body('new_password').isLength({ min: 8, max: 128 }), async (req, res) => {
  if (!check(req, res)) return;
  const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [req.user.id]);
  const ok = await bcrypt.compare(req.body.old_password, u.password_hash || '');
  if (!ok) return res.status(400).json({ error: 'Mat khau cu sai' });
  const hash = await bcrypt.hash(req.body.new_password, 12);
  await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
  const h = req.headers.authorization || '';
  const cur = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (cur) await pool.query('UPDATE user_sessions SET revoked_at=NOW(6) WHERE user_id=? AND session_token_hash<>?', [req.user.id, hashToken(cur)]);
  else await pool.query('UPDATE user_sessions SET revoked_at=NOW(6) WHERE user_id=?', [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
