// db/connection.js
// ══════════════════════════════════════════════════
// MySQL connection pool — works for both local dev
// and Railway production (via DATABASE_URL / MYSQL_URL)
// ══════════════════════════════════════════════════

const mysql = require('mysql2/promise');

let pool;

// Railway injects one of these environment variables automatically.
// Prefer MYSQL_URL, fall back to DATABASE_URL, then individual vars.
const connectionString =
  process.env.MYSQL_URL ||
  process.env.DATABASE_URL ||
  process.env.MYSQL_PUBLIC_URL ||
  null;

if (connectionString) {
  // ── Production (Railway): use the connection string ──
  pool = mysql.createPool({
    uri: connectionString,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    ssl: {
      // Railway requires SSL; reject self-signed certs
      rejectUnauthorized: false
    }
  });
  console.log('🔗 Using DATABASE_URL for MySQL connection (Railway)');
} else {
  // ── Local Development: use individual env vars ──
  pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT || '3306'),
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'orgmember_db',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0
  });
  console.log('🔗 Using individual DB env vars for MySQL connection (local)');
}

// Test the connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL Database connected successfully!');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    // Don't crash the process — let the app start and show DB errors per-request
  }
})();

module.exports = pool;