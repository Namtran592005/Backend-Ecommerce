const fs = require('fs');
const mysql = require('mysql2/promise');
(async () => {
  let sql = fs.readFileSync('./db/schema.sql', 'utf8');
  sql = sql.replace('object_key VARCHAR(1000)', 'object_key VARCHAR(500)');
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'admin', multipleStatements: true });
  try {
    await c.query('DROP DATABASE IF EXISTS unimate');
    console.log('dropped');
    await c.query(sql);
    console.log('IMPORT OK');
    const [rows] = await c.query('SHOW TABLES FROM unimate');
    console.log('tables:', rows.length);
  } catch (e) {
    console.error('IMPORT FAIL:' + e.message);
  }
  await c.end();
})();
