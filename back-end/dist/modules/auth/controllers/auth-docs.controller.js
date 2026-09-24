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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthDocsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const role_constants_1 = require("../../../common/auth/role.constants");
const auth_service_1 = require("../auth.service");
const auth_cookie_service_1 = require("../services/auth-cookie.service");
const auth_docs_login_page_service_1 = require("../services/auth-docs-login-page.service");
let AuthDocsController = class AuthDocsController {
    constructor(authService, authCookieService, docsLoginPageService) {
        this.authService = authService;
        this.authCookieService = authCookieService;
        this.docsLoginPageService = docsLoginPageService;
    }
    docsLoginForm(request, response) {
        const next = this.docsLoginPageService.safeDocsNext(request.query.next);
        response.type('html').send(this.docsLoginPageService.render({ next }));
    }
    async docsLogin(request, body, response) {
        const next = this.docsLoginPageService.safeDocsNext(body.next);
        try {
            const result = await this.authService.loginWithEmailPassword(request, {
                email: body.email ?? '',
                password: body.password ?? '',
                rememberMe: true,
            });
            if (!(0, role_constants_1.isPlatformAdminRole)(result.session.role)) {
                this.authCookieService.clearAuthCookies(response);
                response.status(common_1.HttpStatus.FORBIDDEN).type('html').send(this.docsLoginPageService.render({
                    next,
                    error: 'Platform administrator access required.',
                }));
                return;
            }
            this.authCookieService.applySessionCookies(response, result.session);
            response.redirect(next);
        }
        catch {
            response.status(common_1.HttpStatus.UNAUTHORIZED).type('html').send(this.docsLoginPageService.render({
                next,
                error: 'Invalid email or password.',
            }));
        }
    }
};
exports.AuthDocsController = AuthDocsController;
__decorate([
    (0, common_1.Get)('docs-login'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthDocsController.prototype, "docsLoginForm", null);
__decorate([
    (0, common_1.Post)('docs-login'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthDocsController.prototype, "docsLogin", null);
exports.AuthDocsController = AuthDocsController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_cookie_service_1.AuthCookieService,
        auth_docs_login_page_service_1.AuthDocsLoginPageService])
], AuthDocsController);
