import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chupne-ghpages-'));

const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('Building...');
run('bun run build');

console.log('Preparing gh-pages worktree...');
run(`git worktree add "${tmp}" gh-pages`);

try {
  for (const entry of fs.readdirSync(tmp)) {
    if (entry !== '.git') {
      fs.rmSync(path.join(tmp, entry), { recursive: true, force: true });
    }
  }
  fs.cpSync(dist, tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, '.nojekyll'), '');

  run('git add -A', tmp);
  run('git commit -m "Deploy dist to GitHub Pages"', tmp);
  run('git push origin gh-pages', tmp);
} finally {
  run(`git worktree remove --force "${tmp}"`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Deployed to gh-pages branch.');
