import type { NextFunction, Request, Response } from 'express';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SESSION_COOKIE_NAME = '__session';

const header = (request: Request, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * CSRF protection for cookie-authenticated requests.
 *
 * In production the session cookie is `SameSite=None` unless SESSION_COOKIE_DOMAIN is set, so a
 * browser attaches it to requests started by ANY site. CORS does not stop such requests from
 * executing (it only hides the response), e.g. a cross-site `multipart/form-data` POST to an
 * upload endpoint. Browsers always send `Origin` on cross-origin POST/PUT/PATCH/DELETE, so:
 *  - unsafe method + session cookie + Origin not allowed (or "null") → 403;
 *  - no Origin: fall back to Referer when present; requests with neither are non-browser clients;
 *  - Bearer / API-key requests are not cookie-authenticated and are not affected.
 */
export function createCsrfOriginMiddleware(isAllowedOrigin: (origin: string) => boolean) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return next();

    const cookieHeader = header(request, 'cookie') ?? '';
    const usesSessionCookie = cookieHeader.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
    const authorization = header(request, 'authorization') ?? '';
    const usesExplicitCredential = /^bearer\s+\S/i.test(authorization) || /^api-?key\s+\S/i.test(authorization) || Boolean(header(request, 'x-api-key'));
    if (!usesSessionCookie || usesExplicitCredential) return next();

    const origin = header(request, 'origin');
    if (origin !== undefined) {
      if (origin === 'null' || !isAllowedOrigin(origin)) return reject(response);
      return next();
    }

    const referer = header(request, 'referer');
    if (referer) {
      let refererOrigin: string;
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        return reject(response);
      }
      if (!isAllowedOrigin(refererOrigin)) return reject(response);
    }

    return next();
  };
}

function reject(response: Response) {
  response.status(403).json({ statusCode: 403, message: 'Cross-site request blocked' });
}

/** Baseline response headers (safe for an API that also serves PDFs to a cross-origin frontend). */
export function securityHeadersMiddleware(_request: Request, response: Response, next: NextFunction) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.removeHeader('X-Powered-By');
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
