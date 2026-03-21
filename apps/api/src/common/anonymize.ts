import * as crypto from 'crypto';

/**
 * Generate a deterministic anonymous nickname from a meeting+user ID pair.
 * The same pair always produces the same pseudonym within a meeting.
 */
export function anonymizeNickname(meetingId: string, userId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${meetingId}:${userId}`)
    .digest('hex');
  return `Player-${hash.slice(0, 6).toUpperCase()}`;
}
