import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users';
import { CurrentUser, Public, AuthenticatedUser } from './auth.decorators';
import { registerSchema, loginSchema } from '@meeting-bingo/validation';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const user = await this.authService.register(parsed.data.nickname, parsed.data.password);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const { user, tokens } = await this.authService.login(
      parsed.data.nickname,
      parsed.data.password,
    );

    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new BadRequestException('No refresh token provided');
    }

    const tokens = await this.authService.refresh(refreshToken);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    return { message: 'Tokens refreshed' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    await this.authService.logout(refreshToken, user.id);

    res.clearCookie('access_token', COOKIE_OPTIONS);
    res.clearCookie('refresh_token', COOKIE_OPTIONS);

    return { message: 'Logged out' };
  }

  @Get('me')
  @SkipThrottle()
  async me(@CurrentUser() user: AuthenticatedUser) {
    // Return full user from DB (includes theme preference)
    const fullUser = await this.usersService.findById(user.id);
    return { user: fullUser ?? user };
  }

  @Patch('me')
  @SkipThrottle()
  async updateMe(
    @Body() body: { theme?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (body.theme) {
      if (!['light', 'dark'].includes(body.theme)) {
        throw new BadRequestException('Theme must be "light" or "dark"');
      }
      await this.usersService.updateTheme(user.id, body.theme);
    }
    const fullUser = await this.usersService.findById(user.id);
    return { user: fullUser };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  async changePassword(
    @Body() body: { current_password?: string; new_password?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.current_password || !body.new_password) {
      throw new BadRequestException('current_password and new_password are required');
    }

    if (body.new_password.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const userRow = await this.usersService.findByIdWithHash(user.id);
    if (!userRow) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await argon2.verify(userRow.password_hash, body.current_password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await argon2.hash(body.new_password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await this.usersService.updatePassword(user.id, newHash);

    return { message: 'Password changed successfully' };
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async deleteMe(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.usersService.softDelete(user.id);
    await this.authService.revokeAllSessions(user.id);

    res.clearCookie('access_token', COOKIE_OPTIONS);
    res.clearCookie('refresh_token', COOKIE_OPTIONS);

    return { message: 'Account deleted' };
  }

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}
