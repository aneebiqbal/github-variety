const projectService = require('../services/projectService');
const prisma = require('../utils/prisma');

const PROJECT_KEY_REGEX = /^[a-z0-9-]+$/;

async function listProjects(req, res) {
  try {
    const projects = await projectService.getAllProjects();
    return res.status(200).json({ success: true, projects });
  } catch (err) {
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
  const data = req.body;

  try {
    const project = await projectService.updateProject(id, data);
    return res.status(200).json({ success: true, project });
  } catch (err) {
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

  if (password === process.env.ADMIN_PASSWORD) {
    return res.status(200).json({ success: true, token: password });
  }

  return res.status(401).json({ success: false, error: 'Invalid password' });
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
};