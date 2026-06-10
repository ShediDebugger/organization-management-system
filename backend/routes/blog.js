// routes/blog.js
// Handles blog posts and announcements

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { isLoggedIn, isOrgAdmin } = require('../middleware/auth');

async function verifyOrgAccess(user, orgId) {
  if (user.role === 'superadmin') return true;
  if (user.role === 'orgadmin') {
    const [rows] = await db.query('SELECT id FROM organizations WHERE id = ? AND created_by = ?', [orgId, user.id]);
    return rows.length > 0;
  }
  const [rows] = await db.query('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?', [orgId, user.id]);
  return rows.length > 0;
}

// ══════════════════════════════════════════
// GET /api/blog
// Get all blog posts for an organization
// ══════════════════════════════════════════
router.get('/', isLoggedIn, async (req, res) => {
  const { org_id, status, category, search } = req.query;

  if (!org_id) {
    return res.status(400).json({ success: false, message: 'Organization ID is required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyOrgAccess(req.session.user, org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    let query = `
      SELECT b.*, u.full_name as author_name
      FROM blog_posts b
      JOIN users u ON b.author_id = u.id
      WHERE b.org_id = ?
    `;
    const params = [org_id];

    if (status && status !== 'all') {
      query += ' AND b.status = ?';
      params.push(status);
    }

    if (category && category !== 'all') {
      query += ' AND b.category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND b.title LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY b.created_at DESC';

    const [posts] = await db.query(query, params);
    res.json({ success: true, posts });

  } catch (error) {
    console.error('Get blog error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/blog
// Create a new blog post
// ══════════════════════════════════════════
router.post('/', isOrgAdmin, async (req, res) => {
  const { org_id, title, content, category, status } = req.body;
  const authorId = req.session.user.id;

  if (!title || !content || !org_id) {
    return res.status(400).json({ success: false, message: 'Title and content are required' });
  }

  try {
    const [result] = await db.query(`
      INSERT INTO blog_posts (org_id, author_id, title, content, category, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [org_id, authorId, title, content, category || 'General', status || 'draft']);

    res.status(201).json({ success: true, message: 'Post created!', post_id: result.insertId });

  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/blog/:id
// Update a blog post
// ══════════════════════════════════════════
router.put('/:id', isOrgAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, content, category, status } = req.body;

  try {
    await db.query(
      'UPDATE blog_posts SET title = ?, content = ?, category = ?, status = ? WHERE id = ?',
      [title, content, category, status, id]
    );
    res.json({ success: true, message: 'Post updated!' });

  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// DELETE /api/blog/:id
// Delete a blog post
// ══════════════════════════════════════════
router.delete('/:id', isOrgAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM blog_posts WHERE id = ?', [id]);
    res.json({ success: true, message: 'Post deleted!' });

  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;