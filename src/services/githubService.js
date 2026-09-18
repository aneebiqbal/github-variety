let appInstance = null;

async function getAppInstance() {
  if (appInstance) {
    return appInstance;
  }
  const { App } = await import('@octokit/app');
  const { Octokit: RestOctokit } = await import('@octokit/rest');
  appInstance = new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
    Octokit: RestOctokit,
  });
  return appInstance;
}

const REQUIRED_LABELS = [
  { name: 'bug', color: 'd73a4a', description: 'Something is not working' },
  { name: 'client-feedback', color: '0e8a16', description: 'Reported via GitHub Variety widget' },
];

async function ensureLabelsExist(octokit, owner, repo) {
  for (const label of REQUIRED_LABELS) {
    try {
      await octokit.issues.getLabel({ owner, repo, name: label.name });
    } catch (err) {
      if (err.status === 404) {
        await octokit.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
      } else {
        throw err;
      }
    }
  }
}

function formatIssueBody(feedback, screenshotUrl) {
  let body = `**Reported by:** ${feedback.reporterName}

**Page:** ${feedback.pageUrl}

**Description:**
${feedback.description}

---
**Browser:** ${feedback.userAgent}
**Submitted via:** GitHub Variety`;

  if (screenshotUrl) {
    body += `

**Screenshot:**
![feedback screenshot](${screenshotUrl})`;
  }

  return body;
}

// Uploads a base64-encoded screenshot to the repo via the GitHub Contents
// API. Returns the raw content URL for inline rendering, or null if the
// upload fails (never throws so issue creation is not blocked). Uses the
// repo's actual default branch to construct the URL.
async function uploadScreenshot(owner, repo, installationId, base64Data, feedbackId) {
  if (!base64Data) { return null; }
  try {
    const app = await getAppInstance();
    const octokit = await app.getInstallationOctokit(Number(installationId));

    // Fetch the repo's default branch so the URL always resolves correctly
    const { data: repoInfo } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoInfo.default_branch || 'main';

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: `feedback-screenshots/${feedbackId}.jpg`,
      message: `Add feedback screenshot for ${feedbackId}`,
      content: base64Data,
      branch: defaultBranch,
    });

    // Return the raw content URL so the image renders inline in the issue body
    return `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/feedback-screenshots/${feedbackId}.jpg`;
  } catch (err) {
    console.error('Failed to upload feedback screenshot:', err);
    return null;
  }
}

// Creates a GitHub issue for the feedback. installationId comes from the
// project's Organization (one installation covers multiple repos). Throws if
// the org has no installationId yet — the caller catches this and marks the
// feedback FAILED rather than surfacing an uncaught exception to the widget.
async function createIssue(project, feedback, installationId) {
  if (!installationId) {
    throw new Error('Organization has no GitHub App installation configured');
  }

  const app = await getAppInstance();
  const octokit = await app.getInstallationOctokit(Number(installationId));

  await ensureLabelsExist(octokit, project.githubOwner, project.githubRepo);

  let screenshotUrl = null;
  if (feedback.screenshot) {
    screenshotUrl = await uploadScreenshot(
      project.githubOwner,
      project.githubRepo,
      installationId,
      feedback.screenshot,
      feedback.id,
    );
  }

  const response = await octokit.issues.create({
    owner: project.githubOwner,
    repo: project.githubRepo,
    title: feedback.title,
    body: formatIssueBody(feedback, screenshotUrl),
    labels: ['bug', 'client-feedback'],
  });

  return {
    url: response.data.html_url,
    number: response.data.number,
    screenshotUrl,
  };
}

module.exports = { createIssue, uploadScreenshot };
