import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    // Skip CSRF check if no cookies are present (not a cookie-auth request)
    if (!req.cookies?.access_token && !req.cookies?.refresh_token) {
      return next();
    }

    const origin = req.headers.origin;
    const allowedOrigin = process.env.WEB_URL || 'http://localhost:3000';

    if (!origin) {
      // Allow requests with no Origin header (e.g., same-origin, server-to-server)
      // SameSite=Lax cookies already prevent cross-site POST from third-party sites
      return next();
    }

    if (origin !== allowedOrigin) {
      throw new ForbiddenException('CSRF validation failed');
    }

    next();
  }
}
