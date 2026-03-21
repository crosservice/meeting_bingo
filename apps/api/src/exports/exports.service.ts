import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ExportsRepository, ExportJobRow } from './exports.repository';
import { MeetingsService } from '../meetings';
import { AuditService } from '../common';

function toJobResponse(row: ExportJobRow) {
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    export_type: row.export_type,
    status: row.status,
    file_path: row.status === 'completed' ? `/exports/${row.id}/download` : null,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    completed_at: row.completed_at?.toISOString() ?? null,
    failed_at: row.failed_at?.toISOString() ?? null,
    error_message: row.error_message,
  };
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger('ExportsService');
  private readonly exportDir: string;

  constructor(
    private readonly repo: ExportsRepository,
    private readonly meetingsService: MeetingsService,
    private readonly audit: AuditService,
  ) {
    this.exportDir = process.env.EXPORT_DIR || path.resolve(process.cwd(), 'data', 'exports');
  }

  async createExport(meetingId: string, userId: string, exportType: string) {
    await this.meetingsService.assertOwner(meetingId, userId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

    const job = await this.repo.create(meetingId, userId, exportType, expiresAt);

    await this.audit.log(userId, 'export', job.id, 'export.requested', {
      meeting_id: meetingId,
      export_type: exportType,
    });

    // Process async (in-process for v1)
    this.processExport(job.id, meetingId).catch((err) => {
      this.logger.error(`Export ${job.id} failed: ${err.message}`);
    });

    return toJobResponse(job);
  }

  async getExport(exportId: string, userId: string) {
    const job = await this.repo.findById(exportId);
    if (!job) throw new NotFoundException('Export not found');

    // Verify ownership
    await this.meetingsService.assertOwner(job.meeting_id, userId);
    return toJobResponse(job);
  }

  async getExportFile(exportId: string, userId: string): Promise<{ filePath: string; fileName: string }> {
    const job = await this.repo.findById(exportId);
    if (!job) throw new NotFoundException('Export not found');
    await this.meetingsService.assertOwner(job.meeting_id, userId);

    if (job.status !== 'completed' || !job.file_path) {
      throw new NotFoundException('Export file not ready');
    }

    if (new Date() > new Date(job.expires_at)) {
      throw new NotFoundException('Export has expired');
    }

    if (!fs.existsSync(job.file_path)) {
      throw new NotFoundException('Export file no longer exists');
    }

    return {
      filePath: job.file_path,
      fileName: `meeting-export-${job.meeting_id.slice(0, 8)}.json`,
    };
  }

  async listExports(meetingId: string, userId: string) {
    await this.meetingsService.assertOwner(meetingId, userId);
    const jobs = await this.repo.findByMeeting(meetingId);
    return jobs.map(toJobResponse);
  }

  private async processExport(jobId: string, meetingId: string) {
    try {
      await this.repo.updateStatus(jobId, 'processing');

      // Gather all data
      const [meeting, participants, games, phraseSets, chatMessages, auditEvents] =
        await Promise.all([
          this.repo.getMeetingData(meetingId),
          this.repo.getParticipants(meetingId),
          this.repo.getGames(meetingId),
          this.repo.getPhraseSets(meetingId),
          this.repo.getChatMessages(meetingId),
          this.repo.getAuditEvents(meetingId),
        ]);

      // Gather per-game data
      const gamesData = await Promise.all(
        (games || []).map(async (game: { id: string }) => {
          const [cards, cells, markEvents] = await Promise.all([
            this.repo.getCardsForGame(game.id),
            this.repo.getCellsForGame(game.id),
            this.repo.getMarkEvents(game.id),
          ]);
          return { ...game, cards, cells, mark_events: markEvents };
        }),
      );

      const exportData = {
        exported_at: new Date().toISOString(),
        meeting,
        participants,
        phrase_sets: phraseSets,
        games: gamesData,
        chat_messages: chatMessages,
        audit_events: auditEvents,
      };

      // Ensure export directory exists
      fs.mkdirSync(this.exportDir, { recursive: true });

      const filePath = path.join(this.exportDir, `${jobId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');

      await this.repo.updateStatus(jobId, 'completed', { file_path: filePath });
      this.logger.log(`Export ${jobId} completed: ${filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.repo.updateStatus(jobId, 'failed', { error_message: message });
      throw err;
    }
  }
}
