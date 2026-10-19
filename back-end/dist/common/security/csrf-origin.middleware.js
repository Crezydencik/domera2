"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCsrfOriginMiddleware = createCsrfOriginMiddleware;
exports.securityHeadersMiddleware = securityHeadersMiddleware;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SESSION_COOKIE_NAME = '__session';
const header = (request, name) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
};
function createCsrfOriginMiddleware(isAllowedOrigin) {
    return (request, response, next) => {
        if (!UNSAFE_METHODS.has(request.method.toUpperCase()))
            return next();
        const cookieHeader = header(request, 'cookie') ?? '';
        const usesSessionCookie = cookieHeader.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
        const authorization = header(request, 'authorization') ?? '';
        const usesExplicitCredential = /^bearer\s+\S/i.test(authorization) || /^api-?key\s+\S/i.test(authorization) || Boolean(header(request, 'x-api-key'));
        if (!usesSessionCookie || usesExplicitCredential)
            return next();
        const origin = header(request, 'origin');
        if (origin !== undefined) {
            if (origin === 'null' || !isAllowedOrigin(origin))
                return reject(response);
            return next();
        }
        const referer = header(request, 'referer');
        if (referer) {
            let refererOrigin;
            try {
                refererOrigin = new URL(referer).origin;
            }
            catch {
                return reject(response);
            }
            if (!isAllowedOrigin(refererOrigin))
                return reject(response);
        }
        return next();
    };
}
function reject(response) {
    response.status(403).json({ statusCode: 403, message: 'Cross-site request blocked' });
}
function securityHeadersMiddleware(_request, response, next) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.removeHeader('X-Powered-By');
    if (process.env.NODE_ENV === 'production') {
        response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}
