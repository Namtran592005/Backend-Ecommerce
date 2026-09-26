# Triển khai Docker — UniMate (1 máy chủ là chạy)

Stack 6 container: **MySQL 8.0** (tự tạo schema + seed) → **backend** (Node 22,
tự seed admin, cổng 3000) → **MinIO** (kho ảnh/video/tệp S3, cổng 9000) →
**admin** (trang quản trị, nginx, cổng 8080) → **client** (web bán hàng, nginx,
cổng 8081) → **Caddy** (chỉ chạy với `--profile edge`).

## Mô hình mạng

- **Mặc định: 1 VPS + Caddy NGOÀI của bạn.** Mỗi service mở 1 cổng trên
  `BIND_ADDR` (mặc định `127.0.0.1`). Caddy ngoài trỏ 3 domain về 3 cổng +
  lo HTTPS. Ví dụ Caddyfile:
  ```caddy
  api.example.com   { reverse_proxy 127.0.0.1:3000 }
  admin.example.com { reverse_proxy 127.0.0.1:8080 }
  www.example.com   { reverse_proxy 127.0.0.1:8081 }
  ```
  (Kèm `/files/* → 127.0.0.1:9000` ở domain API để phục vụ ảnh, khớp `S3_PUBLIC_URL`.)
- **All-in-one:** thêm `--profile edge` để bật Caddy nội bộ (HTTPS tự động,
  dùng `API_DOMAIN/ADMIN_DOMAIN/CLIENT_DOMAIN`).
- **Nhiều máy:** service nào ở máy nào thì đổi `*_HOST/*_URL` tương ứng
  (`DB_HOST`, `S3_ENDPOINT`, `S3_PUBLIC_URL`, `ADMIN_API_BASE`...), đặt
  `BIND_ADDR=0.0.0.0` + firewall cho máy cần gọi qua LAN. Đổi `*_API_BASE`
  phải build lại image frontend (`up -d --build admin/client`).

## 1. Máy chủ (Ubuntu 22.04+)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # đăng nhập lại
sudo ufw allow 80,443/tcp
```
DNS: bản ghi `A  api.<domain> → IP máy chủ`.
Frontend gọi `https://api.<domain>/api/...`.

## 2. Mang code lên
```bash
scp -r E:/Unimate/backend user@SERVER_IP:/opt/unimate   # chạy trên máy dev
```
Cần: `Dockerfile`, `docker-compose.yml`, `docker/`, `src/`, `seed-admin.js`,
`package.json`, `package-lock.json`, `.env.docker.example` (không cần `node_modules`, `.env`, `docs/`).

## 3. Cấu hình — chỉ 1 file `.env.docker`
```bash
cd /opt/unimate
cp .env.docker.example .env.docker && nano .env.docker
```
```ini
API_DOMAIN=api.example.com
ALLOWED_ORIGINS=https://shop.example.com
MYSQL_ROOT_PASSWORD=<mạnh 1>
MYSQL_USER=unimate
MYSQL_PASSWORD=<mạnh 2>
JWT_SECRET=<openssl rand -hex 32>
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<mạnh 3>
S3_BUCKET=unimate
S3_PUBLIC_URL=https://api.example.com/files/unimate
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=shop@example.com
SMTP_PASS=<app-password>
SMTP_FROM=UniMate <shop@example.com>
# Trang quan tri (doi ADMIN_API_BASE phai build lai: up -d --build admin)
ADMIN_DOMAIN=admin.example.com
ADMIN_API_BASE=https://api.example.com/api
# Web ban hang: domain that (VD www.example.com) hoac test noi bo http://127.0.0.1:8081
CLIENT_DOMAIN=www.example.com
# API + file ma web goi (phai khop API_DOMAIN). Doi phai build lai client
CLIENT_API_BASE=https://api.example.com/api
CLIENT_FILES_BASE=https://api.example.com/files/unimate
```
> Mặc định `FORCE_HTTPS=1, COOKIE_SECURE=1` (đúng cho HTTPS thật, đừng sửa).
> Muốn dùng AWS S3/R2 thay MinIO: sửa các biến `S3_*` của backend là xong.

