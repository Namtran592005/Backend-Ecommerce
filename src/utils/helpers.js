function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200) || ('n-' + Date.now());
}
function genCode(prefix) {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${prefix}${ts}${Math.floor(100 + Math.random() * 900)}`;
}
const orderNumber = () => genCode('ORD');
const transferNumber = () => genCode('TRF');
const adjustmentNumber = () => genCode('ADJ');
const refundNumber = () => genCode('REF');
const returnNumber = () => genCode('RET');
const invoiceNumber = () => genCode('INV');

function paged(req, def = 20, max = 100) {
  let page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  let limit = Math.min(max, Math.max(1, parseInt(req.query.limit || String(def), 10) || def));
  return { page, limit, offset: (page - 1) * limit };
}
async function paginate(pool, baseSql, countSql, params, page, limit) {
  const [[{ total }]] = await pool.query(countSql, params);
  const [rows] = await pool.query(`${baseSql} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return { data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

module.exports = { slugify, genCode, orderNumber, transferNumber, adjustmentNumber, refundNumber, returnNumber, invoiceNumber, paged, paginate };
