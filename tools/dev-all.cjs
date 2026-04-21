const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function run(name, cwd, command, args) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`\n[${name}] exited with code ${code}`);
    }
  });

  return child;
}

const backend = run('backend', path.join(rootDir, 'back-end'), 'npm', ['run', 'start:dev']);
const frontend = run('frontend', path.join(rootDir, 'frontendd'), 'npm', ['run', 'dev']);

function shutdown() {
  for (const proc of [backend, frontend]) {
    if (proc && !proc.killed) {
      proc.kill('SIGINT');
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
