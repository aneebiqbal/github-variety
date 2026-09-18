const prisma = require('../utils/prisma');
const projectService = require('../services/projectService');
const githubService = require('../services/githubService');

// Input validation limits
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_NAME = 100;

async function submitFeedback(req, res) {
  const { projectKey, title, description, reporterName, pageUrl, userAgent } = req.body;

  if (!projectKey || !projectKey.trim()) {
    return res.status(400).json({ success: false, error: 'projectKey is required' });
  }

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }
  if (title.length > MAX_TITLE) {
    return res.status(400).json({ success: false, error: `title must be ${MAX_TITLE} characters or fewer` });
  }

  if (!description || !description.trim()) {
    return res.status(400).json({ success: false, error: 'description is required' });
  }
  if (description.length > MAX_DESCRIPTION) {
    return res.status(400).json({ success: false, error: `description must be ${MAX_DESCRIPTION} characters or fewer` });
  }
  if (reporterName && reporterName.length > MAX_NAME) {
    return res.status(400).json({ success: false, error: `name must be ${MAX_NAME} characters or fewer` });
  }

  try {
    // Load the project with its Organization so we can read the org-level
    // installationId (one installation covers multiple repos under the org).
    const project = await prisma.project.findUnique({
      where: { projectKey },
      include: { organization: true },
    });

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

      const { url, number, screenshotUrl } = await githubService.createIssue(
        project,
        feedback,
        project.organization.installationId,
      );

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
      // Any failure here — including a null installationId (org not yet wired
      // to a GitHub App installation) — marks the feedback FAILED and returns
      // a clean response to the widget. Never an uncaught exception.
      console.error('GitHub issue creation failed:', err.message);

      await prisma.feedback.update({
        where: { id: feedback.id },
        data: { status: 'FAILED' },
      });

      // Surface a distinct message when the org simply has no installation yet,
      // so the project owner knows to complete setup.
      const userMessage = err.message.includes('no GitHub App installation')
        ? 'Feedback received, but this project is not yet connected to GitHub. Please complete the GitHub App installation.'
        : 'Failed to create ticket. Please try again.';

      return res.status(202).json({
        success: false,
        error: userMessage,
      });
    }
  } catch (err) {
    console.error('Feedback submission error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create ticket. Please try again.' });
  }
}

module.exports = { submitFeedback };
