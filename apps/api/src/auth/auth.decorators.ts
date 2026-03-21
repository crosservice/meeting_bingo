import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.guard';

export interface AuthenticatedUser {
  id: string;
  nickname: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
