import { Injectable, NotFoundException } from '@nestjs/common';
import { RulesetsRepository, RulesetRow } from './rulesets.repository';
import { MeetingsService } from '../meetings';
import { AuditService } from '../common';

function toRulesetResponse(row: RulesetRow) {
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    name: row.name,
    board_rows: row.board_rows,
    board_cols: row.board_cols,
    free_square_enabled: row.free_square_enabled,
    free_square_label: row.free_square_label,
    horizontal_enabled: row.horizontal_enabled,
    vertical_enabled: row.vertical_enabled,
    diagonal_enabled: row.diagonal_enabled,
    late_join_enabled: row.late_join_enabled,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

@Injectable()
export class RulesetsService {
  constructor(
    private readonly repo: RulesetsRepository,
    private readonly meetingsService: MeetingsService,
    private readonly audit: AuditService,
  ) {}

  async create(meetingId: string, userId: string, data: Partial<RulesetRow>) {
    await this.meetingsService.assertOwner(meetingId, userId);
    const ruleset = await this.repo.create(meetingId, data);
    await this.audit.log(userId, 'ruleset', ruleset.id, 'ruleset.created');
    return toRulesetResponse(ruleset);
  }

  async list(meetingId: string, userId: string) {
    await this.meetingsService.assertOwner(meetingId, userId);
    const rulesets = await this.repo.findByMeeting(meetingId);
    return rulesets.map(toRulesetResponse);
  }

  async update(rulesetId: string, userId: string, data: Partial<RulesetRow>) {
    const ruleset = await this.repo.findById(rulesetId);
    if (!ruleset) throw new NotFoundException('Ruleset not found');
    await this.meetingsService.assertOwner(ruleset.meeting_id, userId);

    const updated = await this.repo.update(rulesetId, data);
    return updated ? toRulesetResponse(updated) : null;
  }

  async getById(rulesetId: string): Promise<RulesetRow | null> {
    return this.repo.findById(rulesetId);
  }
}
