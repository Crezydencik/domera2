import type { NextFunction, Request, Response } from 'express';
export declare function createCsrfOriginMiddleware(isAllowedOrigin: (origin: string) => boolean): (request: Request, response: Response, next: NextFunction) => void;
export declare function securityHeadersMiddleware(_request: Request, response: Response, next: NextFunction): void;
