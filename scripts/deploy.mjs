import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
const remote = git('ls-remote', '--heads', 'origin', 'refs/heads/gh-pages');
let parent;
if (remote) {
  git('fetch', 'origin', 'refs/heads/gh-pages');
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
  stagedGit('read-tree', '--empty');
  stagedGit('add', '--all');
  const tree = stagedGit('write-tree');
  const args = ['commit-tree', tree, '-m', 'Deploy Last Bullet Before Dawn to GitHub Pages'];
  if (parent) args.push('-p', parent);
  const commit = git(...args);
  // Never force-push: a concurrent deployment fails safely and can be retried.
  execFileSync('git', ['push', 'origin', `${commit}:refs/heads/gh-pages`], { cwd: root, stdio: 'inherit' });
  console.log(`Uploaded gh-pages: ${commit}`);
  console.log('Pages source: Settings → Pages → Deploy from a branch → gh-pages / (root).');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
