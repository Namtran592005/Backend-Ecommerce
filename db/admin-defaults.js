// Mật khẩu quản trị mặc định khi cài mới. Dùng chung cho seed-admin.js và db/seed-demo.js
// để hai nơi không bao giờ lệch nhau. Đổi ADMIN_PASSWORD trong .env.docker để tự chọn.
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'Admin@123';

module.exports = { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD };
