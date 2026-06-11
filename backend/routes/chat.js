// routes/chat.js
// Direct messaging between members and org admin

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

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
// GET /api/chat/contacts
// For orgadmin: get list of all members with their last message
// For member: get the admin as the contact
// ══════════════════════════════════════════
router.get('/contacts', requireLogin, async (req, res) => {
  const { id: userId, role } = req.session.user;

  try {
    const orgId = await getUserOrgId(userId, role);
    if (!orgId) return res.status(403).json({ success: false, message: 'Organization not found' });

    if (role === 'orgadmin') {
      // Return all members in the org
      const [contacts] = await db.query(
        `SELECT u.id, u.full_name, u.email, om.role_in_org,
                (SELECT cm.message FROM chat_messages cm 
                 WHERE (cm.sender_id = u.id AND cm.receiver_id = ?) 
                    OR (cm.sender_id = ? AND cm.receiver_id = u.id)
                 ORDER BY cm.created_at DESC LIMIT 1) as last_message,
                (SELECT cm.created_at FROM chat_messages cm 
                 WHERE (cm.sender_id = u.id AND cm.receiver_id = ?) 
                    OR (cm.sender_id = ? AND cm.receiver_id = u.id)
                 ORDER BY cm.created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM chat_messages cm WHERE cm.sender_id = u.id AND cm.receiver_id = ? AND cm.is_read = 0) as unread_count
         FROM users u
         JOIN org_members om ON u.id = om.user_id
         WHERE om.org_id = ? AND u.status = 'active'
         ORDER BY last_message_at DESC`,
        [userId, userId, userId, userId, userId, orgId]
      );
      return res.json({ success: true, contacts });
    }

    if (role === 'member') {
      // Return the org admin as the only contact
      const [orgs] = await db.query(
        `SELECT u.id, u.full_name, u.email, 'Admin' as role_in_org,
                (SELECT cm.message FROM chat_messages cm 
                 WHERE (cm.sender_id = u.id AND cm.receiver_id = ?) 
                    OR (cm.sender_id = ? AND cm.receiver_id = u.id)
                 ORDER BY cm.created_at DESC LIMIT 1) as last_message,
                (SELECT cm.created_at FROM chat_messages cm 
                 WHERE (cm.sender_id = u.id AND cm.receiver_id = ?) 
                    OR (cm.sender_id = ? AND cm.receiver_id = u.id)
                 ORDER BY cm.created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM chat_messages cm WHERE cm.sender_id = u.id AND cm.receiver_id = ? AND cm.is_read = 0) as unread_count
         FROM organizations o
         JOIN users u ON o.created_by = u.id
         WHERE o.id = ?`,
        [userId, userId, userId, userId, userId, orgId]
      );
      return res.json({ success: true, contacts: orgs });
    }
  } catch (error) {
    console.error('Contacts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/chat/messages/:withUserId
// Get messages between logged in user and another user
// ══════════════════════════════════════════
router.get('/messages/:withUserId', requireLogin, async (req, res) => {
  const { id: userId } = req.session.user;
  const withUserId = req.params.withUserId;

  try {
    const [messages] = await db.query(
      `SELECT cm.*, 
              s.full_name as sender_name,
              r.full_name as receiver_name
       FROM chat_messages cm
       JOIN users s ON cm.sender_id = s.id
       JOIN users r ON cm.receiver_id = r.id
       WHERE (cm.sender_id = ? AND cm.receiver_id = ?)
          OR (cm.sender_id = ? AND cm.receiver_id = ?)
       ORDER BY cm.created_at ASC`,
      [userId, withUserId, withUserId, userId]
    );

    // Mark incoming messages as read
    await db.query(
      'UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [withUserId, userId]
    );

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/chat/send
// Send a message to another user
// ══════════════════════════════════════════
router.post('/send', requireLogin, async (req, res) => {
  const { id: senderId } = req.session.user;
  const { receiver_id, message } = req.body;

  if (!receiver_id || !message?.trim()) {
    return res.status(400).json({ success: false, message: 'Receiver and message are required' });
  }

  try {
    await db.query(
      'INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
      [senderId, receiver_id, message.trim()]
    );

    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/chat/unread
// Get total unread message count for the current user
// ══════════════════════════════════════════
router.get('/unread', requireLogin, async (req, res) => {
  const { id: userId } = req.session.user;

  try {
    const [result] = await db.query(
      'SELECT COUNT(*) as count FROM chat_messages WHERE receiver_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ success: true, count: result[0].count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
