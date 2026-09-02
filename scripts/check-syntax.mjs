import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
function scriptsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? scriptsIn(path) : /\.(?:cjs|mjs|js)$/.test(entry.name) ? [path] : [];
  });
}
const files = ['server.js', 'public/app.js'].map(file => join(root, file));
for (const directory of ['lib', 'public/modules', 'scripts', 'test']) files.push(...scriptsIn(join(root, directory)));
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Syntax check failed: ${relative(root, file)}`);
}
console.log(`Syntax checked ${files.length} source files.`);