## 4. Chạy & kiểm tra
```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f backend   # xem seed admin + server
curl https://api.example.com/api/health   # {"ok":true,"db":"up",...}
```
Login admin `POST .../api/auth/login`
`{ "identifier": "admin@example.com", "password": "Admin123!" }`
→ **đổi mật khẩu ngay** (`PUT /api/auth/password`).
Mở trang quản trị: `https://admin.example.com` (đăng nhập tài khoản nhân sự).
Mở web bán hàng: `https://www.example.com`.

## 5. Vận hành
```bash
docker compose --env-file .env.docker logs -f [mysql|backend|minio|admin|caddy]
docker compose --env-file .env.docker restart backend
docker compose --env-file .env.docker up -d --build backend   # deploy code backend mới
docker compose --env-file .env.docker up -d --build admin     # deploy admin mới (đổi code/VITE_API_BASE)
# Backup DB mỗi đêm
docker compose --env-file .env.docker exec mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" unimate | gzip > /backup/unimate-$(date +%F).sql.gz
# Backup ảnh
docker run --rm -v unimate_minio-data:/data -v /backup:/b alpine tar czf /b/minio-$(date +%F).tar.gz /data
# Dựng lại từ đầu (XÓA HẾT DỮ LIỆU)
docker compose --env-file .env.docker down -v && docker compose --env-file .env.docker up -d
# Nạp dữ liệu demo chuẩn (6 SP, 6 đơn đủ trạng thái, 8 user @example.com, coupon, banner...)
docker cp db/seed-demo.js unimate-backend-1:/app/db/seed-demo.js
docker exec unimate-backend-1 node db/seed-demo.js
```
- MySQL không mở port ra ngoài (chỉ mở khi cần cho máy khác) · Caddy ngoài/loại edge tự xin/gia hạn Let's Encrypt.
- File công khai: qua `/files` (Caddy ngoài hoặc profile edge) trỏ tới MinIO `:9000` · Console MinIO: `http://127.0.0.1:9001` trên máy chủ.
- Test không cần domain: `API_DOMAIN=http://IP` + thêm `FORCE_HTTPS=0`, `COOKIE_SECURE=0`.

## 6. Sự cố thường gặp
| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Backend `Restarting`, log `ECONNREFUSED mysql:3306` | MySQL chưa mở TCP xong — backend tự thử lại ~60s rồi mới chạy; cứ đợi |
| `401 Unauthorized` khi pull `quay.io/minio/minio` | MinIO đã archive bản community (02/2026) + gỡ khỏi Docker Hub, quay.io không còn public. Compose dùng mirror `openvidu/minio` |
| `pull access denied for minio/minio` | Repo Docker Hub đã bị xoá hoàn toàn — đừng dùng tag `minio/minio`, hãy để compose khai báo `openvidu/minio` |
| Upload 201 nhưng mở URL 404 | Caddy chưa load Caddyfile mới → `docker restart unimate-caddy-1` (Caddy tắt admin API nên không `reload` được) |
| `GET /api/...` 301 về `https://` khi test HTTP | Đang bật `FORCE_HTTPS=1` — test local thì đặt `FORCE_HTTPS=0`, `COOKIE_SECURE=0` |
| Muốn nhập lại schema | Sửa `db/schema.sql` → `npm run db:init` (sinh lại `docker/mysql-init/01-schema.sql`, kèm fix key `object_key`) → `down -v` + `up -d` |
| Quên mật khẩu trong `.env.docker` | Nằm trong file đó trên server; DB thì `docker exec` vào mysql reset |
| Cổng 8080/8081 `connection refused` dù container Up | Proxy port Docker bị kẹt (Windows): `down` rồi `up -d` lại để dựng sạch |
