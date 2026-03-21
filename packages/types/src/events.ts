// Server-to-client WebSocket events
export const ServerEvents = {
  MeetingUpdated: 'meeting.updated',
  MeetingExtended: 'meeting.extended',
  MeetingClosed: 'meeting.closed',
  GameStarted: 'game.started',
  GameUpdated: 'game.updated',
  CardUpdated: 'card.updated',
  RankingUpdated: 'ranking.updated',
  ChatCreated: 'chat.created',
  ChatHidden: 'chat.hidden',
  GameWon: 'game.won',
  ParticipantRevoked: 'participant.revoked',
  SessionInvalidated: 'session.invalidated',
} as const;

// Client-to-server WebSocket events
export const ClientEvents = {
  CardIncrement: 'card.increment',
  CardDecrement: 'card.decrement',
  ChatSend: 'chat.send',
  PresencePing: 'presence.ping',
} as const;

export type ServerEventName = (typeof ServerEvents)[keyof typeof ServerEvents];
export type ClientEventName = (typeof ClientEvents)[keyof typeof ClientEvents];

export interface RankingEntry {
  rank: number;
  user_id: string;
  nickname: string;
  marks_until_win: number;
}
