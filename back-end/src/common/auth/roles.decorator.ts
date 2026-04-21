import { SetMetadata } from '@nestjs/common';
import { RequestUser } from './request-user.type';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: NonNullable<RequestUser['role']>[]) =>
  SetMetadata(ROLES_KEY, roles);
