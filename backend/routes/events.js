// routes/events.js
// Handles all event management operations

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { isLoggedIn, isOrgAdmin } = require('../middleware/auth');

async function verifyOrgOwnership(user, orgId) {
  if (user.role === 'superadmin') return true;
  const [rows] = await db.query('SELECT id FROM organizations WHERE id = ? AND created_by = ?', [orgId, user.id]);
  return rows.length > 0;
}

async function verifyOrgMembership(user, orgId) {
  const [rows] = await db.query('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?', [orgId, user.id]);
  return rows.length > 0;
}

async function verifyEventOrgAccess(user, eventId) {
  if (user.role === 'superadmin') return true;
  const [rows] = await db.query('SELECT org_id FROM events WHERE id = ?', [eventId]);
  if (rows.length === 0) return false;
  const orgId = rows[0].org_id;
  if (user.role === 'orgadmin') {
    return verifyOrgOwnership(user, orgId);
  }
  return verifyOrgMembership(user, orgId);
}

// ══════════════════════════════════════════
// GET /api/events
// Get all events for an organization
// ══════════════════════════════════════════
router.get('/', isLoggedIn, async (req, res) => {
  const { org_id, type, search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  if (!org_id) {
    return res.status(400).json({ success: false, message: 'Organization ID is required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = req.session.user.role === 'orgadmin'
      ? await verifyOrgOwnership(req.session.user, org_id)
      : await verifyOrgMembership(req.session.user, org_id);

    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  const userId = req.session.user.id;

  try {
    let query = `
      SELECT e.*, u.full_name as created_by_name,
             COUNT(ea.id) as attendee_count,
             (SELECT rsvp_status FROM event_attendance WHERE event_id = e.id AND user_id = ?) as my_rsvp
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN event_attendance ea ON e.id = ea.event_id
      WHERE e.org_id = ?
    `;
    const params = [userId, org_id];

    if (type && type !== 'All') {
      query += ' AND e.event_type = ?';
      params.push(type);
    }

    if (search) {
      query += ' AND e.title LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' GROUP BY e.id ORDER BY e.start_time ASC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [events] = await db.query(query, params);

    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM events WHERE org_id = ?',
      [org_id]
    );

    res.json({
      success: true,
      events,
      total:   countResult[0].total,
      page:    Number(page),
      pages:   Math.ceil(countResult[0].total / limit)
    });

  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/events/:id
// Get a single event with its attendees
// ══════════════════════════════════════════
router.get('/:id', isLoggedIn, async (req, res) => {
  const { id } = req.params;

  try {
    if (req.session.user.role !== 'superadmin') {
      const allowed = await verifyEventOrgAccess(req.session.user, id);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Access denied to this event' });
      }
    }

    const [events] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const [attendees] = await db.query(`
      SELECT u.id, u.full_name, u.email, ea.rsvp_status, ea.attended
      FROM event_attendance ea
      JOIN users u ON ea.user_id = u.id
      WHERE ea.event_id = ?
    `, [id]);

    res.json({ success: true, event: events[0], attendees });

  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/events
// Create a new event
// ══════════════════════════════════════════
router.post('/', isOrgAdmin, async (req, res) => {
  const { org_id, title, description, event_type, location, start_time, end_time, max_attendees, rsvp_deadline } = req.body;
  const createdBy = req.session.user.id;

  if (!title || !start_time || !org_id) {
    return res.status(400).json({ success: false, message: 'Title, start time and org ID are required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyOrgOwnership(req.session.user, org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    const [result] = await db.query(`
      INSERT INTO events (org_id, title, description, event_type, location, start_time, end_time, max_attendees, rsvp_deadline, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [org_id, title, description, event_type || 'Meeting', location, start_time, end_time, max_attendees || 50, rsvp_deadline, createdBy]);

    res.status(201).json({ success: true, message: 'Event created!', event_id: result.insertId });

  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/events/:id
// Update an event
// ══════════════════════════════════════════
router.put('/:id', isOrgAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, description, event_type, location, start_time, end_time, max_attendees, status } = req.body;

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyEventOrgAccess(req.session.user, id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this event' });
    }
  }

  try {
    await db.query(`
      UPDATE events SET title = ?, description = ?, event_type = ?, location = ?,
      start_time = ?, end_time = ?, max_attendees = ?, status = ? WHERE id = ?
    `, [title, description, event_type, location, start_time, end_time, max_attendees, status, id]);

    res.json({ success: true, message: 'Event updated!' });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// DELETE /api/events/:id
// Delete an event
// ══════════════════════════════════════════
router.delete('/:id', isOrgAdmin, async (req, res) => {
  const { id } = req.params;

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyEventOrgAccess(req.session.user, id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this event' });
    }
  }

  try {
    await db.query('DELETE FROM events WHERE id = ?', [id]);
    res.json({ success: true, message: 'Event deleted!' });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/events/:id/rsvp
// Member RSVPs for an event
// ══════════════════════════════════════════
router.post('/:id/rsvp', isLoggedIn, async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;  // 'yes', 'maybe', 'no'
  const userId     = req.session.user.id;

  if (!['yes', 'maybe', 'no'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid RSVP status' });
  }

  try {
    await db.query(`
      INSERT INTO event_attendance (event_id, user_id, rsvp_status)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE rsvp_status = VALUES(rsvp_status)
    `, [id, userId, status]);

    res.json({ success: true, message: `RSVP set to "${status}"` });

  } catch (error) {
    console.error('RSVP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;