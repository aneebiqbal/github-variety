const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { hashPassword, verifyPassword } = require('../utils/password');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_EMAIL = 254;
const MAX_ORG_NAME = 100;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId, organizationId, ipAddress, userAgent) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, userId, organizationId, expiresAt, ipAddress, userAgent },
  });
  return token;
}

// POST /api/auth/signup
// Creates Organization + User + Session in one transaction, returns a token
// (auto-login). Never returns the password hash.
async function signup(req, res) {
  const { orgName, email, password } = req.body;

  if (!orgName || !orgName.trim()) {
    return res.status(400).json({ success: false, error: 'Organization name is required' });
  }
  if (orgName.length > MAX_ORG_NAME) {
    return res.status(400).json({ success: false, error: `Organization name must be ${MAX_ORG_NAME} characters or fewer` });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > MAX_EMAIL || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ success: false, error: 'A valid email is required' });
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
  }

  const passwordHash = await hashPassword(password);

  try {
    // All-or-nothing: org + user + session created together.
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName.trim() },
      });
      const user = await tx.user.create({
        data: { email: normalizedEmail, passwordHash, organizationId: org.id },
      });
      const token = generateToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await tx.session.create({
        data: {
          token,
          userId: user.id,
          organizationId: org.id,
          expiresAt,
          ipAddress: req.ip || req.connection.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
        },
      });
      return { org, user, token };
    });

    return res.status(201).json({
      success: true,
      token: result.token,
      organizationId: result.org.id,
      email: result.user.email,
    });
  } catch (err) {
    // Unique constraint on User.email → email already registered.
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }
    console.error('signup error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create account' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Always run a verify to avoid timing-oracle on email existence. If the user
  // is missing, verify against a dummy hash (result is discarded).
  const hashToCheck = user
    ? user.passwordHash
    : '$argon2id$v=19$m=65536,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  const ok = await verifyPassword(hashToCheck, password);

  if (!user || !ok) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const token = await createSession(
    user.id,
    user.organizationId,
    req.ip || req.connection.remoteAddress || null,
    req.headers['user-agent'] || null,
  );

  return res.status(200).json({
    success: true,
    token,
    organizationId: user.organizationId,
    email: user.email,
  });
}

// POST /api/auth/logout
async function logout(req, res) {
  const token = req.headers['x-admin-token'];
  if (token) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
  }
  return res.status(200).json({ success: true, message: 'Logged out' });
}

module.exports = { signup, login, logout };
