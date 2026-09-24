# UniMate Backend API

Backend bán hàng: Node.js + Express + MySQL + MinIO (S3) + Caddy. Chưa có frontend.

Tài liệu đầy đủ trong **[docs/](docs/README.md)**:
- [docs/API.md](docs/API.md) — tham chiếu toàn bộ endpoint
- [docs/FRONTEND.md](docs/FRONTEND.md) — hướng dẫn tích hợp frontend
- [docs/DOCKER.md](docs/DOCKER.md) — triển khai 1 máy chủ bằng Docker

```powershell
npm install; node seed-admin.js; npm start   # dev: http://localhost:3000 (cần MySQL local)
npm test; npm run test:security              # 27 E2E + 7 bảo mật
Copy-Item .env.docker.example .env.docker
docker compose --env-file .env.docker up -d --build   # stack hoàn chỉnh
```
Admin seed: `admin@example.com` / `Admin123!`.
