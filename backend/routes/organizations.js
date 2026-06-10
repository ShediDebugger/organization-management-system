// routes/organizations.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { isLoggedIn, isSuperAdmin, isOrgAdmin } = require('../middleware/auth');

// GET /api/organizations/mine
// Get the organization belonging to the logged-in org admin
router.get('/mine', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [orgs] = await db.query(
      'SELECT * FROM organizations WHERE created_by = ?',
      [userId]
    );

    if (orgs.length === 0) {
      return res.status(404).json({ success: false, message: 'No organization found' });
    }

    res.json({ success: true, org: orgs[0] });

  } catch (error) {
    console.error('Get org error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/organizations/mine
// Org Admin updates their own organization info
router.patch('/mine', isOrgAdmin, async (req, res) => {
  const userId = req.session.user.id;
  const { name, email, phone, org_type } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Organization name is required' });
  }

  try {
    await db.query(
      'UPDATE organizations SET name = ?, email = ?, phone = ?, org_type = ? WHERE created_by = ?',
      [name, email || null, phone || null, org_type, userId]
    );
    res.json({ success: true, message: 'Organization updated successfully!' });
  } catch (error) {
    console.error('Update org error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/organizations
// Get all organizations (Super Admin / Org Admin to view list)
router.get('/', isLoggedIn, isOrgAdmin, async (req, res) => {
  try {
    let query = `
      SELECT o.*, u.full_name as admin_name, u.email as admin_email,
             COUNT(om.id) as member_count
      FROM organizations o
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN org_members om ON o.id = om.org_id
    `;
    const params = [];

    if (req.session.user.role !== 'superadmin') {
      query += ' WHERE o.created_by = ?';
      params.push(req.session.user.id);
    }

    query += ' GROUP BY o.id ORDER BY o.created_at DESC';

    const [orgs] = await db.query(query, params);

    res.json({ success: true, organizations: orgs });

  } catch (error) {
    console.error('Get orgs error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/organizations
// Create a new organization and its admin user (Super Admin only)
router.post('/', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { name, email, phone, org_type, plan, members_limit, admin_name, admin_email, admin_password } = req.body;
  const bcrypt = require('bcryptjs');

  if (!name || !org_type || !admin_name || !admin_email || !admin_password) {
    return res.status(400).json({ success: false, message: 'Organization name, type, and Admin details are required' });
  }

  try {
    // Check if admin email exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [admin_email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Admin email already registered' });
    }

    // Hash admin password
    const hashedPassword = await bcrypt.hash(admin_password, 10);

    // Create Admin User
    const [userResult] = await db.query(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      [admin_name, admin_email, hashedPassword, 'orgadmin']
    );
    const adminId = userResult.insertId;

    // Create Organization
    await db.query(
      'INSERT INTO organizations (name, email, phone, org_type, plan, members_limit, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email || admin_email, phone || null, org_type, plan || 'Basic', members_limit || 5, adminId]
    );

    res.status(201).json({ success: true, message: 'Organization and Admin created successfully!' });

  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/organizations/:id
// Update organization details (Super Admin only)
router.put('/:id', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, org_type, plan, members_limit, status } = req.body;

  try {
    await db.query(`
      UPDATE organizations 
      SET name = ?, email = ?, phone = ?, org_type = ?, plan = ?, members_limit = ?, status = ?
      WHERE id = ?
    `, [name, email, phone, org_type, plan, members_limit, status, id]);

    res.json({ success: true, message: 'Organization updated successfully!' });

  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/organizations/:id
// Delete an organization (Super Admin only)
router.delete('/:id', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM organizations WHERE id = ?', [id]);
    res.json({ success: true, message: 'Organization deleted successfully!' });

  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;