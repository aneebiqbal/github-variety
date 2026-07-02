require('dotenv').config();

const INSTALLATION_ID = 143731174;
const OWNER = 'najiullahrao';
const REPO = 'github-variety-test';

async function getAppInstance() {
  const { App } = await import('@octokit/app');
  const { Octokit: RestOctokit } = await import('@octokit/rest');
  return new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
    Octokit: RestOctokit,
  });
}

async function main() {
  const app = await getAppInstance();
  const octokit = await app.getInstallationOctokit(INSTALLATION_ID);

  // a. repos.get — default_branch
  console.log('\n=== repos.get ===');
  try {
    const res = await octokit.repos.get({ owner: OWNER, repo: REPO });
    console.log('default_branch:', res.data.default_branch);
    console.log('full data:', res.data);
  } catch (err) {
    console.error('ERROR repos.get:', err);
  }

  // b. repos.listBranches
  console.log('\n=== repos.listBranches ===');
  try {
    const res = await octokit.repos.listBranches({ owner: OWNER, repo: REPO });
    console.log('branches:', res.data);
  } catch (err) {
    console.error('ERROR repos.listBranches:', err);
  }

  // c. repos.getContent — feedback-screenshots folder (may 404)
  console.log('\n=== repos.getContent(feedback-screenshots) ===');
  try {
    const res = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: 'feedback-screenshots',
    });
    console.log('content:', res.data);
  } catch (err) {
    console.log('getContent result (likely 404, folder does not exist yet):', err);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});