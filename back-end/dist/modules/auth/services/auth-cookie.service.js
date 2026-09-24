"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthCookieService = void 0;
const common_1 = require("@nestjs/common");
const auth_constants_1 = require("../constants/auth.constants");
let AuthCookieService = class AuthCookieService {
    applySessionCookies(response, session) {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: session.maxAgeSeconds * 1000,
            path: '/',
        };
        response.cookie(auth_constants_1.SESSION_COOKIE_NAME, session.cookie, cookieOptions);
        this.clearLegacyAuthCookies(response);
    }
    clearAuthCookies(response) {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/',
        };
        response.clearCookie(auth_constants_1.SESSION_COOKIE_NAME, cookieOptions);
        response.clearCookie(auth_constants_1.SESSION_COOKIE_NAME, { path: '/' });
        this.clearLegacyAuthCookies(response);
    }
    clearLegacyAuthCookies(response) {
        for (const name of auth_constants_1.LEGACY_AUTH_COOKIE_NAMES) {
            response.clearCookie(name, { path: '/' });
        }
    }
};
exports.AuthCookieService = AuthCookieService;
exports.AuthCookieService = AuthCookieService = __decorate([
    (0, common_1.Injectable)()
], AuthCookieService);
