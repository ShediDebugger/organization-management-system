// routes/members.js
// Handles all member management operations

const express   = require('express');
const router    = express.Router();
const db        = require('../db/connection');
const { isLoggedIn, isOrgAdmin } = require('../middleware/auth');

async function verifyOrgOwnership(user, orgId) {
  if (user.role === 'superadmin') return true;
  const [rows] = await db.query('SELECT id FROM organizations WHERE id = ? AND created_by = ?', [orgId, user.id]);
  return rows.length > 0;
}

// ══════════════════════════════════════════
// GET /api/members
// Get all members for an organization
// ══════════════════════════════════════════
router.get('/', isOrgAdmin, async (req, res) => {
  const { org_id, search, page = 1, limit = 7 } = req.query;
  const offset = (page - 1) * limit;

  if (!org_id) {
    return res.status(400).json({ success: false, message: 'Organization ID is required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyOrgOwnership(req.session.user, org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    let query = `
      SELECT u.id, u.full_name, u.email, u.phone, u.status,
             om.role_in_org, om.join_date, om.last_active
      FROM users u
      JOIN org_members om ON u.id = om.user_id
      WHERE om.org_id = ?
    `;
    const params = [org_id];

    // Search filter
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [members] = await db.query(query, params);

    // Count total for pagination
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM org_members WHERE org_id = ?',
      [org_id]
    );

    res.json({
      success: true,
      members,
      total:   countResult[0].total,
      page:    Number(page),
      pages:   Math.ceil(countResult[0].total / limit)
    });

  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/members
// Add a new member to an organization
// ══════════════════════════════════════════
router.post('/', isOrgAdmin, async (req, res) => {
  const { full_name, email, phone, role_in_org, org_id } = req.body;
  const bcrypt = require('bcryptjs');

  if (!full_name || !email || !org_id) {
    return res.status(400).json({ success: false, message: 'Name, email and org ID are required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyOrgOwnership(req.session.user, org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    // Check if email exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);

    let userId;
    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      // Create a new user account with a default password
      const defaultPass = await bcrypt.hash('Welcome@123', 10);
      const [result] = await db.query(
        'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        [full_name, email, phone, defaultPass, 'member']
      );
      userId = result.insertId;
    }

    // Add to organization
    await db.query(
      'INSERT INTO org_members (org_id, user_id, role_in_org) VALUES (?, ?, ?)',
      [org_id, userId, role_in_org || 'member']
    );

    res.status(201).json({ success: true, message: 'Member added successfully' });

  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/members/:id
// Update member details
// ══════════════════════════════════════════
router.put('/:id', isOrgAdmin, async (req, res) => {
  const { id } = req.params;
  const { full_name, phone, role_in_org, status } = req.body;

  if (req.session.user.role !== 'superadmin') {
    const [memberOrg] = await db.query(`
      SELECT om.org_id FROM org_members om
      JOIN organizations o ON om.org_id = o.id
      WHERE om.user_id = ? AND o.created_by = ?
    `, [id, req.session.user.id]);

    if (memberOrg.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied to this member' });
    }
  }

  try {
    // Update user info
    await db.query(
      'UPDATE users SET full_name = ?, phone = ?, status = ? WHERE id = ?',
      [full_name, phone, status, id]
    );

    // Update role in org
    if (role_in_org) {
      await db.query(
        'UPDATE org_members SET role_in_org = ? WHERE user_id = ?',
        [role_in_org, id]
      );
    }

    res.json({ success: true, message: 'Member updated successfully' });

  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// DELETE /api/members/:id
// Remove a member from an organization
// ══════════════════════════════════════════
router.delete('/:id', isOrgAdmin, async (req, res) => {
  const { id }     = req.params;
  const { org_id } = req.body;

  if (!org_id) {
    return res.status(400).json({ success: false, message: 'Organization ID is required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyOrgOwnership(req.session.user, org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    res.json({ success: true, message: 'Member removed successfully' });

  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/members/profile
// Get the logged-in member's profile
// ══════════════════════════════════════════
router.get('/profile', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [users] = await db.query(`
      SELECT u.*, mp.*, om.org_id, o.name as org_name
      FROM users u
      LEFT JOIN member_profiles mp ON u.id = mp.user_id
      LEFT JOIN org_members om ON u.id = om.user_id
      LEFT JOIN organizations o ON om.org_id = o.id
      WHERE u.id = ?
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Remove password from response
    const user = users[0];
    delete user.password;

    res.json({ success: true, user });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/members/profile
// Update the logged-in member's profile
// ══════════════════════════════════════════
router.put('/profile', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const {
    first_name, last_name, phone,
    address, city, state, zip_code,
    date_of_birth, emergency_name, emergency_phone
  } = req.body;

  try {
    // Update phone in users table
    await db.query('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);

    // Upsert profile (insert if doesn't exist, update if does)
    await db.query(`
      INSERT INTO member_profiles
        (user_id, first_name, last_name, address, city, state, zip_code, date_of_birth, emergency_name, emergency_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name  = VALUES(last_name),
        address    = VALUES(address),
        city       = VALUES(city),
        state      = VALUES(state),
        zip_code   = VALUES(zip_code),
        date_of_birth    = VALUES(date_of_birth),
        emergency_name   = VALUES(emergency_name),
        emergency_phone  = VALUES(emergency_phone)
    `, [userId, first_name, last_name, address, city, state, zip_code, date_of_birth, emergency_name, emergency_phone]);

    res.json({ success: true, message: 'Profile updated successfully' });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;