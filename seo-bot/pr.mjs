import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';

const OWNER = process.env.REPO_OWNER || 'agksherwani';
const REPO = process.env.REPO_NAME || 'PestoRest';

export async function createPR({ root, title, body, changedFiles }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branch = `seo-auto-${timestamp}`;

  const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim();

  const baseBranch = git('rev-parse --abbrev-ref HEAD');

  git(`checkout -b ${branch}`);

  if (changedFiles.length > 0) {
    const files = changedFiles.map(f => `"${f}"`).join(' ');
    git(`add ${files}`);

    const status = git('status --porcelain');
    if (!status) {
      git(`checkout ${baseBranch}`);
      git(`branch -D ${branch}`);
      console.log('No staged changes after applying fixes. Skipping PR.');
      return null;
    }

    git(`commit -m "fix(seo): ${title}"`);
  } else {
    git(`checkout ${baseBranch}`);
    git(`branch -D ${branch}`);
    console.log('No files to commit. Skipping PR.');
    return null;
  }

  git(`push origin ${branch}`);
  git(`checkout ${baseBranch}`);

  const octokit = new Octokit({ auth: token });

  const { data: existingPRs } = await octokit.pulls.list({
    owner: OWNER,
    repo: REPO,
    state: 'open',
    head: `${OWNER}:${branch}`,
  });

  if (existingPRs.length > 0) {
    console.log(`PR already exists: ${existingPRs[0].html_url}`);
    return existingPRs[0].html_url;
  }

  const { data: pr } = await octokit.pulls.create({
    owner: OWNER,
    repo: REPO,
    title,
    body,
    head: branch,
    base: baseBranch,
  });

  try {
    await octokit.issues.addLabels({
      owner: OWNER,
      repo: REPO,
      issue_number: pr.number,
      labels: ['seo'],
    });
  } catch {
    console.log('Could not add "seo" label — create it manually in repo settings.');
  }

  try {
    await octokit.issues.addAssignees({
      owner: OWNER,
      repo: REPO,
      issue_number: pr.number,
      assignees: [OWNER],
    });
  } catch {
    console.log('Could not assign PR owner.');
  }

  return pr.html_url;
}
