const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');

const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
const SECRET = () => process.env.JWT_SECRET || 'unimate-dev-secret-change-me';

function signAccess(user) {
  // jti ngẫu nhiên: tránh 2 token cùng giây bị trùng hash (unique key user_sessions)
  return jwt.sign({ id: user.id, typ: 'access' }, SECRET(), { expiresIn: ACCESS_EXPIRES, jwtid: crypto.randomBytes(8).toString('hex') });
}
function signRefresh(user) {
  return jwt.sign({ id: user.id, typ: 'refresh', r: crypto.randomBytes(8).toString('hex') }, SECRET(), { expiresIn: REFRESH_EXPIRES });
}
// giu ten cu cho tương thích test cũ
function signToken(user) { return signAccess(user); }
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function refreshCookieOptions() {
  const prod = (process.env.NODE_ENV || 'development') === 'production';
  const secureWanted = process.env.COOKIE_SECURE === '1' || prod;
  return {
    httpOnly: true,
    secure: secureWanted, // cross-site bắt buộc Secure + SameSite=None
    sameSite: secureWanted ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 3600 * 1000,
  };
}

async function loadUserWithRoles(id) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [id]);
  if (!user || user.status !== 'active') return null;
  const [roles] = await pool.query('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?', [id]);
  const [perms] = await pool.query(
    `SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id
     JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=?`, [id]);
  return { ...user, roles: roles.map(r => r.code), permissions: perms.map(p => p.code) };
}

// access token + kiểm tra session chưa bị thu hồi (logout có hiệu lực ngay)
async function authRequired(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Thieu token' });
    const payload = jwt.verify(token, SECRET());
    if (payload.typ && payload.typ !== 'access') return res.status(401).json({ error: 'Sai loai token' });
    const [[sess]] = await pool.query(
      'SELECT id FROM user_sessions WHERE session_token_hash=? AND revoked_at IS NULL AND expires_at > NOW(6)', [hashToken(token)]);
    if (!sess) return res.status(401).json({ error: 'Token het han hoac da logout' });
    const user = await loadUserWithRoles(payload.id);
    if (!user) return res.status(401).json({ error: 'User khong ton tai hoac bi khoa' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token khong hop le' });
  }
}

function authOptional(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next();
  (async () => {
    try {
      const payload = jwt.verify(token, SECRET());
      const [[sess]] = await pool.query(
        'SELECT id FROM user_sessions WHERE session_token_hash=? AND revoked_at IS NULL AND expires_at > NOW(6)', [hashToken(token)]);
      if (!sess) return next();
      const user = await loadUserWithRoles(payload.id);
      if (user) req.user = user;
    } catch (_) { /* token sai -> coi như khách */ }
    next();
  })();
}

function requirePerm(...codes) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chua dang nhap' });
    if (req.user.roles.includes('super_admin')) return next();
    const ok = codes.some(c => req.user.permissions.includes(c));
    if (!ok) return res.status(403).json({ error: 'Khong co quyen: ' + codes.join(',') });
    next();
  };
}

async function logAudit({ actor_user_id, action, entity_type, entity_id, old_values = null, new_values = null, req }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (?,?,?,?,?,?,?,?)`,
      [actor_user_id || null, action, entity_type, entity_id || null,
        old_values ? JSON.stringify(old_values) : null,
        new_values ? JSON.stringify(new_values) : null,
        req ? (req.ip || null) : null, req ? String(req.headers['user-agent'] || '').slice(0, 900) : null]);
  } catch (_) { /* ignore */ }
}

module.exports = { signToken, signAccess, signRefresh, hashToken, refreshCookieOptions, authRequired, authOptional, requirePerm, logAudit };
