const prisma = require('../utils/prisma');
const projectService = require('../services/projectService');
const githubService = require('../services/githubService');

async function submitFeedback(req, res) {
  const { projectKey, title, description, reporterName, pageUrl, userAgent } = req.body;

  if (!projectKey) {
    return res.status(400).json({ success: false, error: 'projectKey is required' });
  }

  if (!title || !description) {
    return res.status(400).json({ success: false, error: 'title and description are required' });
  }

  try {
    const project = await projectService.getProjectByKey(projectKey);

    if (!project || !project.isActive) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const feedback = await prisma.feedback.create({
      data: {
        projectId: project.id,
        reporterName: reporterName || '',
        title,
        description,
        pageUrl: pageUrl || '',
        userAgent: userAgent || '',
        status: 'PENDING',
      },
    });

    try {
      // Attach the in-memory screenshot base64 payload (not persisted to DB)
      // so githubService.createIssue can upload it before issue creation.
      feedback.screenshot = req.body.screenshot || null;

      const { url, number, screenshotUrl } = await githubService.createIssue(project, feedback);

      await prisma.feedback.update({
        where: { id: feedback.id },
        data: {
          githubIssueUrl: url,
          githubIssueNumber: number,
          status: 'CREATED',
          screenshotUrl,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Feedback submitted successfully. A ticket has been created.',
        issueUrl: url,
      });
    } catch (err) {
      console.error('GitHub issue creation failed:', err);
      await prisma.feedback.update({
        where: { id: feedback.id },
        data: { status: 'FAILED' },
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to create ticket. Please try again.',
      });
    }
  } catch (err) {
    console.error('Feedback submission error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create ticket. Please try again.' });
  }
}

module.exports = { submitFeedback };