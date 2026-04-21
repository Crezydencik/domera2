"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        cors: {
            origin: true,
            credentials: true,
        },
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidUnknownValues: false,
        transform: true,
    }));
    const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
    if (swaggerEnabled) {
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
        swagger_1.SwaggerModule.setup('api/docs', app, document, {
            swaggerOptions: {
                persistAuthorization: true,
            },
            customSiteTitle: 'Domera Backend API Docs',
            jsonDocumentUrl: '/api/docs-json',
            yamlDocumentUrl: '/api/docs-yaml',
        });
    }
    const port = Number(process.env.PORT ?? 4000);
    await app.listen(port);
}
void bootstrap();
