// routes/auth.js
// Handles login, register, and logout

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db/connection');

// ══════════════════════════════════════════
// POST /api/auth/register
// Register a new Org Admin account
// ══════════════════════════════════════════
router.post('/register', async (req, res) => {
  const { full_name, email, phone, password, org_name, org_type, plan, members_limit } = req.body;

  // 1. Check all fields are provided
  if (!full_name || !email || !phone || !password || !org_name || !org_type || !plan) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    // 2. Check if email already exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // 3. Hash the password (never store plain text!)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create user in database
    const [userResult] = await db.query(
      'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [full_name, email, phone, hashedPassword, 'orgadmin']
    );
    const userId = userResult.insertId;

    // 5. Create their organization
    await db.query(
      'INSERT INTO organizations (name, org_type, plan, members_limit, created_by) VALUES (?, ?, ?, ?, ?)',
      [org_name, org_type, plan, members_limit || 5, userId]
    );

    res.status(201).json({ success: true, message: 'Account created! Please log in.' });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error. Try again.' });
  }
});

// ══════════════════════════════════════════
// POST /api/auth/login
// Login with email and password
// ══════════════════════════════════════════
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    // 1. Find user by email
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];

    // 2. Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is suspended or inactive' });
    }

    // 3. Compare password with stored hash
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // 4. Save user data in session
    req.session.user = {
      id:        user.id,
      full_name: user.full_name,
      email:     user.email,
      role:      user.role
    };

    // 5. Send back role so frontend can redirect to correct dashboard
    res.json({
      success:  true,
      message:  'Login successful',
      role:     user.role,
      redirect: getRoleRedirect(user.role)
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error. Try again.' });
  }
});

// ══════════════════════════════════════════
// POST /api/auth/logout
// Log the user out
// ══════════════════════════════════════════
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ══════════════════════════════════════════
// GET /api/auth/me
// Get the currently logged in user's info
// ══════════════════════════════════════════
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }
  res.json({ success: true, user: req.session.user });
});

// Helper function: redirect to correct dashboard based on role
function getRoleRedirect(role) {
  switch (role) {
    case 'superadmin': return '/superadmin-dashboard.html';
    case 'orgadmin':   return '/orgadmin-dashboard.html';
    case 'member':     return '/member-dashboard.html';
    default:           return '/login.html';
  }
}

// ══════════════════════════════════════════
// POST /api/auth/change-password
// Change password for the logged-in user
// ══════════════════════════════════════════
router.post('/change-password', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.session.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  try {
    const [users] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const match = await bcrypt.compare(currentPassword, users[0].password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;