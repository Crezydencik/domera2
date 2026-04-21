import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const backendRoot = path.join(repoRoot, 'back-end');
const frontendRoot = path.join(repoRoot, 'frontendd');
const outputPath = path.join(repoRoot, 'IMPLEMENTATION_STATUS.md');

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function read(targetPath) {
  return fs.readFileSync(targetPath, 'utf8');
}

function walk(dir, matcher, bucket = []) {
  if (!exists(dir)) return bucket;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, matcher, bucket);
      continue;
    }

    if (matcher(fullPath, entry.name)) {
      bucket.push(fullPath);
    }
  }

  return bucket;
}

function normalizeSegment(segment) {
  if (!segment) return '';
  if (segment.startsWith('(') && segment.endsWith(')')) return '';
  return segment;
}

function formatRouteFromPage(filePath) {
  const relative = path.relative(path.join(frontendRoot, 'src', 'app'), filePath);
  const withoutFile = relative.replace(/page\.tsx$/, '');
  const segments = withoutFile
    .split(path.sep)
    .map(normalizeSegment)
    .filter(Boolean);

  return '/' + segments.join('/');
}

function titleCase(value) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractApiSummary(line) {
  const match = line.match(/summary:\s*'([^']+)'/);
  return match ? match[1].trim() : '';
}

function extractEndpoints(controllerContent) {
  const lines = controllerContent.split(/\r?\n/);
  const endpoints = [];
  let pendingSummary = '';

  for (const line of lines) {
    if (line.includes('ApiOperation')) {
      pendingSummary = extractApiSummary(line);
      continue;
    }

    const routeMatch = line.match(/@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)/);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const route = routeMatch[2] ?? '';
      endpoints.push({
        method,
        route: route || '/',
        summary: pendingSummary || 'No summary provided',
      });
      pendingSummary = '';
    }
  }

  return endpoints;
}

function collectBackendStatus() {
  const modulesDir = path.join(backendRoot, 'src', 'modules');
  if (!exists(modulesDir)) return [];

  return fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const moduleDir = path.join(modulesDir, entry.name);
      const controllerPath = path.join(moduleDir, `${entry.name}.controller.ts`);
      const servicePath = path.join(moduleDir, `${entry.name}.service.ts`);

      const controllerContent = exists(controllerPath) ? read(controllerPath) : '';
      const controllerBaseMatch = controllerContent.match(/@Controller\('([^']+)'\)/);
      const controllerBase = controllerBaseMatch ? `/${controllerBaseMatch[1]}` : '—';

      return {
        name: entry.name,
        title: titleCase(entry.name),
        controllerBase,
        hasController: exists(controllerPath),
        hasService: exists(servicePath),
        endpoints: controllerContent ? extractEndpoints(controllerContent) : [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectFrontendStatus() {
  const appDir = path.join(frontendRoot, 'src', 'app');
  const componentsDir = path.join(frontendRoot, 'src', 'components');
  const messageFiles = path.join(frontendRoot, 'messages');

  const pages = walk(appDir, (_, name) => name === 'page.tsx')
    .map((filePath) => ({
      route: formatRouteFromPage(filePath),
      file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));

  const components = walk(componentsDir, (_, name) => name.endsWith('.tsx'))
    .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/'))
    .sort((a, b) => a.localeCompare(b));

  const locales = exists(messageFiles)
    ? fs.readdirSync(messageFiles).filter((name) => name.endsWith('.json')).sort()
    : [];

  return { pages, components, locales };
}

function buildReport() {
  const backendModules = collectBackendStatus();
  const frontendStatus = collectFrontendStatus();
  const timestamp = new Date().toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const backendSection = backendModules
    .map((module) => {
      const endpointLines = module.endpoints.length
        ? module.endpoints
            .map((endpoint) => `  - ${endpoint.method} ${module.controllerBase}${endpoint.route === '/' ? '' : `/${endpoint.route.replace(/^\//, '')}`} — ${endpoint.summary}`)
            .join('\n')
        : '  - Endpoints not found';

      return [
        `### ${module.title}`,
        `- Module folder: back-end/src/modules/${module.name}`,
        `- Controller: ${module.hasController ? 'yes' : 'no'}`,
        `- Service: ${module.hasService ? 'yes' : 'no'}`,
        `- Base route: ${module.controllerBase}`,
        `- Already implemented:`,
        endpointLines,
      ].join('\n');
    })
    .join('\n\n');

  const frontendPagesSection = frontendStatus.pages.length
    ? frontendStatus.pages.map((page) => `- ${page.route} → ${page.file}`).join('\n')
    : '- No page routes found';

  const componentsPreview = frontendStatus.components.length
    ? frontendStatus.components.slice(0, 25).map((component) => `- ${component}`).join('\n')
    : '- No shared components found';

  const localesSection = frontendStatus.locales.length
    ? frontendStatus.locales.map((locale) => `- ${locale}`).join('\n')
    : '- No locale files found';

  return `# Implementation Status Report

> This file is auto-generated. Do not edit it manually.
> Last updated: ${timestamp}
> Refresh command: node tools/generate-implementation-report.mjs

## What is already implemented

- Backend modules detected: ${backendModules.length}
- Frontend pages detected: ${frontendStatus.pages.length}
- Shared UI components detected: ${frontendStatus.components.length}
- Locale files detected: ${frontendStatus.locales.length}

## How it is implemented

### Backend
- Stack: NestJS + TypeScript
- Pattern: module -> controller -> service
- Location: back-end/src/modules and back-end/src/common
- Auth and infrastructure are separated into reusable shared files

### Frontend
- Stack: Next.js App Router + TypeScript
- Pattern: app routes + reusable components + i18n messages
- Location: frontendd/src/app, frontendd/src/components, frontendd/messages

## Backend implementation details

${backendSection || 'No backend modules found.'}

## Frontend routes already present

${frontendPagesSection}

## Shared components snapshot

${componentsPreview}

## Locales

${localesSection}
`;
}

const report = buildReport();
fs.writeFileSync(outputPath, report, 'utf8');
console.log(`Implementation report updated: ${outputPath}`);
