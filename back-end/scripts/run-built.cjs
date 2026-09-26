const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const entry = path.join(rootDir, 'dist', 'main.js');
const requiredFiles = [
  entry,
  path.join(rootDir, 'dist', 'common', 'infrastructure', 'firebase', 'firebase-admin.service.js'),
];
const pidFile = path.join(rootDir, '.dev-server.pid');
const timeoutMs = 5000;
const intervalMs = 100;
const restartDelayMs = Number(process.env.DEV_SERVER_RESTART_DELAY_MS || 1000);
const startedAt = Date.now();
let child = null;
let shuttingDown = false;

function cleanupPidFile(pid) {
  try {
    if (!fs.existsSync(pidFile)) return;
    const current = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (!Number.isFinite(current) || (pid && current === pid)) {
      fs.rmSync(pidFile, { force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

function stopPreviousServer() {
  try {
    if (!fs.existsSync(pidFile)) return;
    const previousPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (!Number.isFinite(previousPid) || previousPid === process.pid) {
      cleanupPidFile();
      return;
    }

    try {
      process.kill(previousPid, 0);
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(previousPid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(previousPid, 'SIGTERM');
      }
    } catch {
      // process is already gone
    }

    cleanupPidFile(previousPid);
  } catch {
    // ignore stale pid file errors
  }
}

function start() {
  stopPreviousServer();

  child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    cwd: rootDir,
    env: process.env,
  });

  if (child.pid) {
    fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  }

  child.on('exit', (code, signal) => {
    const childPid = child && child.pid;
    cleanupPidFile(childPid);

    if (shuttingDown) return;

    console.error(
      `Backend process exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}. Restarting...`,
    );
    setTimeout(start, Math.max(250, restartDelayMs));
  });
}

function shutdownChild() {
  shuttingDown = true;
  try {
    if (child && child.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(child.pid, 'SIGTERM');
      }
    }
  } catch {
    // child already exited
  }
  cleanupPidFile(child && child.pid);
}

process.on('SIGINT', shutdownChild);
process.on('SIGTERM', shutdownChild);
process.on('exit', () => cleanupPidFile(child && child.pid));

function waitForEntry() {
  if (requiredFiles.every((file) => fs.existsSync(file))) {
    start();
    return;
  }

  if (Date.now() - startedAt >= timeoutMs) {
    console.error(`Timed out waiting for built entry: ${entry}`);
    process.exit(1);
  }

  setTimeout(waitForEntry, intervalMs);
}

waitForEntry();
