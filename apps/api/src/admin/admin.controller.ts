import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SuperUserGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller('admin')
@UseGuards(SuperUserGuard)
@SkipThrottle()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers() {
    const users = await this.adminService.listUsers();
    return { users };
  }

  @Get('users/:userId')
  async getUserDetail(@Param('userId') userId: string) {
    const user = await this.adminService.getUserDetail(userId);
    return { user };
  }

  @Post('users/:userId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendUser(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.adminService.suspendUser(userId, actor.id);
    return { message: 'User suspended' };
  }

  @Post('users/:userId/restore')
  @HttpCode(HttpStatus.OK)
  async restoreUser(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.adminService.restoreUser(userId, actor.id);
    return { message: 'User restored' };
  }
}
