/**
 * Chuyển địa chỉ đã lưu từ mô hình 63 tỉnh + Quận/Huyện sang mô hình 34 tỉnh
 * (sáp nhất hành chính 2025): đổi tên tỉnh, xoá cấp quận/huyện.
 *
 * Chạy:  node db/migrate-2-level-address.js
 */
const { pool } = require('../src/config/db');

const MAP = {
  'hà nội': 'Thành phố Hà Nội', 'thành phố hà nội': 'Thành phố Hà Nội', 'tp. hà nội': 'Thành phố Hà Nội', 'tp hà nội': 'Thành phố Hà Nội', 'hn': 'Thành phố Hà Nội',
  'hà giang': 'Thành phố Hà Nội', 'thành phố hà giang': 'Thành phố Hà Nội',
  'cao bằng': 'Tỉnh Cao Bằng', 'thành phố cao bằng': 'Tỉnh Cao Bằng',
  'bắc cạn': 'Tỉnh Cao Bằng', 'thành phố bắc cạn': 'Tỉnh Cao Bằng',
  'tuyên quang': 'Tỉnh Tuyên Quang', 'thành phố tuyên quang': 'Tỉnh Tuyên Quang',
  'lào cai': 'Tỉnh Lào Cai', 'thành phố lào cai': 'Tỉnh Lào Cai',
  'điện biên': 'Tỉnh Điện Biên', 'thị xã mường lay': 'Tỉnh Điện Biên',
  'lai châu': 'Tỉnh Lai Châu',
  'sơn la': 'Tỉnh Sơn La',
  'yên bái': 'Tỉnh Sơn La', 'thị xã yên bái': 'Tỉnh Sơn La',
  'hòa bình': 'Tỉnh Sơn La',
  'thái nguyên': 'Tỉnh Thái Nguyên', 'thành phố thái nguyên': 'Tỉnh Thái Nguyên',
  'lạng sơn': 'Tỉnh Lạng Sơn',
  'quảng ninh': 'Thành phố Quảng Ninh', 'thành phố quảng ninh': 'Thành phố Quảng Ninh', 'tp. quảng ninh': 'Thành phố Quảng Ninh',
  'bắc ninh': 'Thành phố Bắc Ninh', 'thành phố bắc ninh': 'Thành phố Bắc Ninh',
  'bắc giang': 'Thành phố Bắc Ninh', 'thành phố bắc giang': 'Thành phố Bắc Ninh', 'tp. bắc ninh': 'Thành phố Bắc Ninh', 'tp bắc giang': 'Thành phố Bắc Ninh', 'tp bắc ninh': 'Thành phố Bắc Ninh',
  'phú thọ': 'Tỉnh Phú Thọ', 'thành phố việt trì': 'Tỉnh Phú Thọ',
  'vĩnh phúc': 'Tỉnh Phú Thọ', 'thành phố vĩnh yên': 'Tỉnh Phú Thọ', 'tp. vĩnh phúc': 'Tỉnh Phú Thọ',
  'hải phòng': 'Thành phố Hải Phòng', 'thành phố hải phòng': 'Thành phố Hải Phòng', 'tp. hải phòng': 'Thành phố Hải Phòng', 'tp hải phòng': 'Thành phố Hải Phòng',
  'hưng yên': 'Tỉnh Hưng Yên', 'thành phố hưng yên': 'Tỉnh Hưng Yên',
  'thái bình': 'Tỉnh Hưng Yên',
  'ninh bình': 'Tỉnh Ninh Bình',
  'nam định': 'Tỉnh Ninh Bình', 'thành phố nam định': 'Tỉnh Ninh Bình', 'tp. nam định': 'Tỉnh Ninh Bình',
  'hà nam': 'Tỉnh Ninh Bình',
  'thanh hóa': 'Tỉnh Thanh Hoá', 'thành phố thanh hóa': 'Tỉnh Thanh Hoá', 'tp. thanh hóa': 'Tỉnh Thanh Hoá',
  'nghệ an': 'Tỉnh Nghệ An',
  'vinh': 'Tỉnh Nghệ An', 'thành phố vinh': 'Tỉnh Nghệ An', 'tp. vinh': 'Tỉnh Nghệ An',
  'hà tĩnh': 'Tỉnh Hà Tĩnh',
  'quảng bình': 'Tỉnh Quảng Trị', 'thành phố đồng hới': 'Tỉnh Quảng Trị', 'tp. đồng hới': 'Tỉnh Quảng Trị',
  'quảng trị': 'Tỉnh Quảng Trị',
  'huế': 'Thành phố Huế', 'thành phố huế': 'Thành phố Huế', 'tp. huế': 'Thành phố Huế',
  'đà nẵng': 'Thành phố Đà Nẵng', 'thành phố đà nẵng': 'Thành phố Đà Nẵng', 'tp. đà nẵng': 'Thành phố Đà Nẵng',
  'quảng nam': 'Tỉnh Quảng Ngãi',
  'quảng ngãi': 'Tỉnh Quảng Ngãi',
  'gia lai': 'Tỉnh Gia Lai',
  'bình định': 'Tỉnh Gia Lai', 'thành phố quy nhơn': 'Tỉnh Gia Lai', 'tp. quy nhơn': 'Tỉnh Gia Lai',
  'phú yên': 'Tỉnh Gia Lai',
  'khánh hoà': 'Tỉnh Khánh Hoà', 'thành phố nha trang': 'Tỉnh Khánh Hoà', 'tp. nha trang': 'Tỉnh Khánh Hoà',
  'đắk lắk': 'Tỉnh Đắk Lắk', 'thành phố buôn ma thuột': 'Tỉnh Đắk Lắk', 'tp. buôn ma thuột': 'Tỉnh Đắk Lắk',
  'lâm đồng': 'Tỉnh Lâm Đồng', 'thành phố đà lạt': 'Tỉnh Lâm Đồng', 'tp. đà lạt': 'Tỉnh Lâm Đồng',
  'đắk nông': 'Tỉnh Lâm Đồng',
  'đồng nai': 'Thành phố Đồng Nai', 'thành phố biên hoà': 'Thành phố Đồng Nai', 'tp. biên hoà': 'Thành phố Đồng Nai', 'tp biên hòa': 'Thành phố Đồng Nai',
  'bình dương': 'Thành phố Hồ Chí Minh',
  'bình phước': 'Thành phố Hồ Chí Minh',
  'long an': 'Thành phố Hồ Chí Minh',
  'hồ chí minh': 'Thành phố Hồ Chí Minh', 'thành phố hồ chí minh': 'Thành phố Hồ Chí Minh', 'tp. hồ chí minh': 'Thành phố Hồ Chí Minh', 'tp hồ chí minh': 'Thành phố Hồ Chí Minh',
  'tây ninh': 'Tỉnh Tây Ninh', 'tp. tây ninh': 'Tỉnh Tây Ninh',
  'đồng tháp': 'Tỉnh Đồng Tháp',
  'vĩnh long': 'Tỉnh Vĩnh Long', 'tp. vĩnh long': 'Tỉnh Vĩnh Long',
  'an giang': 'Tỉnh An Giang', 'thành phố long xuyên': 'Tỉnh An Giang', 'tp. long xuyên': 'Tỉnh An Giang', 'thành phị châu đốc': 'Tỉnh An Giang', 'tp. châu đốc': 'Tỉnh An Giang',
  'cần thơ': 'Thành phố Cần Thơ', 'thành phố cần thơ': 'Thành phố Cần Thơ', 'tp. cần thơ': 'Thành phố Cần Thơ',
  'tiền giang': 'Thành phố Cần Thơ', 'thành phố mỹ tho': 'Thành phố Cần Thơ', 'tp. mỹ tho': 'Thành phố Cần Thơ',
  'kiên giang': 'Tỉnh Cà Mau', 'thành phố rạch giá': 'Tỉnh Cà Mau', 'tp. rạch giá': 'Tỉnh Cà Mau',
  'bạc liêu': 'Tỉnh Cà Mau', 'tp. bạc liêu': 'Tỉnh Cà Mau',
  'cà mau': 'Tỉnh Cà Mau',
};

