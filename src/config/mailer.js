const nodemailer = require('nodemailer');

function smtpConfig(publicOnly = false) {
  const cfg = {
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true', // true cho port 465
    from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
  };
  if (!publicOnly) {
    cfg.user = process.env.SMTP_USER || null;
    cfg.hasPass = !!process.env.SMTP_PASS;
  }
  cfg.configured = !!(cfg.host && cfg.from);
  return cfg;
}

let transporter = null;
function mailer() {
  const c = smtpConfig();
  if (!c.configured || !process.env.SMTP_USER || !process.env.SMTP_PASS)
    throw Object.assign(new Error('Chua cau hinh SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM)'), { status: 503 });
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return { transporter, from: c.from };
}

async function sendMail({ to, subject, html, text }) {
  const { transporter, from } = mailer();
  const cleanHtml = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  return transporter.sendMail({
    from, to,
    subject: String(subject || '').slice(0, 200),
    html: cleanHtml,
    text: text || cleanHtml.replace(/<[^>]+>/g, ' ').slice(0, 5000),
  });
}

module.exports = { smtpConfig, sendMail };
