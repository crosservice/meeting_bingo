import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ExportsService } from './exports.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller()
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('meetings/:meetingId/exports')
  async create(
    @Param('meetingId') meetingId: string,
    @Body() body: { export_type?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const exportType = body.export_type || 'json';
    if (!['json', 'csv', 'zip'].includes(exportType)) {
      throw new BadRequestException('Invalid export type. Must be json, csv, or zip.');
    }
    const job = await this.exportsService.createExport(meetingId, user.id, exportType);
    return { export_job: job };
  }

  @Get('exports/:exportId')
  async getStatus(
    @Param('exportId') exportId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const job = await this.exportsService.getExport(exportId, user.id);
    return { export_job: job };
  }

  @Get('exports/:exportId/download')
  async download(
    @Param('exportId') exportId: string,
    @Res() res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { filePath, fileName } = await this.exportsService.getExportFile(exportId, user.id);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(filePath);
  }

  @Get('meetings/:meetingId/exports')
  async list(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const jobs = await this.exportsService.listExports(meetingId, user.id);
    return { export_jobs: jobs };
  }
}
