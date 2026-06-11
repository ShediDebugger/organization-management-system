const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

// Helper function to get the org_id for the logged in user
async function getUserOrgId(userId, role) {
  if (role === 'orgadmin') {
    const [orgs] = await db.query('SELECT id FROM organizations WHERE created_by = ?', [userId]);
    return orgs.length ? orgs[0].id : null;
  } else if (role === 'member') {
    const [members] = await db.query('SELECT org_id FROM org_members WHERE user_id = ?', [userId]);
    return members.length ? members[0].org_id : null;
  }
  return null;
}

// ══════════════════════════════════════════
// GET /api/services
// Get all services for the organization
// ══════════════════════════════════════════
router.get('/', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;

  try {
    const orgId = await getUserOrgId(userId, role);
    if (!orgId) return res.status(403).json({ success: false, message: 'No organization found' });

    const [services] = await db.query(
      'SELECT * FROM services WHERE org_id = ? ORDER BY created_at DESC',
      [orgId]
    );

    res.json({ success: true, services });
  } catch (error) {
    console.error('Fetch services error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/services
// Create a new service (Org Admin only)
// ══════════════════════════════════════════
router.post('/', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  if (role !== 'orgadmin') return res.status(403).json({ success: false, message: 'Only Org Admins can create services' });

  const { title, description, service_type, fee } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

  try {
    const orgId = await getUserOrgId(userId, role);
    if (!orgId) return res.status(403).json({ success: false, message: 'Organization not found' });

    await db.query(
      'INSERT INTO services (org_id, title, description, service_type, fee, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [orgId, title, description || '', service_type || 'Other', fee || 0.00, userId]
    );

    res.json({ success: true, message: 'Service created successfully' });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/services/:id
// Update a service
// ══════════════════════════════════════════
router.put('/:id', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  if (role !== 'orgadmin') return res.status(403).json({ success: false, message: 'Only Org Admins can edit services' });

  const serviceId = req.params.id;
  const { title, description, service_type, fee, status } = req.body;

  try {
    const orgId = await getUserOrgId(userId, role);
    await db.query(
      'UPDATE services SET title = ?, description = ?, service_type = ?, fee = ?, status = ? WHERE id = ? AND org_id = ?',
      [title, description, service_type, fee, status, serviceId, orgId]
    );
    res.json({ success: true, message: 'Service updated' });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// DELETE /api/services/:id
// Delete a service
// ══════════════════════════════════════════
router.delete('/:id', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  if (role !== 'orgadmin') return res.status(403).json({ success: false, message: 'Only Org Admins can delete services' });

  const serviceId = req.params.id;

  try {
    const orgId = await getUserOrgId(userId, role);
    await db.query('DELETE FROM services WHERE id = ? AND org_id = ?', [serviceId, orgId]);
    res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/services/requests/all
// Get all service requests for an org
// ══════════════════════════════════════════
router.get('/requests/all', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;

  try {
    const orgId = await getUserOrgId(userId, role);
    let query = `
      SELECT sr.*, s.title as service_title, s.fee, u.full_name as member_name 
      FROM service_requests sr
      JOIN services s ON sr.service_id = s.id
      JOIN users u ON sr.user_id = u.id
      WHERE sr.org_id = ?
    `;
    let params = [orgId];

    // If member, only show their own requests
    if (role === 'member') {
      query += ' AND sr.user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY sr.created_at DESC';

    const [requests] = await db.query(query, params);
    res.json({ success: true, requests });
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/services/request/:id
// Member requests a service
// ══════════════════════════════════════════
router.post('/request/:id', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  const serviceId = req.params.id;
  const { notes } = req.body;

  if (role !== 'member') {
    return res.status(403).json({ success: false, message: 'Only members can request services' });
  }

  try {
    const orgId = await getUserOrgId(userId, role);
    if (!orgId) return res.status(403).json({ success: false, message: 'Organization not found' });

    // Check if service exists and is active
    const [services] = await db.query('SELECT * FROM services WHERE id = ? AND org_id = ? AND status = "active"', [serviceId, orgId]);
    if (services.length === 0) return res.status(404).json({ success: false, message: 'Service not found or inactive' });

    // Insert request
    await db.query(
      'INSERT INTO service_requests (service_id, user_id, org_id, notes) VALUES (?, ?, ?, ?)',
      [serviceId, userId, orgId, notes || '']
    );

    res.json({ success: true, message: 'Service requested successfully!' });
  } catch (error) {
    console.error('Request service error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/services/request/:id/status
// OrgAdmin updates request status
// ══════════════════════════════════════════
router.put('/request/:id/status', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  if (role !== 'orgadmin') return res.status(403).json({ success: false, message: 'Unauthorized' });

  const requestId = req.params.id;
  const { status } = req.body;

  try {
    const orgId = await getUserOrgId(userId, role);
    await db.query(
      'UPDATE service_requests SET status = ? WHERE id = ? AND org_id = ?',
      [status, requestId, orgId]
    );
    res.json({ success: true, message: `Request marked as ${status}` });
  } catch (error) {
    console.error('Update request status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
