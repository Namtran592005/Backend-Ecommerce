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
    const [rows] = await pool.query(`SELECT u.id, u.email, u.phone, u.status, u.must_change_password,
      u.email_verified_at, u.last_login_at, u.created_at, u.deleted_at,
      GROUP_CONCAT(r.code) roles FROM users u
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
    const [r] = await pool.query("INSERT INTO users (email, phone, password_hash, status, must_change_password) VALUES (?,?,?,'active',?)",
      [em, phone || null, hash, req.body.must_change_password ? 1 : 0]);
    await pool.query('INSERT INTO user_profiles (user_id, first_name, last_name, display_name) VALUES (?,?,?,?)',
      [r.insertId, first_name || null, last_name || null, [first_name, last_name].filter(Boolean).join(' ') || em || phone]);
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?,?,?)', [r.insertId, role.id, req.user.id]);
    const [[row]] = await pool.query('SELECT * FROM users WHERE id=?', [r.insertId]);
    delete row.password_hash;
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/users/:id/reset-password — quản trị đặt lại mật khẩu cho tài khoản khác
router.post('/:id/reset-password', authRequired, requirePerm('users.write'), async (req, res) => {
  const id = req.params.id;
  const password = String(req.body?.password || '');
  const mustChange = req.body?.must_change_password !== false;
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Mat khau phai 8-128 ky tu' });
  try {
    const [[target]] = await pool.query('SELECT id, email, phone FROM users WHERE id=? AND deleted_at IS NULL', [id]);
    if (!target) return res.status(404).json({ error: 'Khong tim thay nguoi dung' });
    if (String(target.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Dung muc doi mat khau cua ban o trang Ho so' });
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash=?, must_change_password=? WHERE id=?',
      [hash, mustChange ? 1 : 0, id]);
    await pool.query('UPDATE user_sessions SET revoked_at=NOW(6) WHERE user_id=? AND revoked_at IS NULL', [id]);
    res.json({ ok: true, must_change_password: mustChange, sessions_revoked: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/users/:id
router.get('/:id', authRequired, async (req, res) => {  const id = req.params.id;
  if (String(req.user.id) !== String(id) && !req.user.permissions.includes('users.read') && !req.user.roles.includes('super_admin'))
    return res.status(403).json({ error: 'Khong co quyen' });
  const [[user]] = await pool.query('SELECT * FROM users WHERE id=?', [id]);
  if (!user) return res.status(404).json({ error: 'Khong tim thay' });
  delete user.password_hash;
  const [[profile]] = await pool.query('SELECT * FROM user_profiles WHERE user_id=?', [id]);
  const [roles] = await pool.query(`SELECT r.* FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`, [id]);
  const [addresses] = await pool.query('SELECT * FROM user_addresses WHERE user_id=?', [id]);
  res.json({ user, profile, roles, addresses });
});

// PATCH /api/users/:id/status
router.patch('/:id/status', authRequired, requirePerm('users.write'), async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'active', 'inactive', 'suspended', 'deleted'].includes(status)) return res.status(400).json({ error: 'Status sai' });
  if (String(req.user.id) === String(req.params.id) && status !== 'active')
    return res.status(400).json({ error: 'Khong the tu tat tai khoan dang dang nhap' });
  if (status === 'deleted') await pool.query('UPDATE users SET status=?, deleted_at=NOW(6) WHERE id=?', [status, req.params.id]);
  else await pool.query('UPDATE users SET status=?, deleted_at=NULL WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
});

router.put('/:id', authRequired, requirePerm('users.write'), async (req, res) => {
  const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Khong tim thay' });
  const { email, phone, status, first_name, last_name, display_name, gender, date_of_birth, marketing_opt_in } = req.body || {};
  if (email !== undefined && email !== null && email !== '') {
    const [[dup]] = await pool.query('SELECT id FROM users WHERE email=? AND id<>?', [email, u.id]);
    if (dup) return res.status(409).json({ error: 'Email da duoc dung' });
  }
  if (phone !== undefined && phone !== null && phone !== '') {
    const [[dup]] = await pool.query('SELECT id FROM users WHERE phone=? AND id<>?', [phone, u.id]);
    if (dup) return res.status(409).json({ error: 'So dien thoai da duoc dung' });
  }
  if (status !== undefined && !['pending', 'active', 'inactive', 'suspended'].includes(status))
    return res.status(400).json({ error: 'Status sai' });
  if (status !== undefined && String(req.user.id) === String(u.id) && status !== 'active')
    return res.status(400).json({ error: 'Khong the tu tat tai khoan dang dang nhap' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE users SET email=?,phone=?,status=? WHERE id=?',
      [email === '' ? null : email ?? u.email, phone === '' ? null : phone ?? u.phone, status || u.status, u.id]);
    if ([first_name, last_name, display_name, gender, date_of_birth, marketing_opt_in].some((v) => v !== undefined)) {
      await conn.query('INSERT IGNORE INTO user_profiles (user_id) VALUES (?)', [u.id]);
      const [[p]] = await conn.query('SELECT * FROM user_profiles WHERE user_id=?', [u.id]);
      await conn.query(`UPDATE user_profiles SET first_name=?,last_name=?,display_name=?,gender=?,date_of_birth=?,marketing_opt_in=? WHERE user_id=?`,
        [first_name ?? p.first_name, last_name ?? p.last_name, display_name ?? p.display_name,
          gender || p.gender, date_of_birth === '' ? null : date_of_birth ?? p.date_of_birth,
          marketing_opt_in === undefined ? p.marketing_opt_in : !!marketing_opt_in, u.id]);
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); return res.status(400).json({ error: e.message }); } finally { conn.release(); }
  const [[full]] = await pool.query('SELECT id,email,phone,status,created_at FROM users WHERE id=?', [u.id]);
  res.json(full);
});

router.delete('/:id', authRequired, requirePerm('users.write'), async (req, res) => {
  const uid = req.params.id;
  if (String(req.user.id) === String(uid)) return res.status(400).json({ error: 'Khong the xoa chinh tai khoan dang dang nhap' });
  const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [uid]);
  if (!u) return res.status(404).json({ error: 'Khong tim thay' });
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code=\'super_admin\'', [uid]);
  if (n > 0 && req.query.force !== '1')
    return res.status(409).json({ error: 'Day la tai khoan Super Admin. Chon xoa manh (force) neu chac chan', can_force: true });
  const [[{ o }]] = await pool.query("SELECT COUNT(*) o FROM orders WHERE user_id=? AND status NOT IN ('cancelled','returned','refunded')", [uid]);
  if (req.query.force !== '1')
    return res.status(409).json({ error: `Tai khoan co ${o} don hinh thinh. Xoa an (status=deleted) hoac them ?force=1`, can_force: true, order_count: o });
  await pool.query('DELETE FROM users WHERE id=?', [uid]);
  res.json({ ok: true, soft: false });
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
  const [[r]] = await pool.query('SELECT * FROM roles WHERE id=?', [req.params.roleId]);
  if (!r) return res.status(404).json({ error: 'Khong tim thay vai tro' });
  if (r.code === 'super_admin') {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE rr.code=\'super_admin\'');
    if (n <= 1) return res.status(400).json({ error: 'Phai giu it nhat 1 Super Admin' });
    if (String(req.user.id) === String(req.params.id))
      return res.status(400).json({ error: 'Khong the tu go Super Admin cho chinh minh' });
  }
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
