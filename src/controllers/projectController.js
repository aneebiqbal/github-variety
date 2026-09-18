const projectService = require('../services/projectService');
const prisma = require('../utils/prisma');

const PROJECT_KEY_REGEX = /^[a-z0-9-]+$/;

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
    const projects = await projectService.getProjectsByOrg(req.organizationId);
    return res.status(200).json({ success: true, projects });
  } catch (err) {
    console.error('listProjects error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
}

async function createProject(req, res) {
  const { name, projectKey, githubOwner, githubRepo } = req.body;

  if (!name || !projectKey || !githubOwner || !githubRepo) {
    return res.status(400).json({
      success: false,
      error: 'All fields are required: name, projectKey, githubOwner, githubRepo',
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
      organizationId: req.organizationId,
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
  const { name, projectKey, githubOwner, githubRepo, isActive } = req.body;

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
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  try {
    const result = await projectService.updateProjectById(id, req.organizationId, data);
    if (result.count === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    // Fetch the updated project to return it in the response.
    const project = await projectService.getProjectById(id);
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
    const result = await projectService.deleteProjectById(id, req.organizationId);
    if (result.count === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    return res.status(200).json({ success: true, message: 'Project deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
}

async function listFeedbacks(req, res) {
  const { projectId } = req.params;

  try {
    // Confirm the project belongs to the caller's org before returning its feedbacks.
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: req.organizationId },
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
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
  listFeedbacks,
  cleanupExpiredSessions,
  cleanupRateLimit,
};
