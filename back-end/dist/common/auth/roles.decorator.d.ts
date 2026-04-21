import { RequestUser } from './request-user.type';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: NonNullable<RequestUser["role"]>[]) => import("@nestjs/common").CustomDecorator<string>;
