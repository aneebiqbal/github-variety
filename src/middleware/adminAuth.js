const prisma = require('../utils/prisma');

// Resolves the x-admin-token → session → user + organization, attaches
// identity to the request. Every downstream handler reads req.organizationId;
// no handler re-derives it.
module.exports = async function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const session = await prisma.session.findUnique({
    where: { token },
    select: { id: true, userId: true, organizationId: true, expiresAt: true },
  });

  if (!session || new Date() > session.expiresAt) {
    // Expired or missing — clean up if it existed.
    if (session) {
      await prisma.session.delete({ where: { token } }).catch(() => {});
    }
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  req.sessionId = session.id;
  req.userId = session.userId;
  req.organizationId = session.organizationId;

  next();
};
