import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PhraseSetsRepository, PhraseSetRow, PhraseRow } from './phrase-sets.repository';
import { MeetingsService } from '../meetings';
import { AuditService } from '../common';

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSetResponse(row: PhraseSetRow) {
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    name: row.name,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function toPhraseResponse(row: PhraseRow) {
  return {
    id: row.id,
    phrase_set_id: row.phrase_set_id,
    text: row.text,
    normalized_text: row.normalized_text,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

@Injectable()
export class PhraseSetsService {
  constructor(
    private readonly repo: PhraseSetsRepository,
    private readonly meetingsService: MeetingsService,
    private readonly audit: AuditService,
  ) {}

  // Phrase Sets
  async createSet(meetingId: string, userId: string, name: string) {
    await this.meetingsService.assertOwner(meetingId, userId);
    const set = await this.repo.createSet(meetingId, name, userId);
    await this.audit.log(userId, 'phrase_set', set.id, 'phrase_set.created');
    return toSetResponse(set);
  }

  async listSets(meetingId: string, userId: string) {
    await this.meetingsService.assertOwner(meetingId, userId);
    const sets = await this.repo.findSetsByMeeting(meetingId);
    return sets.map(toSetResponse);
  }

  async updateSet(setId: string, userId: string, name: string) {
    const set = await this.repo.findSetById(setId);
    if (!set) throw new NotFoundException('Phrase set not found');
    await this.meetingsService.assertOwner(set.meeting_id, userId);

    const updated = await this.repo.updateSet(setId, name);
    return updated ? toSetResponse(updated) : null;
  }

  async deleteSet(setId: string, userId: string) {
    const set = await this.repo.findSetById(setId);
    if (!set) throw new NotFoundException('Phrase set not found');
    await this.meetingsService.assertOwner(set.meeting_id, userId);

    await this.repo.softDeleteSet(setId);
    await this.audit.log(userId, 'phrase_set', setId, 'phrase_set.deleted');
  }

  // Phrases
  async addPhrase(setId: string, userId: string, text: string) {
    const set = await this.repo.findSetById(setId);
    if (!set) throw new NotFoundException('Phrase set not found');
    await this.meetingsService.assertOwner(set.meeting_id, userId);

    const normalized = normalizePhrase(text);
    const duplicates = await this.repo.findDuplicates(setId, normalized);

    let warning: string | null = null;
    if (duplicates.length > 0) {
      warning = `Duplicate detected: "${duplicates[0].text}"`;
    }

    const phrase = await this.repo.createPhrase(setId, text, normalized);
    return { phrase: toPhraseResponse(phrase), warning };
  }

  async listPhrases(setId: string, userId: string) {
    const set = await this.repo.findSetById(setId);
    if (!set) throw new NotFoundException('Phrase set not found');
    await this.meetingsService.assertOwner(set.meeting_id, userId);

    const phrases = await this.repo.findPhrasesBySet(setId);
    return phrases.map(toPhraseResponse);
  }

  async updatePhrase(phraseId: string, userId: string, data: { text?: string; is_active?: boolean }) {
    const phrase = await this.repo.findPhraseById(phraseId);
    if (!phrase) throw new NotFoundException('Phrase not found');

    const set = await this.repo.findSetById(phrase.phrase_set_id);
    if (!set) throw new NotFoundException('Phrase set not found');
    await this.meetingsService.assertOwner(set.meeting_id, userId);

    const fields: { text?: string; normalized_text?: string; is_active?: boolean } = {};
    let warning: string | null = null;

    if (data.text !== undefined) {
      fields.text = data.text;
      fields.normalized_text = normalizePhrase(data.text);

      const duplicates = await this.repo.findDuplicates(phrase.phrase_set_id, fields.normalized_text, phraseId);
      if (duplicates.length > 0) {
        warning = `Duplicate detected: "${duplicates[0].text}"`;
      }
    }
    if (data.is_active !== undefined) {
      fields.is_active = data.is_active;
    }

    const updated = await this.repo.updatePhrase(phraseId, fields);
    return { phrase: updated ? toPhraseResponse(updated) : null, warning };
  }

  async deletePhrase(phraseId: string, userId: string) {
    const phrase = await this.repo.findPhraseById(phraseId);
    if (!phrase) throw new NotFoundException('Phrase not found');

    const set = await this.repo.findSetById(phrase.phrase_set_id);
    if (!set) throw new NotFoundException('Phrase set not found');
    await this.meetingsService.assertOwner(set.meeting_id, userId);

    await this.repo.softDeletePhrase(phraseId);
  }

  async listMyPhraseSets(userId: string, excludeMeetingId?: string) {
    const sets = await this.repo.findSetsByCreator(userId, excludeMeetingId);
    return sets.map((row) => ({
      ...toSetResponse(row),
      meeting_name: row.meeting_name,
      phrase_count: row.phrase_count,
    }));
  }

  async getActivePhrases(setId: string): Promise<PhraseRow[]> {
    return this.repo.findActivePhrasesBySet(setId);
  }

  async getSetById(setId: string) {
    return this.repo.findSetById(setId);
  }
}
