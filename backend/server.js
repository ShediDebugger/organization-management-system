// server.js
// ══════════════════════════════════════════════════
// OrgMember Backend - Main Entry Point
// Run: node server.js  OR  npm run dev
// ══════════════════════════════════════════════════

const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

// ── Middleware Setup ──
app.use(express.json());                    // parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // parse form data

// CORS — allow frontend to talk to backend
const allowedOrigins = ['http://localhost:3000', 'null'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS')); 
    }
  },
  credentials: true                        // allow cookies/session
}));

// Session Setup (stores login state)
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev_secret_key',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,                       // set to true if using HTTPS
    maxAge:   24 * 60 * 60 * 1000         // session lasts 24 hours
  }
}));

// Serve HTML files from parent folder
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ──
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/members',       require('./routes/members'));
app.use('/api/events',        require('./routes/events'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/blog',          require('./routes/blog'));
app.use('/api/superadmin',    require('./routes/superadmin'));
app.use('/api/organizations', require('./routes/organizations'));

// ── Health Check ──
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    message: 'OrgMember API is running!',
    time:    new Date().toISOString()
  });
});

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

// ── Start Server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 OrgMember server running at http://localhost:${PORT}`);
  console.log(`📋 API Health:  http://localhost:${PORT}/api/health`);
  console.log(`🌐 Frontend:    http://localhost:${PORT}/index.html\n`);
});