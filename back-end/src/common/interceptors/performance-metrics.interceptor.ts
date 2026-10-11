import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

const PERFORMANCE_LOGS_ENABLED = process.env.PERFORMANCE_LOGS_ENABLED === 'true';
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

@Injectable()
export class PerformanceMetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceMetricsInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    const requestedId = request.header('x-request-id')?.trim();
    const requestId = requestedId && REQUEST_ID_PATTERN.test(requestedId) ? requestedId : randomUUID();

    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Number((performance.now() - startedAt).toFixed(1));
          response.setHeader('Server-Timing', `app;dur=${durationMs}`);

          if (!PERFORMANCE_LOGS_ENABLED) return;

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
          if (!PERFORMANCE_LOGS_ENABLED) return;

          this.logger.warn(JSON.stringify({
            event: 'http_request_failed',
            requestId,
            method: request.method,
            route: request.route?.path ?? request.path,
            statusCode: response.statusCode,
            durationMs,
          }));
        },
      }),
    );
  }
}
