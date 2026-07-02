module.exports = function adminAuth(req, res, next) {
  const provided = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || provided !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
};