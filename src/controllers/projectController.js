const crypto = require('crypto');
const projectService = require('../services/projectService');
const prisma = require('../utils/prisma');

const PROJECT_KEY_REGEX = /^[a-z0-9-]+$/;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(ipAddress, userAgent) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, expiresAt, ipAddress, userAgent },
  });
  return token;
}

async function validateSession(token) {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return false;
  if (new Date() > session.expiresAt) {
    // Expired — clean it up
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return false;
  }
  return true;
}

async function destroySession(token) {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

// Periodic cleanup of expired sessions (safe to call; idempotent)
async function cleanupExpiredSessions() {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// Periodic cleanup of expired rate limit rows (safe to call; idempotent)
// Shares the same cleanup cron as sessions — no separate mechanism.
async function cleanupRateLimit() {
  const result = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

async function listProjects(req, res) {
  try {
    const projects = await projectService.getAllProjects();
    return res.status(200).json({ success: true, projects });
  } catch (err) {
    console.error('listProjects error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
}

async function createProject(req, res) {
  const { name, projectKey, githubOwner, githubRepo, installationId } = req.body;

  if (!name || !projectKey || !githubOwner || !githubRepo || !installationId) {
    return res.status(400).json({
      success: false,
      error: 'All fields are required: name, projectKey, githubOwner, githubRepo, installationId',
    });
  }

  if (projectKey.length > 50 || !PROJECT_KEY_REGEX.test(projectKey)) {
    return res.status(400).json({
      success: false,
      error: 'projectKey must match ^[a-z0-9-]+$ and be at most 50 characters',
    });
  }

  try {
    const project = await projectService.createProject({
      name,
      projectKey,
      githubOwner,
      githubRepo,
      installationId,
    });

    const widgetSnippet = `<script src="${process.env.BACKEND_URL}/widget.js" data-project="${projectKey}"></script>`;

    return res.status(201).json({ success: true, project, widgetSnippet });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'projectKey already exists' });
    }
    return res.status(500).json({ success: false, error: 'Failed to create project' });
  }
}

async function updateProject(req, res) {
  const { id } = req.params;
  const { name, projectKey, githubOwner, githubRepo, installationId, isActive } = req.body;

  // Only allow specific fields to be updated
  const data = {};
  if (name !== undefined) {
    if (name.length > 100) return res.status(400).json({ success: false, error: 'name must be 100 characters or fewer' });
    data.name = name;
  }
  if (projectKey !== undefined) {
    if (projectKey.length > 50 || !PROJECT_KEY_REGEX.test(projectKey)) {
      return res.status(400).json({ success: false, error: 'projectKey must match ^[a-z0-9-]+$ and be at most 50 characters' });
    }
    data.projectKey = projectKey;
  }
  if (githubOwner !== undefined) data.githubOwner = githubOwner;
  if (githubRepo !== undefined) data.githubRepo = githubRepo;
  if (installationId !== undefined) data.installationId = installationId;
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  try {
    const project = await projectService.updateProject(id, data);
    return res.status(200).json({ success: true, project });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'projectKey already exists' });
    }
    return res.status(500).json({ success: false, error: 'Failed to update project' });
  }
}

async function deleteProject(req, res) {
  const { id } = req.params;

  try {
    await projectService.deleteProject(id);
    return res.status(200).json({ success: true, message: 'Project deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
}

async function verify(req, res) {
  const { password } = req.body;

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  const ipAddress = req.ip || req.connection.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  const token = await createSession(ipAddress, userAgent);
  return res.status(200).json({ success: true, token });
}

async function invalidateToken(token) {
  await destroySession(token);
}

async function listFeedbacks(req, res) {
  const { projectId } = req.params;

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (!project) {
      return res.status(200).json({ success: true, feedbacks: [] });
    }

    const feedbacks = await prisma.feedback.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reporterName: true,
        title: true,
        description: true,
        pageUrl: true,
        githubIssueUrl: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ success: true, feedbacks });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch feedbacks' });
  }
}

module.exports = {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  verify,
  listFeedbacks,
  invalidateToken,
  validateSession,
  cleanupExpiredSessions,
  cleanupRateLimit,
};