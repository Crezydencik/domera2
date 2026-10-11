"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PerformanceMetricsInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMetricsInterceptor = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const PERFORMANCE_LOGS_ENABLED = process.env.PERFORMANCE_LOGS_ENABLED === 'true';
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
let PerformanceMetricsInterceptor = PerformanceMetricsInterceptor_1 = class PerformanceMetricsInterceptor {
    constructor() {
        this.logger = new common_1.Logger(PerformanceMetricsInterceptor_1.name);
    }
    intercept(context, next) {
        const http = context.switchToHttp();
        const request = http.getRequest();
        const response = http.getResponse();
        const startedAt = performance.now();
        const requestedId = request.header('x-request-id')?.trim();
        const requestId = requestedId && REQUEST_ID_PATTERN.test(requestedId) ? requestedId : (0, node_crypto_1.randomUUID)();
        response.setHeader('x-request-id', requestId);
        return next.handle().pipe((0, rxjs_1.tap)({
            next: () => {
                const durationMs = Number((performance.now() - startedAt).toFixed(1));
                response.setHeader('Server-Timing', `app;dur=${durationMs}`);
                if (!PERFORMANCE_LOGS_ENABLED)
                    return;
                const contentLength = response.getHeader('content-length');
                this.logger.log(JSON.stringify({
                    event: 'http_request_completed',
                    requestId,
                    method: request.method,
                    route: request.route?.path ?? request.path,
                    statusCode: response.statusCode,
                    durationMs,
                    responseBytes: typeof contentLength === 'string' || typeof contentLength === 'number'
                        ? Number(contentLength)
                        : undefined,
                }));
            },
            error: () => {
                const durationMs = Number((performance.now() - startedAt).toFixed(1));
                if (!PERFORMANCE_LOGS_ENABLED)
                    return;
                this.logger.warn(JSON.stringify({
                    event: 'http_request_failed',
                    requestId,
                    method: request.method,
                    route: request.route?.path ?? request.path,
                    statusCode: response.statusCode,
                    durationMs,
                }));
            },
        }));
    }
};
exports.PerformanceMetricsInterceptor = PerformanceMetricsInterceptor;
exports.PerformanceMetricsInterceptor = PerformanceMetricsInterceptor = PerformanceMetricsInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], PerformanceMetricsInterceptor);
