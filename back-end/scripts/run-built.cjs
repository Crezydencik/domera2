const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const entry = path.join(rootDir, 'dist', 'main.js');
const pidFile = path.join(rootDir, '.dev-server.pid');
const timeoutMs = 5000;
const intervalMs = 100;
const startedAt = Date.now();

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

  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    cwd: rootDir,
    env: process.env,
  });

  if (child.pid) {
    fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  }

  const shutdownChild = () => {
    try {
      if (child.pid) {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          process.kill(child.pid, 'SIGTERM');
        }
      }
    } catch {
      // child already exited
    }
    cleanupPidFile(child.pid);
  };

  process.on('SIGINT', shutdownChild);
  process.on('SIGTERM', shutdownChild);
  process.on('exit', () => cleanupPidFile(child.pid));

  child.on('exit', () => {
    cleanupPidFile(child.pid);
  });
}

function waitForEntry() {
  if (fs.existsSync(entry)) {
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
