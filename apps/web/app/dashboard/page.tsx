'use client';

import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/theme-toggle';
import { useEffect, useState, FormEvent } from 'react';

interface MeetingEnriched {
  id: string;
  name: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  owner_nickname: string;
  user_role: string;
  game_count: string;
  last_winner_user_id: string | null;
  last_winner_nickname: string | null;
}

interface Stats {
  games_played: number;
  wins: number;
  losses: number;
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingEnriched[]>([]);
  const [stats, setStats] = useState<Stats>({ games_played: 0, wins: 0, losses: 0 });
  const [fetching, setFetching] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!user) return;

    Promise.all([
      api.get<{ meetings: MeetingEnriched[] }>('/me/meetings/all').catch(() => ({ meetings: [] })),
      api.get<{ stats: Stats }>('/me/stats').catch(() => ({ stats: { games_played: 0, wins: 0, losses: 0 } })),
    ])
      .then(([meetingsRes, statsRes]) => {
        setMeetings(meetingsRes.meetings);
        setStats(statsRes.stats);
      })
      .finally(() => setFetching(false));
  }, [user, loading, router]);

  async function handleJoinByCode(e: FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteLoading(true);

    try {
      // Extract token from URL or use raw code
      let token = inviteCode.trim();
      const urlMatch = token.match(/\/join\/(.+)$/);
      if (urlMatch) token = urlMatch[1];

      const res = await api.post<{ meeting_id: string }>(`/invites/${token}/join`);
      setInviteCode('');
      router.push(`/meetings/${res.meeting_id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setInviteError(typeof data.message === 'string' ? data.message : 'Invalid or expired invite');
      } else {
        setInviteError('Failed to join');
      }
    } finally {
      setInviteLoading(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  const activeMeetings = meetings.filter((m) => ['open', 'in_progress', 'scheduled', 'draft'].includes(m.status));
  const pastMeetings = meetings.filter((m) => ['ended', 'closed', 'won'].includes(m.status) || !['open', 'in_progress', 'scheduled', 'draft'].includes(m.status));

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Welcome, {user.nickname}</p>
          </div>
          <div className="flex gap-3">
            <ThemeToggle />
            <Link
              href="/meetings/new"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New Meeting
            </Link>
            <Link
              href="/account"
              className="rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Account
            </Link>
            <button
              onClick={logout}
              className="rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Stats + Join */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          {/* Win/Loss Record */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="mb-3 text-lg font-semibold">My Record</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.games_played}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Games</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.wins}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Wins</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{stats.losses}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Losses</div>
              </div>
            </div>
            {stats.games_played > 0 && (
              <div className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                Win rate: {Math.round((stats.wins / stats.games_played) * 100)}%
              </div>
            )}
          </section>

          {/* Join by Invite Code */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="mb-3 text-lg font-semibold">Join a Meeting</h2>
            <form onSubmit={handleJoinByCode} className="space-y-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Paste invite link or code..."
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {inviteError && (
                <p className="text-xs text-red-600">{inviteError}</p>
              )}
              <button
                type="submit"
                disabled={inviteLoading || !inviteCode.trim()}
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {inviteLoading ? 'Joining...' : 'Join Meeting'}
              </button>
            </form>
          </section>
        </div>

        {/* Active Meetings */}
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Active Meetings</h2>
          {fetching ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : activeMeetings.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No active meetings. Create one or join with an invite code.</p>
          ) : (
            <div className="space-y-2">
              {activeMeetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 text-xs text-gray-500">by {m.owner_nickname}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      m.status === 'in_progress' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    }`}>{m.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(m.scheduled_start_at).toLocaleString()} — {new Date(m.scheduled_end_at).toLocaleString()}
                    {m.user_role === 'owner' && <span className="ml-2 text-blue-600 dark:text-blue-400">(owner)</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Past Meetings */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Past Meetings</h2>
          {fetching ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : pastMeetings.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No past meetings yet.</p>
          ) : (
            <div className="space-y-2">
              {pastMeetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 text-xs text-gray-500">by {m.owner_nickname}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{m.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex gap-3">
                    <span>{new Date(m.scheduled_start_at).toLocaleDateString()}</span>
                    <span>{m.game_count} game(s)</span>
                    {m.last_winner_nickname && (
                      <span>Winner: <strong className="text-yellow-600 dark:text-yellow-400">{m.last_winner_nickname}</strong></span>
                    )}
                    {m.user_role === 'owner' && <span className="text-blue-600 dark:text-blue-400">(owner)</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
