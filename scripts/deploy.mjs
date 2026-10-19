import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const branch = process.argv[2] || 'master';
git('check-ref-format', '--branch', branch);
const ref = `refs/heads/${branch}`;
execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
const remote = git('ls-remote', '--heads', 'origin', ref);
let parent;
if (remote) {
  git('fetch', 'origin', ref);
  parent = git('rev-parse', 'FETCH_HEAD');
}
const temporary = mkdtempSync(join(tmpdir(), 'last-bullet-pages-'));
try {
  const site = join(temporary, 'site');
  mkdirSync(site);
  copyFileSync(join(root, 'dist/index.html'), join(site, 'index.html'));
  writeFileSync(join(site, '.nojekyll'), '');
  const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
  const repository = git('rev-parse', '--absolute-git-dir');
  const stagedGit = (...args) => execFileSync('git', [`--git-dir=${repository}`, `--work-tree=${site}`, ...args], { cwd: site, env, encoding: 'utf8' }).trim();
  if (parent) stagedGit('read-tree', parent);
  else stagedGit('read-tree', '--empty');
  // Keep any unrelated existing branch files, such as its .gitignore.
  stagedGit('add', '--', 'index.html', '.nojekyll');
  const tree = stagedGit('write-tree');
  const args = ['commit-tree', tree, '-m', 'Deploy Last Bullet Before Dawn to GitHub Pages'];
  if (parent) args.push('-p', parent);
  const commit = git(...args);
  // Never force-push: a concurrent deployment fails safely and can be retried.
  execFileSync('git', ['push', 'origin', `${commit}:${ref}`], { cwd: root, stdio: 'inherit' });
  console.log(`Uploaded ${branch}: ${commit}`);
  console.log(`Pages source: Settings → Pages → Deploy from a branch → ${branch} / (root).`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
