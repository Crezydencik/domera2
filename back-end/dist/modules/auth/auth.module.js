"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const users_module_1 = require("../users/users.module");
const auth_catalog_controller_1 = require("./controllers/auth-catalog.controller");
const auth_docs_controller_1 = require("./controllers/auth-docs.controller");
const auth_login_registration_controller_1 = require("./controllers/auth-login-registration.controller");
const auth_password_reset_controller_1 = require("./controllers/auth-password-reset.controller");
const auth_profile_security_controller_1 = require("./controllers/auth-profile-security.controller");
const auth_session_controller_1 = require("./controllers/auth-session.controller");
const auth_cookie_service_1 = require("./services/auth-cookie.service");
const auth_docs_login_page_service_1 = require("./services/auth-docs-login-page.service");
const auth_email_service_1 = require("./services/auth-email.service");
const auth_exception_mapper_service_1 = require("./services/auth-exception-mapper.service");
const auth_password_reset_service_1 = require("./services/auth-password-reset.service");
const auth_profile_provisioning_service_1 = require("./services/auth-profile-provisioning.service");
const auth_session_service_1 = require("./services/auth-session.service");
const firebase_identity_toolkit_service_1 = require("./services/firebase-identity-toolkit.service");
const registration_code_service_1 = require("./services/registration-code.service");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [users_module_1.UsersModule],
        controllers: [
            auth_catalog_controller_1.AuthCatalogController,
            auth_docs_controller_1.AuthDocsController,
            auth_session_controller_1.AuthSessionController,
            auth_login_registration_controller_1.AuthLoginRegistrationController,
            auth_profile_security_controller_1.AuthProfileSecurityController,
            auth_password_reset_controller_1.AuthPasswordResetController,
        ],
        providers: [
            auth_service_1.AuthService,
            auth_cookie_service_1.AuthCookieService,
            auth_docs_login_page_service_1.AuthDocsLoginPageService,
            auth_email_service_1.AuthEmailService,
            auth_exception_mapper_service_1.AuthExceptionMapperService,
            auth_password_reset_service_1.AuthPasswordResetService,
            auth_profile_provisioning_service_1.AuthProfileProvisioningService,
            auth_session_service_1.AuthSessionService,
            firebase_identity_toolkit_service_1.FirebaseIdentityToolkitService,
            registration_code_service_1.RegistrationCodeService,
        ],
        exports: [auth_service_1.AuthService],
    })
], AuthModule);
