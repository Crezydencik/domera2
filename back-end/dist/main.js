"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
require("dotenv/config");
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const cookie_1 = require("cookie");
const firebase_admin_service_1 = require("./common/infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("./common/auth/role.constants");
const app_module_1 = require("./app.module");
const SESSION_COOKIE_NAME = '__session';
const CHECK_REVOKED_TOKENS = process.env.FIREBASE_CHECK_REVOKED === 'true';
function parseAllowedOrigins(value) {
    const origins = new Set((value ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean));
    if (process.env.NODE_ENV !== 'production' && origins.size === 0) {
        origins.add('http://localhost:3000');
        origins.add('http://127.0.0.1:3000');
    }
    return origins;
}
function isAllowedRequestOrigin(origin, allowedOrigins) {
    if (!origin)
        return true;
    if (allowedOrigins.has(origin))
        return true;
    const backendUrl = process.env.BACKEND_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (backendUrl) {
        const normalizedBackendUrl = backendUrl.startsWith('http') ? backendUrl : `https://${backendUrl}`;
        if (origin === normalizedBackendUrl.replace(/\/+$/, ''))
            return true;
    }
    return false;
}
function extractSwaggerToken(request) {
    const authHeader = request.get('authorization');
    if (authHeader) {
        const [scheme, token] = authHeader.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
            return { source: 'bearer', value: token.trim() };
        }
    }
    const cookieHeader = request.get('cookie');
    if (cookieHeader) {
        const cookies = (0, cookie_1.parse)(cookieHeader);
        const session = cookies[SESSION_COOKIE_NAME];
        if (session?.trim()) {
            return { source: 'session', value: session.trim() };
        }
    }
    return null;
}
function isSwaggerHtmlRequest(request) {
    const path = request.originalUrl.split('?')[0] ?? '';
    return path === '/api/docs' || path === '/api/docs/';
}
function redirectToSwaggerLogin(request, response) {
    response.redirect(`/api/auth/docs-login?next=${encodeURIComponent(request.originalUrl || '/api/docs')}`);
}
function renderSwaggerUiPage() {
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
function createSwaggerAdminAuth(firebaseAdminService) {
    return async function swaggerAdminAuth(request, response, next) {
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
            let role = (0, role_constants_1.resolveUserRole)({ role: decoded.role });
            let accountType = (0, role_constants_1.resolveAccountType)({ role, accountType: decoded.accountType });
            if (!role || !accountType) {
                const userDoc = await firebaseAdminService.firestore.collection('users').doc(decoded.uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    role = role ?? (0, role_constants_1.resolveUserRole)({ role: userData.role, accountType: userData.accountType });
                    accountType = accountType ?? (0, role_constants_1.resolveAccountType)({
                        role: userData.role,
                        accountType: userData.accountType,
                    });
                }
            }
            if (!(0, role_constants_1.isPlatformAdminRole)(role)) {
                response.status(403).send('Platform administrator access required');
                return;
            }
            next();
        }
        catch {
            if (isSwaggerHtmlRequest(request)) {
                redirectToSwaggerLogin(request, response);
                return;
            }
            response.status(401).send('Invalid authentication token');
        }
    };
}
async function createApp() {
    const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS ?? process.env.FRONTEND_URL);
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
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
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidUnknownValues: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true' ||
        (process.env.NODE_ENV !== 'production' && process.env.SWAGGER_ENABLED !== 'false');
    if (swaggerEnabled) {
        app.use(['/api/docs', '/api/docs-json', '/api/docs-yaml'], createSwaggerAdminAuth(app.get(firebase_admin_service_1.FirebaseAdminService)));
        const config = new swagger_1.DocumentBuilder()
            .setTitle('Domera Backend API')
            .setDescription('OpenAPI specification for Domera NestJS backend')
            .setVersion('1.0.0')
            .addCookieAuth('__session', {
            type: 'apiKey',
            in: 'cookie',
        })
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        const express = app.getHttpAdapter().getInstance();
        express.get('/api/docs', (_request, response) => {
            response.type('html').send(renderSwaggerUiPage());
        });
        swagger_1.SwaggerModule.setup('api/docs', app, document, {
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
