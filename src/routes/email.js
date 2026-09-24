const express = require('express');
const { pool } = require('../config/db');
const { authRequired, requirePerm, logAudit } = require('../middleware/auth');
const { smtpConfig, sendMail } = require('../config/mailer');

const router = express.Router();
const MAX_RCPT = 200;
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

// GET /api/email/config — xem SMTP đã cấu hình chưa (không lộ pass)
router.get('/config', authRequired, requirePerm('promotions.read'), (req, res) => {
  res.json(smtpConfig(true));
});

// POST /api/email/test — gửi thử 1 mail
router.post('/test', authRequired, requirePerm('promotions.write'), async (req, res) => {
  const { to } = req.body;
  if (!isEmail(to)) return res.status(400).json({ error: 'Email nhan sai' });
  try {
    await sendMail({ to, subject: 'Thu nghiem UniMate', html: '<h3>SMTP hoat dong tot</h3><p>Mail test tu UniMate Admin.</p>' });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// POST /api/email/send — gửi HTML cho nhiều người
router.post('/send', authRequired, requirePerm('promotions.write'), async (req, res) => {
  let { to, subject, html } = req.body;
  if (!Array.isArray(to)) to = [];
  to = [...new Set(to.map((s) => String(s).trim().toLowerCase()))].filter(isEmail).slice(0, MAX_RCPT);
  if (!to.length) return res.status(400).json({ error: 'Danh sach email trong' });
  if (!subject || !html) return res.status(400).json({ error: 'Thieu tieu de/noi dung' });
  if (String(html).length > 200000) return res.status(400).json({ error: 'Noi dung qua dai (200KB)' });
  const sent = []; const failed = [];
  for (const addr of to) {
    try { await sendMail({ to: addr, subject, html }); sent.push(addr); }
    catch (e) { failed.push({ to: addr, error: e.message }); }
  }
  await logAudit({ actor_user_id: req.user.id, action: 'email.send', entity_type: 'email', new_values: { subject, sent: sent.length, failed: failed.length }, req });
  res.json({ sent: sent.length, failed });
});

module.exports = router;
