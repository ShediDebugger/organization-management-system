-- ══════════════════════════════════════════════════
-- OrgMember Database Schema
-- Run this file in MySQL Workbench to create all tables
-- ══════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS orgmember_db;
USE orgmember_db;

-- ── 1. USERS TABLE (Super Admin, Org Admin, Member) ──
CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(100) NOT NULL,
  email        VARCHAR(100) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,         -- stored as bcrypt hash
  phone        VARCHAR(20),
  role         ENUM('superadmin', 'orgadmin', 'member') NOT NULL DEFAULT 'member',
  status       ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  avatar       VARCHAR(255),                  -- profile picture file path
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── 2. ORGANIZATIONS TABLE ──
CREATE TABLE IF NOT EXISTS organizations (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  email          VARCHAR(100),
  phone          VARCHAR(20),
  org_type       ENUM('Corporate', 'Non-Profit', 'Government', 'Startup', 'Educational') NOT NULL,
  plan           ENUM('Basic', 'Pro', 'Enterprise') NOT NULL DEFAULT 'Basic',
  members_limit  INT DEFAULT 5,
  status         ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_by     INT,                         -- user id of the org admin who created it
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── 3. ORGANIZATION MEMBERS (links users to organizations) ──
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
);

-- ── 4. EVENTS TABLE ──
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
);

-- ── 5. EVENT ATTENDANCE (RSVP) ──
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
);

-- ── 6. PAYMENTS TABLE ──
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
  paid_at      TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── 7. BLOG POSTS TABLE ──
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
);

-- ── 8. MEMBER PROFILES TABLE ──
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
);

-- ══════════════════════════════════════════════════
-- SEED DATA (Default Super Admin account)
-- Password: SuperAdmin@2024
-- ══════════════════════════════════════════════════

INSERT INTO users (full_name, email, password, role, status)
VALUES (
  'Super Admin',
  'superadmin@orgmember.com',
  '$2a$10$KExMfgT/y/STdloiWlp0Su68ZBEpO8KmctlueRqBGWMzmtR/nqxcK',
  'superadmin',
  'active'
);