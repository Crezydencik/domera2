import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './request-user.type';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return request.user;
  },
);
