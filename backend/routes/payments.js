// routes/payments.js
// Handles all payment operations

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { isLoggedIn, isOrgAdmin } = require('../middleware/auth');

async function verifyOrgOwnership(user, orgId) {
  if (user.role === 'superadmin') return true;
  const [rows] = await db.query('SELECT id FROM organizations WHERE id = ? AND created_by = ?', [orgId, user.id]);
  return rows.length > 0;
}

// ══════════════════════════════════════════
// GET /api/payments
// Get payments for an organization (Org Admin)
// ══════════════════════════════════════════
router.get('/', isOrgAdmin, async (req, res) => {
  const { org_id, status, page = 1, limit = 10 } = req.query;
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
      SELECT p.*, u.full_name, u.email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.org_id = ?
    `;
    const params = [org_id];

    if (status && status !== 'all') {
      query += ' AND p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [payments] = await db.query(query, params);

    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM payments WHERE org_id = ?',
      [org_id]
    );

    res.json({
      success: true,
      payments,
      total: countResult[0].total
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /api/payments/my  ← MUST be BEFORE /:id
// Get payments for the logged-in member
// ══════════════════════════════════════════
router.get('/my', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [payments] = await db.query(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, payments });

  } catch (error) {
    console.error('Get my payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/payments
// Record a manual payment
// ══════════════════════════════════════════
router.post('/', isOrgAdmin, async (req, res) => {
  const { org_id, user_id, amount, currency, payment_type, description, status, due_date } = req.body;

  if (!org_id || !user_id || !amount) {
    return res.status(400).json({ success: false, message: 'Org, user and amount required' });
  }

  if (req.session.user.role !== 'superadmin') {
    const allowed = await verifyOrgOwnership(req.session.user, org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    const paid_at = status === 'paid' ? new Date() : null;

    await db.query(`
      INSERT INTO payments (org_id, user_id, amount, currency, payment_type, description, status, due_date, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [org_id, user_id, amount, currency || 'USD', payment_type || 'membership', description, status || 'pending', due_date, paid_at]);

    res.status(201).json({ success: true, message: 'Payment recorded!' });

  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// PUT /api/payments/:id
// Update payment status
// ══════════════════════════════════════════
router.put('/:id', isOrgAdmin, async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;
  const paid_at    = status === 'paid' ? new Date() : null;

  if (req.session.user.role !== 'superadmin') {
    const [paymentRows] = await db.query('SELECT org_id FROM payments WHERE id = ?', [id]);
    if (paymentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    const allowed = await verifyOrgOwnership(req.session.user, paymentRows[0].org_id);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied to this organization' });
    }
  }

  try {
    await db.query(
      'UPDATE payments SET status = ?, paid_at = ? WHERE id = ?',
      [status, paid_at, id]
    );
    res.json({ success: true, message: 'Payment updated!' });

  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/payments/checkout/:id
// Initialize checkout (Dummy payment gateway)
// ══════════════════════════════════════════
router.post('/checkout/:id', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const paymentId = req.params.id;
  const { method } = req.body;

  try {
    const [payments] = await db.query('SELECT * FROM payments WHERE id = ? AND user_id = ? AND status != "paid"', [paymentId, userId]);
    if (payments.length === 0) return res.status(404).json({ success: false, message: 'Payment not found or already paid' });
    
    // Simulate payment token generation
    const transactionToken = `txn_${method}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    
    res.json({ 
      success: true, 
      clientSecret: transactionToken, 
      paymentDetails: payments[0]
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /api/payments/confirm/:id
// Confirm payment success
// ══════════════════════════════════════════
router.post('/confirm/:id', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const paymentId = req.params.id;

  try {
    const [payments] = await db.query('SELECT * FROM payments WHERE id = ? AND user_id = ?', [paymentId, userId]);
    if (payments.length === 0) return res.status(404).json({ success: false, message: 'Payment not found' });
    
    await db.query(
      'UPDATE payments SET status = "paid", paid_at = CURRENT_TIMESTAMP WHERE id = ?',
      [paymentId]
    );

    res.json({ success: true, message: 'Payment processed successfully!' });
  } catch (error) {
    console.error('Confirm error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;