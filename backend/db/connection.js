// db/connection.js
// ══════════════════════════════════════════════════
// MySQL connection pool — works for both local dev
// and Railway production (via MYSQL_URL / DATABASE_URL)
// Auto-creates all tables on first run (no manual SQL needed)
// ══════════════════════════════════════════════════

const mysql = require('mysql2/promise');

let pool;

// Railway injects one of these env vars automatically.
// Prefer MYSQL_URL, fall back to DATABASE_URL, then individual vars.
const connectionString =
  process.env.MYSQL_URL ||
  process.env.DATABASE_URL ||
  process.env.MYSQL_PUBLIC_URL ||
  null;

if (connectionString) {
  pool = mysql.createPool({
    uri: connectionString,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    ssl: { rejectUnauthorized: false }
  });
  console.log('🔗 Using DATABASE_URL for MySQL connection (Railway)');
} else {
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

// ── Auto-initialize schema on startup ──
// Creates all tables if they don't exist yet (safe to run repeatedly)
async function initSchema() {
  const conn = await pool.getConnection();
  try {
    // Disable FK checks so we can create tables in any order
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        full_name    VARCHAR(100) NOT NULL,
        email        VARCHAR(100) NOT NULL UNIQUE,
        password     VARCHAR(255) NOT NULL,
        phone        VARCHAR(20),
        role         ENUM('superadmin', 'orgadmin', 'member') NOT NULL DEFAULT 'member',
        status       ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
        avatar       VARCHAR(255),
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        name           VARCHAR(150) NOT NULL,
        email          VARCHAR(100),
        phone          VARCHAR(20),
        org_type       ENUM('Corporate', 'Non-Profit', 'Government', 'Startup', 'Educational') NOT NULL,
        plan           ENUM('Basic', 'Pro', 'Enterprise') NOT NULL DEFAULT 'Basic',
        members_limit  INT DEFAULT 5,
        status         ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_by     INT,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS org_members (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        org_id          INT NOT NULL,
        user_id         INT NOT NULL,
        role_in_org     ENUM('member', 'treasurer', 'secretary', 'board_member') DEFAULT 'member',
        join_date       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        status          ENUM('active', 'inactive') DEFAULT 'active',
        FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_org_member (org_id, user_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS events (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        org_id        INT NOT NULL,
        title         VARCHAR(200) NOT NULL,
        description   TEXT,
        event_type    ENUM('Meeting', 'Volunteer', 'Fundraiser', 'Training', 'Other') DEFAULT 'Meeting',
        location      VARCHAR(200),
        start_time    DATETIME NOT NULL,
        end_time      DATETIME,
        max_attendees INT DEFAULT 50,
        rsvp_deadline DATETIME,
        status        ENUM('draft', 'published', 'cancelled', 'completed') DEFAULT 'draft',
        created_by    INT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (org_id)     REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS event_attendance (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        event_id    INT NOT NULL,
        user_id     INT NOT NULL,
        rsvp_status ENUM('yes', 'maybe', 'no') DEFAULT 'yes',
        attended    BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_rsvp (event_id, user_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        org_id       INT NOT NULL,
        user_id      INT NOT NULL,
        amount       DECIMAL(10,2) NOT NULL,
        currency     VARCHAR(10) DEFAULT 'USD',
        payment_type ENUM('membership', 'event', 'donation', 'other') DEFAULT 'membership',
        description  VARCHAR(255),
        status       ENUM('paid', 'pending', 'overdue', 'refunded') DEFAULT 'pending',
        due_date     DATE,
        paid_at      TIMESTAMP NULL DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        org_id      INT NOT NULL,
        author_id   INT NOT NULL,
        title       VARCHAR(255) NOT NULL,
        content     TEXT NOT NULL,
        category    ENUM('Urgent', 'Update', 'General') DEFAULT 'General',
        status      ENUM('draft', 'published') DEFAULT 'draft',
        image_path  VARCHAR(255),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (org_id)    REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS member_profiles (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        user_id           INT NOT NULL UNIQUE,
        first_name        VARCHAR(50),
        last_name         VARCHAR(50),
        address           VARCHAR(255),
        city              VARCHAR(100),
        state             VARCHAR(100),
        zip_code          VARCHAR(20),
        date_of_birth     DATE,
        emergency_name    VARCHAR(100),
        emergency_phone   VARCHAR(20),
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Seed default Super Admin (only if not already seeded)
    const correctHash = '$2a$10$KExMfgT/y/STdloiWlp0Su68ZBEpO8KmctlueRqBGWMzmtR/nqxcK';
    const [existing] = await conn.query(
      "SELECT id FROM users WHERE email = 'superadmin@orgmember.com'"
    );
    if (existing.length === 0) {
      await conn.query(`
        INSERT INTO users (full_name, email, password, role, status)
        VALUES (
          'Super Admin',
          'superadmin@orgmember.com',
          ?,
          'superadmin',
          'active'
        )
      `, [correctHash]);
      console.log('🌱 Super Admin seeded: superadmin@orgmember.com / SuperAdmin@2024');
    } else {
      await conn.query(`UPDATE users SET password = ? WHERE email = 'superadmin@orgmember.com'`, [correctHash]);
      console.log('🌱 Super Admin password ensured correct');
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Database schema initialized successfully!');
  } catch (err) {
    console.error('❌ Schema initialization failed:', err.message);
  } finally {
    conn.release();
  }
}

// Connect and initialize
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL Database connected successfully!');
    conn.release();
    await initSchema();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
})();

module.exports = pool;