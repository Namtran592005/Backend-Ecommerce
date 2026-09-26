// Bỏ ảnh riêng cho mobile ở banner: mọi màn hình dùng chung một media duy nhất.
// Trước đây bảng banners có cột mobile_image_media_id + khoá fk_banners_mobile_image.
const q = (sql) => require('../src/config/db').pool.query(sql);

async function main() {
  const [[{ n }]] = await q(`SELECT COUNT(*) n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banners' AND COLUMN_NAME = 'mobile_image_media_id'`);
  if (!n) { console.log('  banners.mobile_image_media_id da khong con - bo qua'); return; }

  await q('ALTER TABLE banners DROP FOREIGN KEY fk_banners_mobile_image');
  await q('ALTER TABLE banners DROP COLUMN mobile_image_media_id');
  console.log('  da xoa banners.mobile_image_media_id');
}

main().then(() => process.exit(0))
  .catch((e) => { console.error('  LOI: ' + e.message); process.exit(1); });
