const rateLimit = require('express-rate-limit');

// Chống brute-force cho login/register/refresh: 30 req / 10 phút / IP.
// skipSuccessfulRequests: đăng nhập ĐÚNG không tính — chỉ chặn kẻ đoán mật khẩu,
// người dùng thật không bao giờ bị khóa oan vì bấm thử.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Sai qua nhieu lan, thu lai sau 10 phut' },
});

// Giới hạn chung cho toàn API: 300 req / 1 phút / IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Qua nhieu request, thu lai sau' },
});

// Nếu deploy sau reverse proxy (Nginx/Cloudflare) + HTTPS: redirect http -> https
function httpsRedirect(req, res, next) {
  if (process.env.FORCE_HTTPS !== '1') return next();
  const proto = req.get('x-forwarded-proto') || req.protocol;
  if (proto !== 'https') {
    const host = req.get('host');
    return res.redirect(301, 'https://' + host + req.originalUrl);
  }
  next();
}

function corsOptions() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  // Dev: cho phép localhost. Prod: BẮT BUỘC khai báo domain frontend.
  // Phải có đủ cả localhost và 127.0.0.1 vì 2 dạng này là origin khác nhau.
  const devDefaults = [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
    'http://localhost:8080', 'http://127.0.0.1:8080',
    'http://localhost:8081', 'http://127.0.0.1:8081',
  ];
  const allow = list.length ? list : devDefaults;
  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/postman/mobile
      if (allow.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked: ' + origin));
    },
    credentials: true, // cho phép gửi refresh-cookie cross-site
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  };
}

module.exports = { authLimiter, apiLimiter, httpsRedirect, corsOptions };
