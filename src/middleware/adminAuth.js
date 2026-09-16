const { validateSession } = require('../controllers/projectController');

module.exports = async function adminAuth(req, res, next) {
  const provided = req.headers['x-admin-token'];

  if (!provided) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const valid = await validateSession(provided);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
};
