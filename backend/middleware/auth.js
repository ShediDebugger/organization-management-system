// middleware/auth.js

function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Please log in to continue' });
  }
}

function isSuperAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
  }
}

function isOrgAdmin(req, res, next) {
  if (req.session && req.session.user &&
     (req.session.user.role === 'orgadmin' || req.session.user.role === 'superadmin')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Org Admin only.' });
  }
}

function isMember(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Members only.' });
  }
}

module.exports = { isLoggedIn, isSuperAdmin, isOrgAdmin, isMember };