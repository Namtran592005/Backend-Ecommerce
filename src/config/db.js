require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'unimate',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  decimalNumbers: true,
  multipleStatements: false,
  timezone: '+00:00',
});

async function dbCheck() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows;
}

module.exports = { pool, dbCheck };
