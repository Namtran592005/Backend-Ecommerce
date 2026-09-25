const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const { paged } = require('../utils/helpers');

const router = express.Router();

// Static meta routes PHẢI đứng trước /:id (Express khớp theo thứ tự)
router.get('/meta/roles', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM roles ORDER BY id');
  res.json(rows);
});
router.get('/meta/permissions', authRequired, requirePerm('users.read'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM permissions ORDER BY id');
  res.json(rows);
});

// GET /api/users
router.get('/', authRequired, requirePerm('users.read'), async (req, res) => {
  const { page, limit, offset } = paged(req);
  const { search = '', status = '' } = req.query;
  const where = []; const p = [];
  if (search) { where.push('(u.email LIKE ? OR u.phone LIKE ?)'); p.push(`%${search}%`, `%${search}%`); }
  if (status) { where.push('u.status=?'); p.push(status); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM users u ${w}`, p);
    const [rows] = await pool.query(`SELECT u.*, GROUP_CONCAT(r.code) roles FROM users u
      LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
      ${w} GROUP BY u.id ORDER BY u.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
    res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/users — tạo tài khoản (dùng để thêm nhân sự + gán vai trò)
router.post('/', authRequired, requirePerm('users.write'), async (req, res) => {
  const { email, phone, password, first_name, last_name, role_code = 'customer' } = req.body;
  const em = email ? String(email).trim().toLowerCase() : null;
  if (!em && !phone) return res.status(400).json({ error: 'Can email hoac phone' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Mat khau toi thieu 8 ky tu' });
  try {
    if (em) { const [[ex]] = await pool.query('SELECT id FROM users WHERE email=?', [em]); if (ex) return res.status(409).json({ error: 'Email da ton tai' }); }
    if (phone) { const [[ex]] = await pool.query('SELECT id FROM users WHERE phone=?', [phone]); if (ex) return res.status(409).json({ error: 'Phone da ton tai' }); }
    const [[role]] = await pool.query('SELECT id FROM roles WHERE code=?', [role_code]);
    if (!role) return res.status(400).json({ error: 'Vai tro khong ton tai' });
    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.query("INSERT INTO users (email, phone, password_hash, status) VALUES (?,?,?,'active')", [em, phone || null, hash]);
    await pool.query('INSERT INTO user_profiles (user_id, first_name, last_name, display_name) VALUES (?,?,?,?)',
      [r.insertId, first_name || null, last_name || null, [first_name, last_name].filter(Boolean).join(' ') || em || phone]);
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?,?,?)', [r.insertId, role.id, req.user.id]);
    const [[row]] = await pool.query('SELECT * FROM users WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/users/:id
router.get('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  if (String(req.user.id) !== String(id) && !req.user.permissions.includes('users.read') && !req.user.roles.includes('super_admin'))
    return res.status(403).json({ error: 'Khong co quyen' });
  const [[user]] = await pool.query('SELECT * FROM users WHERE id=?', [id]);
  if (!user) return res.status(404).json({ error: 'Khong tim thay' });
  const [[profile]] = await pool.query('SELECT * FROM user_profiles WHERE user_id=?', [id]);
  const [roles] = await pool.query(`SELECT r.* FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`, [id]);
  const [addresses] = await pool.query('SELECT * FROM user_addresses WHERE user_id=?', [id]);
  res.json({ user, profile, roles, addresses });
});

// PATCH /api/users/:id/status
router.patch('/:id/status', authRequired, requirePerm('users.write'), async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'active', 'inactive', 'suspended', 'deleted'].includes(status)) return res.status(400).json({ error: 'Status sai' });
  if (status === 'deleted') await pool.query('UPDATE users SET status=?, deleted_at=NOW(6) WHERE id=?', [status, req.params.id]);
  else await pool.query('UPDATE users SET status=?, deleted_at=NULL WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
});

// POST /api/users/:id/roles
router.post('/:id/roles', authRequired, requirePerm('users.write'), async (req, res) => {
  const { role_code, role_id } = req.body;
  let rid = role_id;
  if (!rid && role_code) { const [[r]] = await pool.query('SELECT id FROM roles WHERE code=?', [role_code]); rid = r?.id; }
  if (!rid) return res.status(400).json({ error: 'Thieu role' });
  await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?,?,?)', [req.params.id, rid, req.user.id]);
  res.status(201).json({ ok: true });
});
router.delete('/:id/roles/:roleId', authRequired, requirePerm('users.write'), async (req, res) => {
  await pool.query('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [req.params.id, req.params.roleId]);
  res.json({ ok: true });
});

// Addresses: POST /api/users/:id/addresses
router.post('/:id/addresses', authRequired, async (req, res) => {
  const uid = req.params.id;
  if (String(req.user.id) !== String(uid) && !req.user.roles.includes('super_admin') && !req.user.permissions.includes('users.write'))
    return res.status(403).json({ error: 'Khong co quyen' });
  const { label, recipient_name, phone, province_name, district_name, ward_name, address_line, is_default, province_code, district_code, ward_code, postal_code } = req.body;
  if (!recipient_name || !phone || !province_name || !address_line) return res.status(400).json({ error: 'Thieu truong bat buoc' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (is_default) await conn.query('UPDATE user_addresses SET is_default=FALSE WHERE user_id=?', [uid]);
    const [r] = await conn.query(`INSERT INTO user_addresses (user_id,label,recipient_name,phone,province_code,province_name,district_code,district_name,ward_code,ward_name,address_line,postal_code,is_default)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uid, label || null, recipient_name, phone, province_code || null, province_name, district_code || null, district_name || null, ward_code || null, ward_name || null, address_line, postal_code || null, !!is_default]);
    await conn.commit();
    const [[row]] = await pool.query('SELECT * FROM user_addresses WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { await conn.rollback(); res.status(500).json({ error: e.message }); } finally { conn.release(); }
});
router.put('/addresses/:addrId', authRequired, async (req, res) => {
  const [[a]] = await pool.query('SELECT * FROM user_addresses WHERE id=?', [req.params.addrId]);
  if (!a) return res.status(404).json({ error: 'Khong tim thay' });
  if (String(a.user_id) !== String(req.user.id) && !req.user.roles.includes('super_admin') && !req.user.permissions.includes('users.write'))
    return res.status(403).json({ error: 'Khong co quyen' });
  const f = { ...a, ...req.body };
  if (req.body?.is_default) await pool.query('UPDATE user_addresses SET is_default=FALSE WHERE user_id=?', [a.user_id]);
  await pool.query(`UPDATE user_addresses SET label=?,recipient_name=?,phone=?,province_code=?,province_name=?,district_code=?,district_name=?,ward_code=?,ward_name=?,address_line=?,postal_code=?,is_default=? WHERE id=?`,
    [f.label, f.recipient_name, f.phone, f.province_code, f.province_name, f.district_code, f.district_name, f.ward_code, f.ward_name, f.address_line, f.postal_code, !!f.is_default, a.id]);
  const [[row]] = await pool.query('SELECT * FROM user_addresses WHERE id=?', [a.id]);
  res.json(row);
});
router.delete('/addresses/:addrId', authRequired, async (req, res) => {
  const [[a]] = await pool.query('SELECT * FROM user_addresses WHERE id=?', [req.params.addrId]);
  if (!a) return res.status(404).json({ error: 'Khong tim thay' });
  if (String(a.user_id) !== String(req.user.id) && !req.user.roles.includes('super_admin') && !req.user.permissions.includes('users.write'))
    return res.status(403).json({ error: 'Khong co quyen' });
  await pool.query('DELETE FROM user_addresses WHERE id=?', [a.id]);
  res.json({ ok: true });
});

module.exports = router;
