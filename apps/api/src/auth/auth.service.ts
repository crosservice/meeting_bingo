import { Injectable, Inject, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { DATABASE_POOL } from '../database';
import { UsersService } from '../users';
import {
  ACCESS_TOKEN_EXPIRY_MINUTES,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from '@meeting-bingo/config';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtPayload {
  sub: string;
  nickname: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
  }

  async register(nickname: string, password: string) {
    // Check if nickname already exists
    const existing = await this.usersService.findByNickname(nickname);
    if (existing) {
      throw new ConflictException('Nickname is already taken');
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.usersService.create(nickname, passwordHash);

    await this.logAudit(user.id, 'user', user.id, 'register');

    return user;
  }

  async login(nickname: string, password: string, ip?: string): Promise<{ user: typeof user; tokens: TokenPair }> {
    // Generic error to prevent user enumeration
    const genericError = new UnauthorizedException('Invalid nickname or password');

    const userRow = await this.usersService.findByNickname(nickname);
    if (!userRow) {
      // Perform a dummy hash to prevent timing attacks
      await argon2.hash('dummy-password', { type: argon2.argon2id });
      throw genericError;
    }

    if (userRow.status === 'suspended') {
      await this.logAudit(userRow.id, 'user', userRow.id, 'login_failed');
      throw new UnauthorizedException('Account is suspended');
    }

    const valid = await argon2.verify(userRow.password_hash, password);
    if (!valid) {
      await this.logAudit(userRow.id, 'user', userRow.id, 'login_failed');
      throw genericError;
    }

    await this.usersService.updateLastLogin(userRow.id, ip);

    const tokens = await this.generateTokens({
      sub: userRow.id,
      nickname: userRow.nickname,
      role: userRow.role || 'user',
    });

    await this.storeRefreshToken(userRow.id, tokens.refreshToken);

    const user = await this.usersService.findById(userRow.id);
    await this.logAudit(userRow.id, 'user', userRow.id, 'login');

    return { user: user!, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);

    const { rows } = await this.pool.query(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );

    if (rows.length === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const storedToken = rows[0];

    // Revoke the old refresh token (rotation)
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [storedToken.id],
    );

    // Verify user still exists and is active
    const user = await this.usersService.findById(storedToken.user_id);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Account is no longer active');
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      nickname: user.nickname,
      role: user.role || 'user',
    });

    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
        [tokenHash],
      );
    }

    await this.logAudit(userId, 'user', userId, 'logout');
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token, {
      secret: this.jwtSecret,
    });
  }

  private async generateTokens(payload: JwtPayload): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: `${ACCESS_TOKEN_EXPIRY_MINUTES}m`,
    });

    const refreshToken = crypto.randomBytes(32).toString('base64url');

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt.toISOString()],
    );
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async logAudit(
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (actor_user_id, entity_type, entity_id, action, metadata_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, entityType, entityId, action, metadata ? JSON.stringify(metadata) : null],
    );
  }
}
