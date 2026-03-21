import { Controller, Get, Param } from '@nestjs/common';
import { MeetingsService } from '../meetings';
import { CurrentUser, AuthenticatedUser } from '../auth';

const PROMPT_TEMPLATES = [
  {
    id: 'winner-path',
    title: 'Winner Path',
    prompt:
      'Analyze this Meeting Bingo export and explain exactly how the winner won, including the completed line, event order, and phrase sequence.',
  },
  {
    id: 'phrase-frequency',
    title: 'Phrase Frequency',
    prompt:
      'Identify the most frequently reported phrases in this meeting and show which phrases repeated far more than the rest.',
  },
  {
    id: 'player-behavior',
    title: 'Player Behavior',
    prompt:
      'Compare participants by marking behavior, responsiveness, aggressiveness, and possible over-reporting or under-reporting.',
  },
  {
    id: 'timeline',
    title: 'Timeline',
    prompt:
      'Construct a time-based narrative of the meeting using phrase marks and chat activity. Highlight topic shifts and bursts of repetition.',
  },
  {
    id: 'phrase-clustering',
    title: 'Phrase Clustering',
    prompt:
      'Find which phrases tended to appear near each other in time and propose likely thematic clusters.',
  },
  {
    id: 'card-fairness',
    title: 'Card Fairness',
    prompt:
      'Evaluate whether the card generation and phrase distribution produced any materially easier or harder cards.',
  },
  {
    id: 'rhetorical-signals',
    title: 'Rhetorical Signals',
    prompt:
      'Infer dominant rhetorical habits in the meeting from the phrase marks and chat transcript.',
  },
  {
    id: 'anomaly-detection',
    title: 'Anomaly Detection',
    prompt:
      'Identify suspicious or anomalous participant behavior, including spam-like marking or improbable chat/gameplay timing.',
  },
  {
    id: 'next-game-optimization',
    title: 'Next Game Optimization',
    prompt:
      'Propose a stronger phrase list for a future game based on what actually happened in this meeting.',
  },
  {
    id: 'social-dynamics',
    title: 'Social Dynamics',
    prompt:
      'Analyze the chat and gameplay for leadership patterns, humor, convergence, confusion, and dissent.',
  },
];

@Controller()
export class AnalysisPromptsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get('meetings/:meetingId/analysis-prompts')
  async getPrompts(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Owner-only
    await this.meetingsService.assertOwner(meetingId, user.id);

    return {
      prompts: PROMPT_TEMPLATES.map((t) => ({
        ...t,
        prompt: t.prompt,
      })),
    };
  }
}
