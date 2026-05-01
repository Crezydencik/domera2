"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const cookie_1 = require("cookie");
const firebase_admin_service_1 = require("../infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("./role.constants");
const SESSION_COOKIE_NAME = '__session';
const toOptionalString = (value) => {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};
let FirebaseAuthGuard = class FirebaseAuthGuard {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async canActivate(context) {
        const request = context
            .switchToHttp()
            .getRequest();
        const token = this.extractToken(request.headers);
        if (!token) {
            throw new common_1.UnauthorizedException('Authentication required');
        }
        try {
            const decoded = token.source === 'session'
                ? await this.firebaseAdminService.auth.verifySessionCookie(token.value, true)
                : await this.firebaseAdminService.auth.verifyIdToken(token.value, true);
            let role = (0, role_constants_1.resolveUserRole)({ role: decoded.role });
            let accountType = (0, role_constants_1.resolveAccountType)({ role, accountType: decoded.accountType });
            let companyId = toOptionalString(decoded.companyId);
            let apartmentId = toOptionalString(decoded.apartmentId);
            if (!role || !accountType || !companyId || !apartmentId) {
                try {
                    const userDoc = await this.firebaseAdminService.firestore.collection('users').doc(decoded.uid).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        role = role ?? (0, role_constants_1.resolveUserRole)({ role: userData.role, accountType: userData.accountType });
                        accountType = accountType ?? (0, role_constants_1.resolveAccountType)({
                            role: userData.role,
                            accountType: userData.accountType,
                        });
                        companyId = companyId ?? toOptionalString(userData.companyId);
                        apartmentId = apartmentId ?? toOptionalString(userData.apartmentId);
                    }
                }
                catch {
                }
            }
            request.user = {
                uid: decoded.uid,
                email: decoded.email,
                role,
                accountType,
                companyId,
                apartmentId,
            };
            return true;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid authentication token');
        }
    }
    extractToken(headers) {
        const authHeader = headers.authorization;
        if (authHeader) {
            const [scheme, token] = authHeader.split(' ');
            if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
                return { source: 'bearer', value: token.trim() };
            }
        }
        const cookieHeader = headers.cookie;
        if (cookieHeader) {
            const cookies = (0, cookie_1.parse)(cookieHeader);
            const session = cookies[SESSION_COOKIE_NAME];
            if (session?.trim()) {
                return { source: 'session', value: session.trim() };
            }
        }
        return null;
    }
};
exports.FirebaseAuthGuard = FirebaseAuthGuard;
exports.FirebaseAuthGuard = FirebaseAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], FirebaseAuthGuard);