// Mã tỉnh lấy đúng từ file dữ liệu client/public/data/vn-provinces.json
// (nguồn thanglequoc/vietnamese-provinces-database). Không tự đoán mã.
const CODE = {
  'Thành phố Hà Nội': '01', 'Tỉnh Cao Bằng': '04', 'Tỉnh Tuyên Quang': '08', 'Tỉnh Điện Biên': '11',
  'Tỉnh Lai Châu': '12', 'Tỉnh Sơn La': '14', 'Tỉnh Lào Cai': '15', 'Tỉnh Thái Nguyên': '19',
  'Tỉnh Lạng Sơn': '20', 'Thành phố Quảng Ninh': '22', 'Thành phố Bắc Ninh': '24', 'Tỉnh Phú Thọ': '25',
  'Thành phố Hải Phòng': '31', 'Tỉnh Hưng Yên': '33', 'Tỉnh Ninh Bình': '37', 'Tỉnh Thanh Hoá': '38',
  'Tỉnh Nghệ An': '40', 'Tỉnh Hà Tĩnh': '42', 'Tỉnh Quảng Trị': '44', 'Thành phố Huế': '46',
  'Thành phố Đà Nẵng': '48', 'Tỉnh Quảng Ngãi': '51', 'Tỉnh Gia Lai': '52', 'Tỉnh Khánh Hoà': '56',
  'Tỉnh Đắk Lắk': '66', 'Tỉnh Lâm Đồng': '68', 'Thành phố Đồng Nai': '75', 'Thành phố Hồ Chí Minh': '79',
  'Tỉnh Tây Ninh': '80', 'Tỉnh Đồng Tháp': '82', 'Tỉnh Vĩnh Long': '86', 'Tỉnh An Giang': '91',
  'Thành phố Cần Thơ': '92', 'Tỉnh Cà Mau': '96',
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function convert(name) {
  const k = norm(name);
  if (!k) return null;
  if (MAP[k]) return MAP[k];
  const stripped = k.replace(/^(tỉnh|thành phố|thị xã|tp\.?|tp)\s*/i, '').trim();
  if (MAP[stripped]) return MAP[stripped];
  for (const [alias, target] of Object.entries(MAP)) {
    if (norm(alias) === stripped) return target;
  }
  return null;
}

const TABLES = [
  { table: 'user_addresses', label: 'Sổ địa chỉ khách hàng' },
  { table: 'order_addresses', label: 'Địa chỉ trên đơn hàng' },
];

(async () => {
  let total = 0;
  for (const { table, label } of TABLES) {
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE province_name IS NOT NULL`);
    const stat = {};
    let changed = 0;
    for (const r of rows) {
      const next = convert(r.province_name);
      if (!next) {
        stat[r.province_name] = (stat[r.province_name] || 0) + 1;
        continue;
      }
      if (next === r.province_name && !r.district_name && (r.province_code || null) === (CODE[next] || null)) continue;
      await pool.query(
        `UPDATE ${table} SET province_name=?, province_code=?, district_name=NULL, district_code=NULL WHERE id=?`,
        [next, CODE[next] || null, r.id]);
      changed += 1;
    }
    total += changed;
    console.log(`\n== ${label} (${table}) ==`);
    console.log(`   ${rows.length} dong, da doi ${changed}`);
    if (Object.keys(stat).length) {
      console.log('   KHONG doan duoc (gia nguyen):');
      for (const [n, c] of Object.entries(stat)) console.log(`     - "${n}" x${c}`);
    }
  }
  console.log(`\n== TONG: da chuyen ${total} dong ==`);
  await pool.end();
})().catch(async (e) => { console.error('LOI:', e.message); try { await pool.end(); } catch { } process.exit(1); });
