# API Reference — UniMate Backend

Base URL dev: `http://localhost:3000`. Production: `https://API_DOMAIN`.
Mọi endpoint đều bắt đầu bằng `/api`. Ký hiệu 🔒 = cần đăng nhập
(header `Authorization: Bearer <accessToken>`).

## 0. Quy ước chung

- Request/response JSON (`Content-Type: application/json`), trừ `POST /media/upload` (multipart).
- Tiền VND là **number** (VD `250000`). Thời gian trả về chuỗi ISO UTC —
  frontend convert sang `Asia/Ho_Chi_Minh` để hiển thị.
- Lỗi chuẩn `{ "error": "..." }`: 400 dữ liệu sai · 401 chưa/sai token ·
  403 thiếu quyền · 404 không thấy · 409 xung đột (trùng/dang dùng).
- List phân trang: `GET ?page=1&limit=20` →
  `{ data: [...], pagination: { page, limit, total, totalPages } }`.
- Rate-limit: auth 20 req/10p/IP · toàn API 300 req/1p/IP.
- Token: access 15 phút + refresh cookie httpOnly 30 ngày (xoay vòng).
  Chi tiết tích hợp xem [FRONTEND.md](FRONTEND.md#1-xác-thực--axios-mẫu).

## 1. Auth — `/api/auth`

| Method & path | Auth | Body | Response |
|---|---|---|---|
| `POST /register` | — | `{ email? , phone?, password (≥8), first_name?, last_name? }` (cần email HOẶC phone) | 201 `{ token, accessToken, expiresIn, user }` + set cookie refresh |
| `POST /login` | — | `{ identifier (email/phone), password }` | 200 như trên + `user.roles[]` |
| `POST /refresh` | cookie | — | 200 `{ accessToken, expiresIn }` · 401 → login lại |
| `POST /logout` | 🔒 | — | 200 `{ ok:true }` (thu hồi cả 2 token) |
| `GET /me` | 🔒 | — | `{ user:{ id, email, phone, status, roles[], permissions[] }, profile, addresses[] }` |
| `PUT /me` | 🔒 | `{ first_name?, last_name?, display_name?, avatar_url?, date_of_birth?, gender?, marketing_opt_in? }` | 200 `{ ok:true }` |
| `PUT /password` | 🔒 | `{ old_password, new_password (≥8) }` | 200 (đá mọi phiên khác) |

Roles: `super_admin | store_manager | warehouse_staff | customer_support | marketing | customer`
(`super_admin` bypass mọi quyền).

## 2. Users & RBAC — `/api/users`

| Method & path | Quyền | Ghi chú |
|---|---|---|
| `GET /?search=&status=&page=` | `users.read` | Kèm `roles` mỗi user |
| `GET /meta/roles`, `GET /meta/permissions` | 🔒 / `users.read` | Dựng dropdown phân quyền |
| `GET /:id` | chính mình hoặc `users.read` | `{ user, profile, roles, addresses }` |
| `PATCH /:id/status` | `users.write` | `{ status: pending\|active\|inactive\|suspended\|deleted }` |
| `POST /:id/roles` | `users.write` | `{ role_code }` hoặc `{ role_id }` |
| `POST /` | `users.write` | Tạo tài khoản + gán vai trò: `{ email?, phone?, password (≥8), first_name?, last_name?, role_code? }` (dùng thêm nhân sự) |
| `DELETE /:id/roles/:roleId` | `users.write` | |
| `POST /:id/addresses` | chính mình / `users.write` | Bắt buộc `recipient_name, phone, province_name, address_line`; `is_default` auto reset cái cũ |
| `PUT /addresses/:addrId`, `DELETE /addresses/:addrId` | chủ địa chỉ / `users.write` | |

## 3. Catalog — `/api/...`

- Brands: `GET /brands` (public) · `POST /brands { name, description?, logo_media_id?, status? }` ·
  `PUT /brands/:id` · `DELETE /brands/:id` (tắt, không xóa cứng). Quyền ghi: `products.write`.
- Categories: `GET /categories` · `GET /categories/tree` (cây `children[]` làm menu) ·
  `POST /categories { parent_id?, name, description?, image_media_id?, sort_order? }` ·
  `PUT/DELETE /categories/:id`. Quyền ghi: `categories.write`.
- Products:
  - `GET /products?search=&category_id=&brand_id=&page=` — khách chỉ thấy `active`;
    kèm `brand_name, images[], variant_count`.
  - `GET /products/slug/:slug` — chi tiết: `variants[]` (kèm `available_qty`),
    `images, categories, review_summary { c, avg_rating }`.
  - `GET /products/:id` — chi tiết + variants/images/categories.
  - `POST /products { name, base_price, brand_id?, status?, category_ids[]?, sku?, ... }` ·
    `PUT /products/:id` (kèm `category_ids[]` để set lại) · `DELETE` (archive + `deleted_at`).
- Variants: `POST /products/:id/variants { sku, price, name?, barcode?, ..., attribute_value_ids[]? }` ·
  `PUT /variants/:id` · `DELETE /variants/:id` (tắt).
- Attributes: `GET /attributes` (kèm `values[]`) · `POST /attributes { name, code, display_type?, sort_order? }` ·
  `POST /attributes/:id/values { value, display_value?, color_hex?, ... }`.
- Images: `POST /products/:id/images { media_id, variant_id?, sort_order?, is_primary?, alt_text? }` ·
  `PUT /product-images/:id { sort_order?, is_primary?, alt_text?, variant_id? }`
  (đặt `is_primary:true` tự hạ ảnh chính cũ) · `DELETE /product-images/:id`.
  Chi tiết sản phẩm trả `images[]` kèm `object_key` để dựng URL xem trước.

## 4. Media / object storage — `/api/media`

File lưu ở MinIO (S3-compatible), phục vụ công khai `https://API_DOMAIN/files/unimate/<object_key>`.

| Method & path | Quyền | Ghi chú |
|---|---|---|
| `POST /upload` | 🔒 + `products.write` | multipart field `"file"` → 201 `{ id, object_key, mime_type, size_bytes, url }`. Nhận: ảnh jpg/png/webp/gif (≤ `S3_MAX_IMAGE_MB` = 10MB) · video mp4/webm/ogg (≤ `S3_MAX_VIDEO_MB` = 100MB) · tệp pdf/zip/doc/xls/txt/csv (≤ `S3_MAX_FILE_MB` = 20MB). Sai định dạng/quá cỡ → 400 |
| `GET /:id/url` | public | `{ id, url, mime_type }` |
| `DELETE /:id` | 🔒 + `products.write` | 409 nếu đang gắn sản phẩm/brand/category/banner/review |

## 5. Kho — `/api/inventory`

| Method & path | Quyền | Ghi chú |
|---|---|---|
| `GET/POST /warehouses`, `PUT /warehouses/:id` | `inventory.read` / `.write` | `{ code, name, address?, ... }` |
| `GET /stocks?warehouse_id=&variant_id=&low=1` | `inventory.read` | `low=1` = sắp hết (`available ≤ reorder_level`) |
| `GET /stocks/available` | public | view `v_available_stock` |
| `PUT /stocks` | `inventory.write` | `{ warehouse_id, variant_id, quantity, reorder_level? }` (upsert + ghi movement) |
| `GET /stock-movements?variant_id=&warehouse_id=` | `inventory.read` | |
| `GET/POST /adjustments` | … | `{ warehouse_id, reason, items:[{ variant_id, new_quantity }] }` (tạo драфт) |
| `POST /adjustments/:id/post` | `inventory.write` | Chốt: cập nhật tồn + movement |
| `GET/POST /transfers`, `PATCH /transfers/:id/status` | … | 2 kho phải khác nhau |

## 6. Giỏ & wishlist — `/api/cart`

Khách vãng lai tự sinh `session_id` (localStorage); đã login thì gắn theo user.

| Method & path | Auth | Ghi chú |
|---|---|---|
| `GET /?session_id=` | tùy chọn | `{ ..., items:[{ id, variant_id, quantity, sku, price, product_name }], subtotal }` (tự tạo giỏ nếu chưa có) |
| `POST /items` | tùy chọn | `{ variant_id, quantity?, session_id? }` → trả nguyên giỏ |
| `PUT /items/:itemId` | tùy chọn | `{ quantity ≥ 1 }` |
| `DELETE /items/:itemId` · `DELETE /?session_id=` | — / tùy chọn | Xóa dòng · xóa trắng |
| `GET /wishlist` · `POST /wishlist/items { product_id }` · `DELETE /wishlist/items/:productId` | 🔒 | |

## 7. Đơn hàng — `/api/orders`

- `POST /checkout` (login tùy chọn): body
  `{ items:[{ variant_id, quantity }], shipping_address{ recipient_name, phone, province_name, district_name?, ward_name?, address_line, email? }, billing_address? (= shipping), coupon_code?, payment_method_code? (=cod), shipping_method_code?, customer_note? }`.
  Server **tính lại toàn bộ tiền**, lock kho `FOR UPDATE`, hết hàng/coupon sai → 400.
  201 → `{ id, order_number, status:pending, payment_status:unpaid, subtotal, order_discount_amount, shipping_fee, total_amount, payment_id, shipment_id }`.
  `payment_method_code`: `cod | bank_transfer | vnpay | momo | zalopay | card`.
- `GET /` 🔒 (khách: đơn mình; admin: `?status=&payment_status=&search=`).
- `GET /:id` 🔒 → `{ ..., items[] (snapshot), addresses[], history[], payments[], shipments[], notes[] }`.
- `PATCH /:id/status { status, note? }` (`orders.write`) — sai luồng bị từ chối + tự hoàn kho khi `cancelled`.
- `POST /:id/cancel { note? }` 🔒 — khách tự hủy khi `pending/confirmed`.
- `POST /:id/notes { note, is_internal? }` 🔒.

Luồng đơn: `pending → confirmed/cancelled → processing → packed → shipping → delivered → completed`;
`shipping/delivered → returned → refunded`.

## 8. Thanh toán — `/api/payments`

- `GET /methods` (public) · `POST /methods { code, name, type: cod|bank_transfer|gateway|card|wallet|other, ... }` (`payments.write`).
- `GET /?order_id=&status=` 🔒 · `GET /:id` 🔒 (kèm `transactions[]`) · `POST / { order_id, payment_method_code? }` 🔒.
- `POST /:id/transactions` (**public**, mô phỏng webhook):
  `{ transaction_type?, status?, amount?, idempotency_key?, provider_transaction_id? }` —
  trùng `idempotency_key` trả lại bản ghi cũ (`deduped:true`); `charge/capture success`
  → payment `paid` + order `paid` + ghi `cash_flows`.
- `POST /:id/mark-paid` (`payments.write`).
- Refunds: `GET /refunds/list` (`payments.read`) · `POST /refunds { order_id, payment_id?, amount, reason?, items? }` ·
  `PATCH /refunds/:id/status` (`completed` → order `refunded` + ghi cash_flow âm).

## 9. Vận chuyển — `/api/shipping`

- `GET /providers` · `GET /methods` (public, chỉ active) · `POST/PUT /methods/:id` (`shipping.write`).
- `GET /shipments?order_id=&status=` (`shipping.read`) · `GET /shipments/:id` (kèm items + tracking) ·
  `POST /shipments { order_id, shipping_method_id?, warehouse_id?, tracking_number?, ... }` ·
  `PATCH /shipments/:id/status { status, tracking_number?, description?, location? }`
  (tự ghi tracking event; `delivered` → đơn `delivered`) ·
  `POST /shipments/:id/tracking`.
- Luồng: `pending → ready → picked_up → in_transit → out_for_delivery → delivered` (+ `failed/returned/cancelled`).

## 10. KM & coupon — `/api/promos`

- Promotions: `GET` (public) · `POST { name, type: percentage|fixed|buy_x_get_y|free_shipping|bundle, value?, ... }` ·
  `PUT /promotions/:id` · `POST /promotions/:id/products { product_ids[] }` (`promotions.write`).
- Coupons: `GET` (`promotions.read`) · `POST { code, type: fixed|percentage|free_shipping, value, minimum_order_amount?, maximum_discount_amount?, usage_limit?, usage_limit_per_user?, starts_at?, expires_at?, status? }` ·
  `PUT /coupons/:id` · `POST /coupons/validate { code, order_amount? }` (**public** → `{ valid, discount_amount?, coupon? }` hoặc `{ valid:false, error }`).
- `GET /redemptions` (`promotions.read`).

## 11. Đổi trả & đánh giá — `/api/...`

- Returns 🔒: `POST /returns { order_id, reason_code, reason_detail?, customer_note?, items:[{ order_item_id, requested_quantity }] }` →
  201 `{ status:requested }` · `GET /returns` · `GET /returns/:id` (kèm items + history) ·
  `PATCH /returns/:id/status { status, note? }` (`returns.write`).
- Reviews: `GET /products/:productId/reviews` (public, đã duyệt) ·
  `POST /reviews` 🔒 `{ product_id, variant_id?, order_id?, rating 1-5, title?, content? }`
  (kèm order đã giao → `is_verified_purchase`, chờ duyệt) ·
  `PATCH /reviews/:id/status` (`reviews.write`) · `POST /reviews/:id/vote { helpful|not_helpful }` 🔒.

## 12. Hóa đơn, dòng tiền, marketing, hệ thống — `/api/...`

- Invoices: `GET` 🔒 · `POST { order_id, buyer_* }` (`payments.write`, tự sinh dòng từ order) ·
  `PATCH /invoices/:id/status { issued|cancelled }`.
- Cash-flows: `GET /cash-flows?from=&to=` (`reports.read`) · `POST { type, amount, ... }` (`payments.write`).
- Campaigns: `GET` (public) · `POST { name, product_ids[]? }` (`promotions.write`).
- Banners: `GET` (public, active) · `GET /banners/all` · `POST { title, image_media_id?, link_url?, status?, ... }` · `PUT /banners/:id`.
- Settings: `GET /settings/public` (public) · `GET /settings` · `PUT /settings/:key { value }` (`settings.write`).
- Notifications 🔒: `GET` (của mình + chung) · `POST { user_id?, type, title, body }` (`users.write`) · `PATCH /notifications/:id/read`.
- Logs: `GET /audit-logs`, `GET /admin-logs` (`audit.read`).
- `GET /reports/summary` (`reports.read`) → `{ all_time:{ total_orders, revenue }, today, top_products[], low_stock[], by_payment[] }`.
- `GET /health` (public) → `{ ok, db, time }`.

## 13. Email marketing — `/api/email` (SMTP chuẩn)

- `GET /config` (`promotions.read`) → `{ configured, host, port, from }` (không lộ pass).
- `POST /test { to }` (`promotions.write`) — gửi thử 1 mail.
- `POST /send { to: [tối đa 200 email], subject, html }` (`promotions.write`) →
  `{ sent, failed: [{ to, error }] }` (gửi từng mail, lọc `<script>`, ghi audit).
  Chưa cấu hình SMTP → từng mail `failed` với lý do rõ ràng.
  Biến môi trường: `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`.
