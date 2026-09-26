# UniMate Backend — API sàn bán hàng

Node.js + Express + MySQL. Xử lý toàn bộ nghiệp vụ: sản phẩm, kho, đơn hàng, thanh toán,
vận chuyển, khuyến mãi, đánh giá, báo cáo. Hai giao diện ([admin](../admin), [client](../client))
gọi vào đây qua REST API.

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| MySQL | **9.7 LTS** | Hỗ trợ tới 21/04/2034. MySQL 8.0 đã EOL từ 21/04/2026 |
| Object storage | **RustFS** (`rustfs/rustfs:latest`) | Giấy phép Apache 2.0, tương thích S3 |
| Node | 22 | |

## Chạy

```powershell
Copy-Item .env.docker.example .env.docker   # sửa mật khẩu + domain
docker compose --env-file .env.docker up -d --build
```

Lệnh trên dựng **5 container**: MySQL, RustFS, backend, admin, client. Kiểm tra:

```powershell
curl http://127.0.0.1:3000/api/health     # {"ok":true,"db":"up"}
```

| Service | Cổng | Vai trò |
|---|---|---|
| backend | 3000 | REST API |
| admin | 8080 | Trang quản trị |
| client | 8081 | Web bán hàng |
| objectstore | 9000 / 9001 | Ảnh, video, tệp · console |

Nạp dữ liệu mẫu (12 user, 22 sản phẩm, 13 đơn, 71 ảnh SVG tự sinh):

```powershell
docker exec unimate-backend-1 npm run db:seed-demo
```

Triển khai thật, Caddy, backup: [`docs/DOCKER.md`](docs/DOCKER.md).

### Chạy tay (không dùng Docker)

```powershell
npm install
node import-db.js          # nạp db/schema.sql (lần đầu)
node seed-admin.js         # tạo tài khoản quản trị
npm start                  # http://localhost:3000
```

## Tài khoản demo

Có sẵn sau khi chạy `npm run db:seed-demo`.

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản trị tối cao | `admin@example.com` | `Admin123!` |
| Quản lý cửa hàng | `manager@example.com` | `Staff123!` |
| Thủ kho | `kho@example.com` | `Staff123!` |
| Chăm sóc khách hàng | `cskh@example.com` | `Staff123!` |
| Marketing | `mkt@example.com` | `Staff123!` |
| Khách hàng | `an@`, `binh@`, `chi@`, `dung@`, `hieu@`, `lan@`, `minh@example.com` | `Khach123!` |

Đổi mật khẩu admin ngay sau khi deploy thật.

## Lệnh npm

| Lệnh | Việc |
|---|---|
| `npm start` | Chạy server |
| `npm test` | 28 test end-to-end (checkout, trừ kho, thanh toán, media) |
| `npm run test:security` | 7 test bảo mật (CORS, xoay token, thu hồi phiên) |
| `npm run db:seed-demo` | Nạp lại dữ liệu mẫu |
| `npm run db:init` | Sinh lại `docker/mysql-init/01-schema.sql` từ `db/schema.sql` |
| `npm run db:import` | Nạp schema vào MySQL local |
| `npm run seed` | Tạo 1 tài khoản admin |

Test cần server đang chạy. Trỏ sang API khác:
`$env:API_BASE='https://api.example.com/api'; npm test`

## Cấu trúc

```
src/
├── config/       db.js (pool MySQL) · storage.js (S3) · mailer.js (SMTP)
├── middleware/   auth.js (JWT + RBAC) · security.js (CORS, rate-limit, HTTPS)
├── routes/       13 module nghiệp vụ: auth, users, catalog, media, inventory,
│                 cart, orders, payments, shipping, promotions, reviews, email…
└── app.js        middleware + đăng ký route
db/
├── schema.sql            nguồn chân lý về cấu trúc bảng
├── build-init.js         sinh docker/mysql-init/01-schema.sql
├── demo-art.js           vẽ ảnh SVG tự sinh cho dữ liệu mẫu
└── seed-demo.js          nạp dữ liệu mẫu
```

Đổi cấu trúc bảng: sửa `db/schema.sql` → `npm run db:init` → `docker compose down -v` →
`up -d`. Chi tiết từng endpoint: [`docs/API.md`](docs/API.md).

## Quy ước kỹ thuật

- Tiền VND lưu `DECIMAL(15,2)`, thời gian lưu UTC, giá luôn tính lại ở server.
- Mọi câu SQL đều tham số hóa. Lỗi production không trả chi tiết ra ngoài.
- Checkout trừ kho trong transaction: đặt hàng xong hoặc không thay đổi gì.
- Webhook thanh toán idempotent — cổng gọi lại nhiều lần vẫn chỉ ghi nhận một lần.
- MySQL chỉ nghe mạng nội bộ Docker. Trình duyệt chỉ gọi API qua Caddy (HTTPS).
