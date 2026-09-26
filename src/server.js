require('dotenv').config();
const app = require('./app');
const PORT = process.env.PORT || 3000;

// Tạo bucket object storage nếu đã cấu hình S3_* (không chặn server khi storage chưa lên)
try {
  const storage = require('./config/storage');
  if (process.env.S3_ENDPOINT) storage.ensureBucket().catch(e => console.log('S3 init warn:', e.message));
} catch (e) { console.log('S3 init skip:', e.message); }

app.listen(PORT, () => console.log(`UniMate API running on http://localhost:${PORT}`));
