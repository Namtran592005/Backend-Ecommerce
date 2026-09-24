const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { dbCheck } = require('./config/db');
const { authLimiter, apiLimiter, httpsRedirect, corsOptions } = require('./middleware/security');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const catalogRoutes = require('./routes/catalog');
const inventoryRoutes = require('./routes/inventory');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const shippingRoutes = require('./routes/shipping');
const promosRoutes = require('./routes/promotions');
const reviewsRoutes = require('./routes/reviews');
const mediaRoutes = require('./routes/media');
const emailRoutes = require('./routes/email');
const extraRoutes = require('./routes/extra');

const app = express();
const isProd = (process.env.NODE_ENV || 'development') === 'production';

if ((process.env.TRUST_PROXY || '') === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(httpsRedirect);
app.use(helmet({
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: false, // API JSON thuần, không cần CSP nặng; bật khi có frontend cùng domain
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(cors(corsOptions()));
app.use(cookieParser());
app.use(express.json({ limit: '500kb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use('/api/', apiLimiter);

app.get('/', (req, res) => res.json({ name: 'UniMate API', version: '1.0.0', docs: '/api/health' }));
app.get('/api/health', async (req, res) => {
  try { await dbCheck(); res.json({ ok: true, db: 'up', time: new Date().toISOString() }); }
  catch (e) { res.status(500).json({ ok: false, db: 'down', error: isProd ? 'DB error' : e.message }); }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', catalogRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/promos', promosRoutes);
app.use('/api', reviewsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/email', emailRoutes);
app.use('/api', extraRoutes);

// CORS bị chặn -> JSON rõ ràng thay vì crash
// eslint-disable-next-line
app.use((err, req, res, next) => {
  if (err && String(err.message || '').startsWith('CORS blocked')) {
    return res.status(403).json({ error: 'Origin khong duoc phep' });
  }
  next(err);
});

// 404 + error (prod giấu chi tiết)
app.use((req, res) => res.status(404).json({ error: 'Endpoint khong ton tai: ' + req.path }));
// eslint-disable-next-line
app.use((err, req, res, next) => {
  if (isProd) { console.error(err.message); return res.status(500).json({ error: 'Loi server' }); }
  console.error(err); res.status(500).json({ error: err.message || 'Loi server' });
});

module.exports = app;
