const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const os      = require('os');
const { isLoggedIn, isSuperAdmin } = require('../middleware/auth');

// GET /api/superadmin/stats
router.get('/stats', isLoggedIn, isSuperAdmin, async (req, res) => {
  try {
    // 1. Total Organizations
    const [[{ total_orgs }]] = await db.query('SELECT COUNT(*) as total_orgs FROM organizations');
    
    // 2. Active Users (Org Admins + Members)
    const [[{ active_users }]] = await db.query("SELECT COUNT(*) as active_users FROM users WHERE status = 'active' AND role IN ('orgadmin', 'member')");
    
    // 3. Total Members
    const [[{ total_members }]] = await db.query("SELECT COUNT(*) as total_members FROM users WHERE role = 'member'");
    
    // 4. Total Revenue (All-time paid payments)
    const [[{ total_revenue }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as total_revenue FROM payments WHERE status = 'paid'");

    // 5. Monthly Revenue (Current month paid payments)
    const [[{ monthly_revenue }]] = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as monthly_revenue FROM payments WHERE status = 'paid' AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"
    );

    // 6. Recent Activity
    // Fetch latest organizations
    const [latestOrgs] = await db.query('SELECT name, created_at FROM organizations ORDER BY created_at DESC LIMIT 3');
    // Fetch latest payments
    const [latestPayments] = await db.query('SELECT amount, currency, created_at FROM payments WHERE status = "paid" ORDER BY created_at DESC LIMIT 3');
    // Fetch latest user updates/registrations
    const [latestUsers] = await db.query('SELECT full_name, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 3');

    // Combine recent activity in a formatted array
    const activities = [];
    latestOrgs.forEach(o => {
      activities.push({ type: 'org', text: `New Org Created: ${o.name}`, time: o.created_at });
    });
    latestPayments.forEach(p => {
      activities.push({ type: 'payment', text: `Payment Received: ${p.currency} ${p.amount}`, time: p.created_at });
    });
    latestUsers.forEach(u => {
      activities.push({ type: 'user', text: `New User: ${u.full_name} (${u.role})`, time: u.created_at });
    });
    // Sort activities by time descending
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    // 6. System Health
    const uptime = os.uptime(); // in seconds
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

    res.json({
      success: true,
      stats: {
        total_orgs,
        active_users,
        total_members,
        total_revenue,
        monthly_revenue,
        ram_usage: ramUsage,
        uptime: uptime,
        activities: activities.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('Superadmin stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/superadmin/admins
router.get('/admins', isLoggedIn, isSuperAdmin, async (req, res) => {
  try {
    const [admins] = await db.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at,
             o.name as org_name
      FROM users u
      LEFT JOIN organizations o ON o.created_by = u.id
      WHERE u.role = 'orgadmin'
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, admins });
  } catch (error) {
    console.error('Superadmin get admins error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/superadmin/members
router.get('/members', isLoggedIn, isSuperAdmin, async (req, res) => {
  try {
    const [members] = await db.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at,
             o.name as org_name
      FROM users u
      LEFT JOIN org_members om ON om.user_id = u.id
      LEFT JOIN organizations o ON o.id = om.org_id
      WHERE u.role = 'member'
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, members });
  } catch (error) {
    console.error('Superadmin get members error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/superadmin/payments
router.get('/payments', isLoggedIn, isSuperAdmin, async (req, res) => {
  try {
    const [payments] = await db.query(`
      SELECT p.*, u.full_name as user_name, o.name as org_name
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN organizations o ON p.org_id = o.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, payments });
  } catch (error) {
    console.error('Superadmin get payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
