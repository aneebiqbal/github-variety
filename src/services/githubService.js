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
[View screenshot](${screenshotUrl})`;
  }

  return body;
}

// Uploads a base64-encoded screenshot to the project's repo via the
// GitHub Contents API. Returns the blob viewer URL for embedding, or
// null if the upload fails (never throws so issue creation is not
// blocked).
// Uses GitHub's blob viewer URL (not raw.githubusercontent.com) because
// raw URLs require public repo access and 404 on private repos. The
// blob viewer works for both public and private repos since GitHub
// handles auth via the viewer's own session. Note: this means the
// screenshot appears as a clickable link in the issue rather than an
// inline-embedded thumbnail, since blob viewer URLs don't auto-render
// as images in markdown.
async function uploadScreenshot(project, base64Data, feedbackId) {
  if (!base64Data) { return null; }
  try {
    const app = await getAppInstance();
    const octokit = await app.getInstallationOctokit(Number(project.installationId));

    await octokit.repos.createOrUpdateFileContents({
      owner: project.githubOwner,
      repo: project.githubRepo,
      path: `feedback-screenshots/${feedbackId}.jpg`,
      message: `Add feedback screenshot for ${feedbackId}`,
      content: base64Data,
    });

    // NOTE: hardcoded branch name "main" below. If a client repo uses
    // "master" or another default branch, this blob URL will be wrong
    // (the commit still lands on the correct default branch, but the
    // linked URL here won't resolve). Revisit if a client repo uses
    // a non-"main" default branch.
    return `https://github.com/${project.githubOwner}/${project.githubRepo}/blob/main/feedback-screenshots/${feedbackId}.jpg`;
  } catch (err) {
    console.error('Failed to upload feedback screenshot:', err);
    return null;
  }
}

async function createIssue(project, feedback) {
  const app = await getAppInstance();
  const octokit = await app.getInstallationOctokit(Number(project.installationId));

  await ensureLabelsExist(octokit, project.githubOwner, project.githubRepo);

  let screenshotUrl = null;
  if (feedback.screenshot) {
    screenshotUrl = await uploadScreenshot(project, feedback.screenshot, feedback.id);
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