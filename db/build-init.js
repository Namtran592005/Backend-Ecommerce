// Sinh docker/mysql-init/01-schema.sql từ db/schema.sql (nguồn chân lý duy nhất).
// Kèm fix: object_key VARCHAR(1000) + UNIQUE vượt giới hạn key 3072 bytes của InnoDB.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
if (!src.includes('object_key VARCHAR(1000)')) console.log('lưu ý: schema không còn dòng cần fix, copy nguyên');
const fixed = src.replace('object_key VARCHAR(1000)', 'object_key VARCHAR(500)');
const out = path.join(__dirname, '..', 'docker', 'mysql-init', '01-schema.sql');
fs.writeFileSync(out, fixed);
console.log('done:', out, fixed.length, 'chars');
