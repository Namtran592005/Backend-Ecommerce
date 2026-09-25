# UniMate Backend — API Sàn Bán Hàng

![UniMate](docs/logo-light.png)

Hệ thống backend (máy chủ xử lý logic + lưu trữ) cho website bán hàng UniMate:
quản lý sản phẩm, kho, đơn hàng, thanh toán, vận chuyển, khuyến mãi đến báo cáo.
Frontend (web khách / trang quản trị) gọi vào đây qua **REST API** (chuẩn giao tiếp
phổ biến: gửi yêu cầu HTTP, nhận dữ liệu JSON).

## Tính năng chính

| Nghiệp vụ | Mô tả |
|---|---|
| Tài khoản & phân quyền (RBAC) | Đăng ký/đăng nhập JWT (token ngắn 15 phút + token làm mới 30 ngày), menu/chức năng theo vai trò: Super Admin, Quản lý cửa hàng, Kho, CSKH, Marketing |
| Bán hàng | Sản phẩm + biến thể (màu/size), tồn kho đa kho, giỏ hàng, mã giảm giá, checkout trừ kho trong transaction (giao dịch nguyên tử: đúng hoặc không làm gì) |
| Sau bán | Thanh toán (COD/chuyển khoản/ví, webhook idempotent — cổng thanh toán gọi lại nhiều lần cũng chỉ tính 1 lần), vận đơn + tracking, đổi trả, đánh giá, hoàn tiền, hóa đơn |
| Media & Marketing | Upload ảnh/video/tệp lên kho object storage chuẩn S3 (MinIO), banner, chiến dịch, gửi email HTML qua SMTP |
| Vận hành | Nhật ký kiểm toán (audit log), cấu hình hệ thống, báo cáo doanh thu, rate-limit chống brute-force, CORS whitelist |

Chi tiết từng endpoint: [`docs/API.md`](docs/API.md).

## Chạy nhanh (2 cách)

**A. Docker — khuyên dùng (1 lệnh là đủ MySQL + API + MinIO + Admin + HTTPS):**
```powershell
Copy-Item .env.docker.example .env.docker   # sửa domain + mật khẩu trong file
docker compose --env-file .env.docker up -d --build
```
Mở `https://API_DOMAIN/api/health` → `{"ok":true,"db":"up"}` là chạy.
Chi tiết: [`docs/DOCKER.md`](docs/DOCKER.md).

**B. Chạy tay (Node + MySQL local):**
```powershell
npm install
node import-db.js   # nạp db/schema.sql vào MySQL root/admin@localhost (lần đầu)
node seed-admin.js  # tạo tài khoản quản trị
npm start           # http://localhost:3000
```

## Tài khoản demo (dữ liệu mẫu `npm run db:seed-demo`)

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản trị tối cao | `admin@example.com` | `Admin123!` |
| Quản lý / Kho / CSKH / Tiếp thị | `manager@`, `kho@`, `cskh@`, `mkt@example.com` | `Staff123!` |
| Khách hàng | `an@`, `binh@`, `chi@example.com` | `Khach123!` |

> Đổi mật khẩu admin ngay sau khi deploy thật (`PUT /api/auth/password`).

## Kiểm thử
```powershell
npm test              # 28 case end-to-end: checkout, trừ kho, thanh toán, media...
npm run test:security # 7 case bảo mật: CORS, refresh xoay vòng, thu hồi token
# Test stack Docker: $env:API_BASE='http://127.0.0.1/api'; node test-api.js
```

## Cấu trúc
```
backend/
├── db/              # schema.sql (nguồn chân lý) + build-init.js + seed-demo.js
├── docs/            # API.md · FRONTEND.md · DOCKER.md (tài liệu chi tiết)
├── docker/          # mysql-init/ · caddy/Caddyfile
├── src/
│   ├── config/      # db.js (MySQL pool) · storage.js (S3/MinIO) · mailer.js (SMTP)
│   ├── middleware/  # auth.js (JWT + RBAC + thu hồi phiên) · security.js (CORS, rate-limit, HTTPS)
│   ├── routes/      # 12 module: auth, users, catalog, media, email, inventory,
│   │                # cart, orders, payments, shipping, promotions, reviews, extra
│   └── app.js / server.js
├── Dockerfile · docker-compose.yml · .env.docker.example
└── test-api.js · test-security.js · seed-admin.js · import-db.js
```

## Ghi chú kỹ thuật
- Tiền VND `DECIMAL(15,2)`, thời gian lưu UTC, giá luôn tính lại phía server.
- Mọi câu lệnh SQL đều tham số hóa (chống SQL injection); lỗi production giấu chi tiết.
- MySQL chỉ nghe mạng nội bộ Docker; trình duyệt gọi API duy nhất qua Caddy (HTTPS).
