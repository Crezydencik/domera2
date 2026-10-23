/**
 * Запуск бэкенда и фронтенда одной командой.
 *
 *   npm run dev    → back-end (:4000) + frontendd   (:3000)
 *   npm run dev2   → back-end (:4000) + frontend-v2 (:3002)
 *   npm run prod2  → то же, но frontend-v2 собирается и запускается как в продакшене:
 *                    страницы не компилируются при первом открытии, вход и переходы быстрые.
 *
 * Перед стартом:
 *   - если нет node_modules — ставит зависимости (npm install);
 *   - для frontend-v2: если нет .env.local, копирует его из frontendd/.env (ключи Firebase для входа через Google);
 *   - для frontend-v2: удаляет файлы, оставшиеся от прошлых версий каркаса (npm run cleanup:stale).
 * Ctrl+C останавливает оба процесса.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = process.argv[2] || 'frontendd';
const prodMode = process.argv.includes('--prod');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const TARGETS = {
  backend: { name: 'backend', dir: 'back-end', script: 'start:dev', color: '\x1b[35m' },
  frontend: { name: frontendDir, dir: frontendDir, script: prodMode ? 'start' : 'dev', color: '\x1b[36m' },
};

function log(message) {
  console.log(`\x1b[1m[dev]\x1b[0m ${message}`);
}

function ensureInstalled(target) {
  const cwd = path.join(rootDir, target.dir);
  if (!fs.existsSync(cwd)) {
    console.error(`[dev] Папка ${target.dir} не найдена.`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    log(`${target.dir}: нет node_modules — ставлю зависимости (npm install)…`);
    const result = spawnSync(npm, ['install'], { cwd, stdio: 'inherit', shell: isWindows });
    if (result.status !== 0) {
      console.error(`[dev] npm install в ${target.dir} завершился с ошибкой.`);
      process.exit(result.status || 1);
    }
  }
}

function prepareFrontendV2() {
  const cwd = path.join(rootDir, frontendDir);
  const envLocal = path.join(cwd, '.env.local');
  const legacyEnv = path.join(rootDir, 'frontendd', '.env');
  if (!fs.existsSync(envLocal) && fs.existsSync(legacyEnv)) {
    fs.copyFileSync(legacyEnv, envLocal);
    log(`${frontendDir}: создан .env.local из frontendd/.env`);
  }
  const cleanup = path.join(cwd, 'scripts', 'remove-stale-files.mjs');
  if (fs.existsSync(cleanup)) {
    spawnSync(process.execPath, [cleanup], { cwd, stdio: 'inherit' });
  }
}

/** Выводит строки процесса с цветным префиксом, чтобы логи двух серверов не путались. */
function pipeWithPrefix(stream, target, out) {
  const prefix = `${target.color}[${target.name}]\x1b[0m `;
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) out.write(prefix + line + '\n');
  });
  stream.on('end', () => {
    if (buffer) out.write(prefix + buffer + '\n');
  });
}

function run(target) {
  const child = spawn(npm, ['run', target.script], {
    cwd: path.join(rootDir, target.dir),
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    // своя группа процессов (кроме Windows), чтобы при остановке погасить и внуков (npm → node)
    detached: !isWindows,
  });
  pipeWithPrefix(child.stdout, target, process.stdout);
  pipeWithPrefix(child.stderr, target, process.stderr);
  child.on('exit', (code) => {
    if (code && code !== 0 && !stopping) console.error(`\n[${target.name}] завершился с кодом ${code}`);
  });
  return child;
}

let stopping = false;
const children = [];

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows) {
    // на Windows npm запускает дочерние процессы — гасим всё дерево
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGINT');
    } catch {
      child.kill('SIGINT');
    }
  }
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  log('останавливаю…');
  children.forEach(killTree);
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

ensureInstalled(TARGETS.backend);
ensureInstalled(TARGETS.frontend);
if (frontendDir !== 'frontendd') prepareFrontendV2();
if (prodMode) {
  log(`${frontendDir}: сборка для продакшена (npm run build)… это 1–2 минуты`);
  const built = spawnSync(npm, ['run', 'build'], { cwd: path.join(rootDir, frontendDir), stdio: 'inherit', shell: isWindows });
  if (built.status !== 0) {
    console.error(`[dev] сборка ${frontendDir} завершилась с ошибкой.`);
    process.exit(built.status || 1);
  }
}

const port = frontendDir === 'frontend-v2' ? 3002 : 3000;
log(`бэкенд → http://localhost:4000/api (Swagger: /api/docs)`);
log(`${frontendDir} → http://localhost:${port}`);

children.push(run(TARGETS.backend), run(TARGETS.frontend));
