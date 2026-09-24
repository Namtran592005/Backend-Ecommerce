# Hướng dẫn Frontend — UniMate

Tài liệu tích hợp cho team frontend (web/app). Chi tiết từng endpoint xem [API.md](API.md).
Base URL dev `http://localhost:3000`, prod `https://API_DOMAIN` — mọi path bắt đầu `/api`.

## 1. Xác thực + axios mẫu (đọc trước)

Cơ chế: **access token 15 phút** (RAM) + **refresh cookie httpOnly 30 ngày** (tự xoay vòng).

| Việc | Gọi |
|---|---|
| Đăng ký / đăng nhập | `POST /auth/register`, `POST /auth/login` → `{ accessToken, user }` + cookie |
| API cần login | Header `Authorization: Bearer <accessToken>` |
| Access hết hạn (401) | `POST /auth/refresh` (kèm cookie) → access mới |
| Đăng xuất | `POST /auth/logout` |

**Bắt buộc:** `credentials: 'include'` mọi request · token trong RAM (không localStorage) ·
prod chạy `https://` (cookie `Secure + SameSite=None`, domain đã khai báo `ALLOWED_ORIGINS`).

```js
import axios from 'axios';
const BASE = 'https://API_DOMAIN'; // dev: http://localhost:3000
let accessToken = null;
export const setAccessToken = t => accessToken = t;
export const api = axios.create({ baseURL: BASE + '/api', withCredentials: true });
api.interceptors.request.use(cfg => {
  if (accessToken) cfg.headers.Authorization = 'Bearer ' + accessToken;
  return cfg;
});
let refreshing = null;
api.interceptors.response.use(r => r, async err => {
  const req = err.config;
  if (err.response?.status === 401 && !req._retried) {
    req._retried = true;
    refreshing ||= axios.post(BASE + '/api/auth/refresh', {}, { withCredentials: true })
      .then(r => setAccessToken(r.data.accessToken)).finally(() => refreshing = null);
    await refreshing; // lỗi tiếp = refresh hết hạn → chuyển /login
    return api(req);
  }
  throw err;
});
// Sau login/register: setAccessToken(data.accessToken)
// Sau F5: login lại hoặc GET /auth/me (nếu còn access) để khôi phục user + roles/permissions
```

## 2. Màn hình shop (public)

1. Menu: `GET /categories/tree` (`children[]`). Lọc: `GET /products?search=&category_id=&brand_id=&page=`.
2. Chi tiết: `GET /products/slug/:slug` → chọn variant theo `available_qty`,
   đọc `review_summary`, `GET /products/:productId/reviews`.
3. Giỏ: khách vãng lai tự sinh `session_id` (`crypto.randomUUID()`, lưu localStorage);
   `POST /cart/items { variant_id, quantity, session_id? }` → `GET /cart?session_id=`
   (`items[]` + `subtotal`). Đổi/xóa: `PUT /cart/items/:itemId`, `DELETE ...`.
4. Coupon: `POST /promos/coupons/validate { code, order_amount }` → hiện `error` nếu `valid:false`.
5. Checkout `POST /orders/checkout` (mục 3) → trang thành công hiện `order_number`.
6. Hiển thị thêm: `GET /banners`, `GET /promos/promotions`, `GET /campaigns`, `GET /settings/public`.

## 3. Checkout (trường bắt buộc)

```json
{
  "items": [{ "variant_id": 12, "quantity": 2 }],
  "shipping_address": {
    "recipient_name": "Nguyễn Văn A", "phone": "0901234567",
    "province_name": "TP Hồ Chí Minh", "address_line": "123 Lê Lợi",
    "district_name": "Quận 1", "ward_name": "P. Bến Nghé", "email": "khach@gmail.com"
  },
  "coupon_code": "SALE10", "payment_method_code": "cod",
  "shipping_method_code": "giao-nhanh", "customer_note": "..."
}
```
`payment_method_code`: `cod | bank_transfer | vnpay | momo | zalopay | card`
(bỏ `billing_address` = dùng shipping). **Không gửi giá** — server tự tính;
hết hàng/coupon sai → 400 + `error` tiếng Việt → hiển thị. Prefill địa chỉ từ
`GET /auth/me → addresses` (dòng `is_default`).

## 4. Tài khoản + đơn của tôi (🔒)

- Đơn: `GET /orders` → `GET /orders/:id` (items snapshot, addresses, history,
  payments, shipments, notes). Tự hủy khi pending/confirmed: `POST /orders/:id/cancel`.
- Review: `POST /reviews { product_id, rating 1-5, ... }` (kèm `order_id` đã giao
  → verified), vote `POST /reviews/:id/vote`.
- Đổi trả: `POST /returns { order_id, reason_code, items:[{ order_item_id, requested_quantity }] }`.
- Sổ địa chỉ: `POST /users/:id/addresses`, `PUT/DELETE /users/addresses/:addrId`.

## 5. Upload ảnh/video/tệp (cần `products.write`)

```js
const fd = new FormData();
fd.append('file', fileInput.files[0]); // ảnh ≤ 10MB, video ≤ 100MB, tệp ≤ 20MB
const { id: media_id, url } = await api.post('/media/upload', fd).then(r => r.data);
await api.post(`/products/${productId}/images`, { media_id, is_primary: true });
// <img src={url} /> — file công khai https://API_DOMAIN/files/unimate/<object_key>
```
`GET /media/:id/url` lấy lại URL · `DELETE /media/:id` (409 nếu đang dùng).

## 6. Trang admin (theo `permissions` từ `GET /auth/me`)

- Dashboard `GET /reports/summary` (doanh thu, top SP, tồn thấp) — `reports.read`.
- Đơn: lọc `status/payment_status/search` → chi tiết (history/payments/shipments/notes)
  → `PATCH /orders/:id/status`, tạo shipment, `mark-paid`, hoàn tiền, ghi chú nội bộ.
- Sản phẩm/kho/KM/ship/users/hóa đơn/banner/settings/logs: xem [API.md](API.md) (§7–§12).
  Luồng đơn: `pending → confirmed → processing → packed → shipping → delivered → completed`
  (`cancelled/returned/refunded` ở nhánh rẽ — server từ chối chuyển sai).

## 7. Gọi từ xa + tài khoản test

- Luôn `https://` + `credentials:'include'`; 401 → refresh 1 lần → vẫn 401 → về login.
- Rate-limit (auth 20/10p, chung 300/1p): hiện lỗi server trả, không tự retry.
- Test nhanh: `GET /api/health` → `{ ok:true, db:'up' }`.
- Admin `admin@example.com` / `Admin123!` (thấy hết menu) · khách tự register.
