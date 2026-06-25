import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import { FirebaseAdminService } from './common/infrastructure/firebase/firebase-admin.service';
import { isPlatformAdminRole, resolveAccountType, resolveUserRole } from './common/auth/role.constants';
import { AppModule } from './app.module';

const SESSION_COOKIE_NAME = '__session';
const CHECK_REVOKED_TOKENS = process.env.FIREBASE_CHECK_REVOKED === 'true';

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set(
    (value ?? '')
      .split(',')
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean),
  );
  if (process.env.NODE_ENV !== 'production' && origins.size === 0) {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return origins;
}

function isAllowedRequestOrigin(origin: string | undefined, allowedOrigins: Set<string>) {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.has(normalizedOrigin)) return true;

  const backendUrl = process.env.BACKEND_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (backendUrl) {
    const normalizedBackendUrl = backendUrl.startsWith('http') ? backendUrl : `https://${backendUrl}`;
    if (normalizedOrigin === normalizeOrigin(normalizedBackendUrl)) return true;
  }

  return false;
}

function extractSwaggerToken(request: Request): { source: 'session' | 'bearer'; value: string } | null {
  const authHeader = request.get('authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
      return { source: 'bearer', value: token.trim() };
    }
  }

  const cookieHeader = request.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookie(cookieHeader);
    const session = cookies[SESSION_COOKIE_NAME];
    if (session?.trim()) {
      return { source: 'session', value: session.trim() };
    }
  }

  return null;
}

function isSwaggerHtmlRequest(request: Request): boolean {
  const path = request.originalUrl.split('?')[0] ?? '';
  return path === '/api/docs' || path === '/api/docs/';
}

function redirectToSwaggerLogin(request: Request, response: Response) {
  response.redirect(`/api/auth/docs-login?next=${encodeURIComponent(request.originalUrl || '/api/docs')}`);
}

function renderSwaggerUiPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Domera Backend API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #fff; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.addEventListener('load', () => {
      window.ui = SwaggerUIBundle({
        url: '/api/docs-json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        requestInterceptor: (request) => {
          request.credentials = 'include';
          return request;
        }
      });
    });
  </script>
</body>
</html>`;
}

function createSwaggerAdminAuth(firebaseAdminService: FirebaseAdminService) {
  return async function swaggerAdminAuth(request: Request, response: Response, next: NextFunction) {
    const token = extractSwaggerToken(request);
    if (!token) {
      if (isSwaggerHtmlRequest(request)) {
        redirectToSwaggerLogin(request, response);
        return;
      }

      response.status(401).send('Authentication required');
      return;
    }

    try {
      const decoded = token.source === 'session'
        ? await firebaseAdminService.auth.verifySessionCookie(token.value, CHECK_REVOKED_TOKENS)
        : await firebaseAdminService.auth.verifyIdToken(token.value, CHECK_REVOKED_TOKENS);

      let role = resolveUserRole({ role: decoded.role });
      let accountType = resolveAccountType({ role, accountType: decoded.accountType });

      if (!role || !accountType) {
        const userDoc = await firebaseAdminService.firestore.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data() as Record<string, unknown>;
          role = role ?? resolveUserRole({ role: userData.role, accountType: userData.accountType });
          accountType = accountType ?? resolveAccountType({
            role: userData.role,
            accountType: userData.accountType,
          });
        }
      }

      if (!isPlatformAdminRole(role)) {
        response.status(403).send('Platform administrator access required');
        return;
      }

      next();
    } catch {
      if (isSwaggerHtmlRequest(request)) {
        redirectToSwaggerLogin(request, response);
        return;
      }

      response.status(401).send('Invalid authentication token');
    }
  };
}

export async function createApp() {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS ?? process.env.FRONTEND_URL);
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin(origin, callback) {
        if (isAllowedRequestOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin is not allowed by CORS'), false);
      },
      credentials: true,
    },
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.SWAGGER_ENABLED !== 'false');
  if (swaggerEnabled) {
    app.use(
      ['/api/docs', '/api/docs-json', '/api/docs-yaml'],
      createSwaggerAdminAuth(app.get(FirebaseAdminService)),
    );

    const config = new DocumentBuilder()
      .setTitle('Domera Backend API')
      .setDescription('OpenAPI specification for Domera NestJS backend')
      .setVersion('1.0.0')
      .addCookieAuth('__session', {
        type: 'apiKey',
        in: 'cookie',
      })
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    const express = app.getHttpAdapter().getInstance() as {
      get: (path: string, handler: (_request: Request, response: Response) => void) => void;
    };
    express.get('/api/docs', (_request, response) => {
      response.type('html').send(renderSwaggerUiPage());
    });

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: process.env.SWAGGER_PERSIST_AUTHORIZATION === 'true',
      },
      customSiteTitle: 'Domera Backend API Docs',
      jsonDocumentUrl: '/api/docs-json',
      yamlDocumentUrl: '/api/docs-yaml',
    });
  }

  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
