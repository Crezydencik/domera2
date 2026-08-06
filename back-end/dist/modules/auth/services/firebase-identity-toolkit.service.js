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
exports.FirebaseIdentityToolkitService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let FirebaseIdentityToolkitService = class FirebaseIdentityToolkitService {
    constructor(configService) {
        this.configService = configService;
    }
    async call(endpoint, payload) {
        const apiKey = this.getFirebaseWebApiKey();
        if (!apiKey) {
            throw this.createServiceError('Firebase Web API key is missing in the backend environment. Set FIREBASE_WEB_API_KEY.', 500);
        }
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const json = (await response.json().catch(() => ({})));
        if (!response.ok) {
            const providerMessage = String(json.error?.message ?? '').toUpperCase();
            if (providerMessage.includes('INVALID_LOGIN_CREDENTIALS') ||
                providerMessage.includes('INVALID_PASSWORD')) {
                throw this.createServiceError('Incorrect email or password', 401);
            }
            if (providerMessage.includes('EMAIL_NOT_FOUND') || providerMessage.includes('USER_NOT_FOUND')) {
                throw this.createServiceError('User account was not found', 404);
            }
            if (providerMessage.includes('EMAIL_EXISTS')) {
                throw this.createServiceError('This email is already registered', 409);
            }
            if (providerMessage.includes('WEAK_PASSWORD') ||
                providerMessage.includes('INVALID_EMAIL') ||
                providerMessage.includes('MISSING_EMAIL') ||
                providerMessage.includes('MISSING_PASSWORD') ||
                providerMessage.includes('INVALID_OOB_CODE')) {
                throw this.createServiceError('Invalid authentication request', 400);
            }
            throw this.createServiceError('Firebase authentication request failed', 400);
        }
        return json;
    }
    getFirebaseWebApiKey() {
        return (this.configService.get('FIREBASE_WEB_API_KEY')?.trim() ||
            this.configService.get('NEXT_PUBLIC_FIREBASE_API_KEY')?.trim() ||
            '');
    }
    createServiceError(message, statusCode) {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    }
};
exports.FirebaseIdentityToolkitService = FirebaseIdentityToolkitService;
exports.FirebaseIdentityToolkitService = FirebaseIdentityToolkitService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FirebaseIdentityToolkitService);
