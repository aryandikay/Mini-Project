import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const options = { stdio: 'inherit', detached: !windows };
const children = [
  spawn(process.execPath, ['--watch', '--env-file-if-exists=../.env', 'src/index.js'], { ...options, cwd: `${root}/server` }),
  spawn(process.execPath, [`${root}/node_modules/vite/bin/vite.js`, '--host', '0.0.0.0'], { ...options, cwd: `${root}/client` }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    // Watch mode owns a child server; terminate the entire tree, not only its watcher.
    if (windows) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
    }
  }
  process.exitCode = code;
}
children.forEach(child => {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
