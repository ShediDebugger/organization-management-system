const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// Middleware
const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
};

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
// GET /api/tickets
// Get all tickets for the organization / member
// ══════════════════════════════════════════
router.get('/', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;

  try {
    const orgId = await getUserOrgId(userId, role);
    if (!orgId) return res.status(403).json({ success: false, message: 'No organization found' });

    let query = `
      SELECT t.*, u.full_name as user_name 
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.org_id = ?
    `;
    let params = [orgId];

    // If member, only show their own tickets
    if (role === 'member') {
      query += ' AND t.user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY t.updated_at DESC';

    const [tickets] = await db.query(query, params);
    res.json({ success: true, tickets });
  } catch (error) {
    console.error('Fetch tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/tickets/:id
// Get a specific ticket with its messages
// ══════════════════════════════════════════
router.get('/:id', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  const ticketId = req.params.id;

  try {
    const orgId = await getUserOrgId(userId, role);

    // Get ticket details
    const [tickets] = await db.query(
      'SELECT t.*, u.full_name as user_name FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ? AND t.org_id = ?',
      [ticketId, orgId]
    );

    if (tickets.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const ticket = tickets[0];

    // If member, ensure they own the ticket
    if (role === 'member' && ticket.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to ticket' });
    }

    // Get messages
    const [messages] = await db.query(
      'SELECT m.*, u.full_name as sender_name, u.role as sender_role FROM ticket_messages m JOIN users u ON m.sender_id = u.id WHERE m.ticket_id = ? ORDER BY m.created_at ASC',
      [ticketId]
    );

    res.json({ success: true, ticket, messages });
  } catch (error) {
    console.error('Fetch ticket details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/tickets
// Create a new ticket (Member)
// ══════════════════════════════════════════
router.post('/', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  const { subject, priority, initial_message } = req.body;

  if (role !== 'member') return res.status(403).json({ success: false, message: 'Only members can create tickets' });
  if (!subject || !initial_message) return res.status(400).json({ success: false, message: 'Subject and message are required' });

  try {
    const orgId = await getUserOrgId(userId, role);
    if (!orgId) return res.status(403).json({ success: false, message: 'Organization not found' });

    // Create ticket
    const [ticketResult] = await db.query(
      'INSERT INTO tickets (org_id, user_id, subject, priority) VALUES (?, ?, ?, ?)',
      [orgId, userId, subject, priority || 'medium']
    );

    // Create initial message
    await db.query(
      'INSERT INTO ticket_messages (ticket_id, sender_id, message) VALUES (?, ?, ?)',
      [ticketResult.insertId, userId, initial_message]
    );

    res.json({ success: true, message: 'Ticket created successfully' });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/tickets/:id/message
// Add a message to an existing ticket
// ══════════════════════════════════════════
router.post('/:id/message', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  const ticketId = req.params.id;
  const { message } = req.body;

  if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

  try {
    const orgId = await getUserOrgId(userId, role);

    // Check if ticket exists
    const [tickets] = await db.query('SELECT * FROM tickets WHERE id = ? AND org_id = ?', [ticketId, orgId]);
    if (tickets.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const ticket = tickets[0];

    if (role === 'member' && ticket.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Insert message
    await db.query(
      'INSERT INTO ticket_messages (ticket_id, sender_id, message) VALUES (?, ?, ?)',
      [ticketId, userId, message]
    );

    // Update ticket's updated_at timestamp and potentially change status if it was closed
    let updateQuery = 'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP';
    let params = [ticketId];
    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      updateQuery += ', status = "open"';
    }
    updateQuery += ' WHERE id = ?';
    await db.query(updateQuery, params);

    res.json({ success: true, message: 'Reply sent' });
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/tickets/:id/status
// Update ticket status
// ══════════════════════════════════════════
router.put('/:id/status', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;
  const ticketId = req.params.id;
  const { status } = req.body;

  try {
    const orgId = await getUserOrgId(userId, role);
    
    // Check ticket
    const [tickets] = await db.query('SELECT * FROM tickets WHERE id = ? AND org_id = ?', [ticketId, orgId]);
    if (tickets.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });
    
    if (role === 'member' && tickets[0].user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await db.query(
      'UPDATE tickets SET status = ? WHERE id = ? AND org_id = ?',
      [status, ticketId, orgId]
    );

    res.json({ success: true, message: `Ticket marked as ${status}` });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
