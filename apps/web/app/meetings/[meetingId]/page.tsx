'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import ThemeToggle from '@/components/theme-toggle';

interface Meeting {
  id: string;
  owner_user_id: string;
  name: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  grace_minutes: number;
  chat_enabled: boolean;
  anonymize_nicknames: boolean;
}

interface Participant {
  id: string;
  user_id: string;
  nickname: string;
  role: string;
  access_status: string;
}

interface ExportJob {
  id: string;
  export_type: string;
  status: string;
  file_path: string | null;
  created_at: string;
  error_message: string | null;
}

interface AnalysisPrompt {
  id: string;
  title: string;
  prompt: string;
}

interface Game {
  id: string;
  status: string;
  started_at: string | null;
  winner_user_id: string | null;
}

export default function MeetingDetailPage() {
  const params = useParams();
  const meetingId = params.meetingId as string;
  const { user } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ user_id: string; nickname: string; games_played: number; wins: number; losses: number }[]>([]);
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [prompts, setPrompts] = useState<AnalysisPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const isOwner = user && meeting && user.id === meeting.owner_user_id;

  useEffect(() => {
    Promise.all([
      api.get<{ meeting: Meeting }>(`/meetings/${meetingId}`),
      api.get<{ participants: Participant[] }>(`/meetings/${meetingId}/participants`).catch(() => ({ participants: [] })),
      api.get<{ games: Game[] }>(`/meetings/${meetingId}/games`).catch(() => ({ games: [] })),
      api.get<{ leaderboard: { user_id: string; nickname: string; games_played: number; wins: number; losses: number }[] }>(`/meetings/${meetingId}/leaderboard`).catch(() => ({ leaderboard: [] })),
    ])
      .then(([meetingRes, participantsRes, gamesRes, lbRes]) => {
        setMeeting(meetingRes.meeting);
        setParticipants(participantsRes.participants);
        setGames(gamesRes.games);
        setLeaderboard(lbRes.leaderboard);
      })
      .catch(() => setError('Failed to load meeting'))
      .finally(() => setLoading(false));
  }, [meetingId]);

  useEffect(() => {
    if (!isOwner) return;
    Promise.all([
      api.get<{ export_jobs: ExportJob[] }>(`/meetings/${meetingId}/exports`).catch(() => ({ export_jobs: [] })),
      api.get<{ prompts: AnalysisPrompt[] }>(`/meetings/${meetingId}/analysis-prompts`).catch(() => ({ prompts: [] })),
    ]).then(([exportsRes, promptsRes]) => {
      setExports(exportsRes.export_jobs);
      setPrompts(promptsRes.prompts);
    });
  }, [meetingId, isOwner]);

  async function handleRevoke(userId: string) {
    await api.post(`/meetings/${meetingId}/participants/${userId}/revoke`);
    setParticipants((prev) =>
      prev.map((p) => (p.user_id === userId ? { ...p, access_status: 'revoked' } : p)),
    );
  }

  const [exportError, setExportError] = useState('');

  async function handleExport() {
    setExportError('');
    try {
      const res = await api.post<{ export_job: ExportJob }>(`/meetings/${meetingId}/exports`, { export_type: 'json' });
      setExports((prev) => [res.export_job, ...prev]);
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string }; status?: number })?.data;
      const status = (err as { status?: number })?.status;
      setExportError(`Export failed (${status || '?'}): ${data?.message || (err instanceof Error ? err.message : 'Unknown error')}`);
    }
  }

  async function handleCloseMeeting() {
    const res = await api.post<{ meeting: Meeting }>(`/meetings/${meetingId}/close`);
    setMeeting(res.meeting);
  }

  function copyPrompt(prompt: string, id: string) {
    navigator.clipboard.writeText(prompt);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function refreshExport(exportId: string) {
    const res = await api.get<{ export_job: ExportJob }>(`/exports/${exportId}`);
    setExports((prev) => prev.map((e) => (e.id === exportId ? res.export_job : e)));
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center"><p className="text-gray-500">Loading...</p></main>;
  }
  if (error || !meeting) {
    return <main className="flex min-h-screen items-center justify-center"><p className="text-red-600">{error || 'Meeting not found'}</p></main>;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">&larr; Dashboard</Link>
          <ThemeToggle />
        </div>

        <div className="mt-4 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{meeting.name}</h1>
            <div className="mt-1 flex gap-3 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
              <span>Status: <strong>{meeting.status}</strong></span>
              <span>Start: {new Date(meeting.scheduled_start_at).toLocaleString()}</span>
              <span>End: {new Date(meeting.scheduled_end_at).toLocaleString()}</span>
            </div>
          </div>
          {isOwner && !['closed', 'deleted'].includes(meeting.status) && (
            <button onClick={handleCloseMeeting} className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
              Close Meeting
            </button>
          )}
        </div>

        {isOwner && (
          <div className="mb-6 rounded bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-800 dark:text-amber-300">
            You are responsible for any data entered into this meeting, including phrase lists, chat,
            participant access decisions, exports, and downstream AI analysis. Do not use this system
            for confidential, personal, regulated, or restricted information.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Participants */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="mb-3 text-lg font-semibold">
              Participants ({participants.filter((p) => p.access_status === 'active').length})
            </h2>
            {participants.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No participants yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded border border-gray-100 dark:border-gray-700 px-3 py-1.5">
                    <div>
                      <span className="font-medium text-sm">{p.nickname}</span>
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{p.role}</span>
                      {p.access_status === 'revoked' && <span className="ml-2 text-xs text-red-500">revoked</span>}
                    </div>
                    {isOwner && p.role !== 'owner' && p.access_status === 'active' && (
                      <button onClick={() => handleRevoke(p.user_id)} className="text-xs text-red-600 hover:underline">Revoke</button>
                    )}
                    {isOwner && p.role !== 'owner' && p.access_status === 'revoked' && (
                      <button
                        onClick={async () => {
                          await api.post(`/meetings/${meetingId}/participants/${p.user_id}/unrevoke`);
                          setParticipants((prev) =>
                            prev.map((x) => (x.user_id === p.user_id ? { ...x, access_status: 'active' } : x)),
                          );
                        }}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="mb-3 text-lg font-semibold">Leaderboard</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2">Player</th>
                    <th className="pb-2 text-center">W</th>
                    <th className="pb-2 text-center">L</th>
                    <th className="pb-2 text-center">Played</th>
                    <th className="pb-2 text-right">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr
                      key={p.user_id}
                      className={`border-b border-gray-100 dark:border-gray-800 ${p.user_id === user?.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <td className="py-1.5 pr-2 font-semibold text-gray-400">{i + 1}</td>
                      <td className="py-1.5">
                        {p.nickname}
                        {i === 0 && p.wins > 0 && <span className="ml-1.5 text-yellow-500" title="Leader">&#9733;</span>}
                      </td>
                      <td className="py-1.5 text-center text-green-600 dark:text-green-400 font-medium">{p.wins}</td>
                      <td className="py-1.5 text-center text-red-500 dark:text-red-400">{p.losses}</td>
                      <td className="py-1.5 text-center text-gray-500 dark:text-gray-400">{p.games_played}</td>
                      <td className="py-1.5 text-right font-medium">
                        {p.games_played > 0 ? `${Math.round((p.wins / p.games_played) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Games — visible to ALL participants */}
          {games.filter((g) => ['active', 'won', 'closed'].includes(g.status)).length > 0 && (
            <section className="rounded-lg border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20 p-5">
              <h2 className="mb-3 text-lg font-semibold">Games</h2>
              <div className="space-y-2">
                {games
                  .filter((g) => ['active', 'won', 'closed'].includes(g.status))
                  .map((g) => (
                    <div key={g.id} className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          g.status === 'active' ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' :
                          g.status === 'won' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                          'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}>{g.status}</span>
                        {g.started_at && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            {new Date(g.started_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/meetings/${meetingId}/game/${g.id}`}
                        className={`rounded px-4 py-2 text-sm font-medium text-white ${
                          g.status === 'active' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {g.status === 'active' ? 'Play Bingo' : 'View Results'}
                      </Link>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Owner controls */}
          {isOwner && (
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="mb-3 text-lg font-semibold">Meeting Controls</h2>
              <div className="space-y-3">
                {[
                  { href: `/meetings/${meetingId}/invites`, label: 'Manage Invites' },
                  { href: `/meetings/${meetingId}/phrases`, label: 'Phrase Pool' },
                  { href: `/meetings/${meetingId}/rules`, label: 'Game Rules' },
                  { href: `/meetings/${meetingId}/game`, label: 'Game Control' },
                ].map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded border border-gray-100 dark:border-gray-700 p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={meeting.chat_enabled}
                      onChange={async () => {
                        const res = await api.patch<{ meeting: Meeting }>(`/meetings/${meetingId}`, { chat_enabled: !meeting.chat_enabled });
                        setMeeting(res.meeting);
                      }}
                      className="rounded"
                    />
                    Enable Chat
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={meeting.anonymize_nicknames}
                      onChange={async () => {
                        const res = await api.patch<{ meeting: Meeting }>(`/meetings/${meetingId}`, { anonymize_nicknames: !meeting.anonymize_nicknames });
                        setMeeting(res.meeting);
                      }}
                      className="rounded"
                    />
                    Anonymize Nicknames
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* Exports */}
          {isOwner && (
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="mb-3 text-lg font-semibold">Exports</h2>
              <div className="mb-3 rounded bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                Exports may contain participant nicknames, timestamps, chat records, gameplay events,
                rankings, and winning card data. Handle exports as controlled records.
              </div>
              <button onClick={handleExport} className="mb-3 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">
                Export Meeting Data
              </button>
              {exportError && (
                <div className="mb-3 rounded bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300 font-mono break-all">
                  {exportError}
                </div>
              )}
              {exports.length > 0 && (
                <ul className="space-y-1.5">
                  {exports.map((exp) => (
                    <li key={exp.id} className="flex items-center justify-between rounded border border-gray-100 dark:border-gray-700 px-3 py-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            exp.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                            exp.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                          }`}>{exp.status}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(exp.created_at).toLocaleString()}</span>
                        </div>
                        {exp.error_message && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-mono break-all">{exp.error_message}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {['pending', 'processing'].includes(exp.status) && (
                          <button onClick={() => refreshExport(exp.id)} className="text-xs text-blue-600 hover:underline">Refresh</button>
                        )}
                        {exp.file_path && (
                          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/exports/${exp.id}/download`}
                            className="text-xs text-blue-600 hover:underline">Download</a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* AI Analysis Prompts */}
          {isOwner && prompts.length > 0 && (
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="mb-3 text-lg font-semibold">AI Analysis Prompts</h2>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Copy a prompt and paste it into an AI assistant along with your exported meeting data.
              </p>
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {prompts.map((p) => (
                  <li key={p.id} className="rounded border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{p.title}</span>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{p.prompt}</p>
                      </div>
                      <button
                        onClick={() => copyPrompt(p.prompt, p.id)}
                        className="shrink-0 rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200 px-2.5 py-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        {copied === p.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
