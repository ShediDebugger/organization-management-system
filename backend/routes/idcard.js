// routes/idcard.js
// Handles Digital ID Card data retrieval

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
};

// ══════════════════════════════════════════
// GET /api/idcard
// Get the logged-in member's ID card data
// ══════════════════════════════════════════
router.get('/', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;

  try {
    // Get user info
    const [users] = await db.query(
      'SELECT id, full_name, email, phone, role, avatar, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = users[0];

    // Get membership info (for members)
    let membership = null;
    let organization = null;

    if (role === 'member') {
      const [members] = await db.query(
        `SELECT om.role_in_org, om.join_date, om.status, o.name as org_name, o.org_type, o.id as org_id
         FROM org_members om
         JOIN organizations o ON om.org_id = o.id
         WHERE om.user_id = ? LIMIT 1`,
        [userId]
      );
      if (members.length > 0) {
        membership = members[0];
        organization = { name: members[0].org_name, org_type: members[0].org_type, id: members[0].org_id };
      }
    } else if (role === 'orgadmin') {
      const [orgs] = await db.query(
        'SELECT id, name, org_type FROM organizations WHERE created_by = ? LIMIT 1',
        [userId]
      );
      if (orgs.length > 0) {
        organization = orgs[0];
        membership = { role_in_org: 'Admin', join_date: user.created_at, status: 'active' };
      }
    }

    // Generate a unique member ID code
    const memberCode = `OM-${String(organization?.id || 0).padStart(3, '0')}-${String(userId).padStart(5, '0')}`;

    res.json({
      success: true,
      idCard: {
        user,
        membership,
        organization,
        memberCode,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('ID Card fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
