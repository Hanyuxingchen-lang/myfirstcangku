const mysql = require('mysql2/promise');

// 本地/虚拟机统一数据库配置（使用你本地MySQL8.0）
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '123456',
  database: 'chunk_upload',
  port: 3306,
  connectionLimit: 10
});

module.exports = pool;