# Triển khai Docker — UniMate (1 máy chủ là chạy)

Stack 5 container: **MySQL 8.0** (tự tạo schema + seed) → **backend** (Node 22,
tự seed admin) → **MinIO** (kho ảnh/video/tệp S3) → **admin** (trang quản trị,
nginx) → **Caddy** (HTTPS tự động + `/files` + trang admin).

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
- MySQL không mở port ra ngoài · Caddy tự xin/gia hạn Let's Encrypt.
- File công khai: `https://API_DOMAIN/files/...` · Console MinIO: `http://127.0.0.1:9001` trên máy chủ.
- Test không cần domain: `API_DOMAIN=http://IP` + thêm `FORCE_HTTPS=0`, `COOKIE_SECURE=0`.

## 6. Sự cố thường gặp
| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Backend `Restarting`, log `ECONNREFUSED mysql:3306` | MySQL chưa mở TCP xong — backend tự thử lại ~60s rồi mới chạy; cứ đợi |
| `pull access denied for minio/minio` | Image đã chuyển sang `quay.io/minio/minio` (compose đã sửa đúng) |
| Upload 201 nhưng mở URL 404 | Caddy chưa load Caddyfile mới → `docker restart unimate-caddy-1` (Caddy tắt admin API nên không `reload` được) |
| `GET /api/...` 301 về `https://` khi test HTTP | Đang bật `FORCE_HTTPS=1` — test local thì đặt `FORCE_HTTPS=0`, `COOKIE_SECURE=0` |
| Muốn nhập lại schema | Sửa `db/schema.sql` → `npm run db:init` (sinh lại `docker/mysql-init/01-schema.sql`, kèm fix key `object_key`) → `down -v` + `up -d` |
| Quên mật khẩu trong `.env.docker` | Nằm trong file đó trên server; DB thì `docker exec` vào mysql reset |
