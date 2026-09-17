# Tài liệu UniMate Backend

| File | Dành cho ai | Nội dung |
|---|---|---|
| [API.md](API.md) | Backend + Frontend | **Tham chiếu API đầy đủ**: quy ước chung, toàn bộ endpoint theo nhóm (method, quyền, body, response), bảng enum/trạng thái |
| [FRONTEND.md](FRONTEND.md) | Team frontend | Tích hợp: luồng auth (axios mẫu), màn hình shop/tài khoản/admin, upload ảnh, gọi từ xa |
| [DOCKER.md](DOCKER.md) | DevOps/deploy | Triển khai 1 máy chủ: MySQL + backend + MinIO + Caddy HTTPS, vận hành, backup, sự cố thường gặp |

## Chạy nhanh (dev local)
```powershell
cd E:\Unimate\backend
npm install
node import-db.js   # import db/schema.sql vào MySQL root/admin@localhost (lần đầu)
node seed-admin.js  # tạo admin
npm start           # http://localhost:3000
npm test            # 28 case E2E (checkout, kho, payment, media...)
npm run test:security  # 7 case bảo mật
# Test stack Docker đang chạy: thêm API_BASE trước lệnh
# $env:API_BASE='http://127.0.0.1/api'; node test-api.js
# $env:API_BASE='http://127.0.0.1'; node test-security.js
```

## Chạy bằng Docker (khuyên dùng)
```powershell
Copy-Item .env.docker.example .env.docker   # sửa domain + mật khẩu
docker compose --env-file .env.docker up -d --build
# chi tiết: DOCKER.md
```

## Tài khoản
- Admin: `admin@unimate.vn` / `Admin123!` (role `super_admin`, đổi pass ngay khi deploy)
- Khách: tự `POST /api/auth/register` (role `customer`)

## Cấu trúc repo
```
backend/
├── docs/            # tài liệu (bạn đang ở đây)
├── db/              # schema.sql (nguồn chân lý) + build-init.js (sinh init cho Docker)
├── src/
│   ├── config/      # db.js, storage.js (S3/MinIO)
│   ├── middleware/  # auth.js (JWT+RBAC), security.js (CORS, rate-limit)
│   ├── routes/      # auth, users, catalog, media, inventory, cart,
│   │                # orders, payments, shipping, promotions, reviews, extra
│   ├── app.js
│   └── server.js
├── docker/          # mysql-init/, caddy/Caddyfile
├── docker-compose.yml
├── Dockerfile
├── test-api.js / test-security.js
└── seed-admin.js / import-db.js
```
