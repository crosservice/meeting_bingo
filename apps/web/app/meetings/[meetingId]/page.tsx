'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface Meeting {
  id: string;
  owner_user_id: string;
  name: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  grace_minutes: number;
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

export default function MeetingDetailPage() {
  const params = useParams();
  const meetingId = params.meetingId as string;
  const { user } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
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
    ])
      .then(([meetingRes, participantsRes]) => {
        setMeeting(meetingRes.meeting);
        setParticipants(participantsRes.participants);
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

  async function handleExport() {
    const res = await api.post<{ export_job: ExportJob }>(`/meetings/${meetingId}/exports`, { export_type: 'json' });
    setExports((prev) => [res.export_job, ...prev]);
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
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">&larr; Dashboard</Link>

        <div className="mt-4 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{meeting.name}</h1>
            <div className="mt-1 flex gap-3 text-sm text-gray-600 flex-wrap">
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
          <div className="mb-6 rounded bg-amber-50 p-3 text-xs text-amber-800">
            You are responsible for any data entered into this meeting, including phrase lists, chat,
            participant access decisions, exports, and downstream AI analysis. Do not use this system
            for confidential, personal, regulated, or restricted information.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Participants */}
          <section className="rounded-lg border border-gray-200 p-5">
            <h2 className="mb-3 text-lg font-semibold">
              Participants ({participants.filter((p) => p.access_status === 'active').length})
            </h2>
            {participants.length === 0 ? (
              <p className="text-sm text-gray-500">No participants yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-1.5">
                    <div>
                      <span className="font-medium text-sm">{p.nickname}</span>
                      <span className="ml-2 text-xs text-gray-500">{p.role}</span>
                      {p.access_status === 'revoked' && <span className="ml-2 text-xs text-red-500">revoked</span>}
                    </div>
                    {isOwner && p.role !== 'owner' && p.access_status === 'active' && (
                      <button onClick={() => handleRevoke(p.user_id)} className="text-xs text-red-600 hover:underline">Revoke</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Owner controls */}
          {isOwner && (
            <section className="rounded-lg border border-gray-200 p-5">
              <h2 className="mb-3 text-lg font-semibold">Meeting Controls</h2>
              <div className="space-y-2">
                {[
                  { href: `/meetings/${meetingId}/invites`, label: 'Manage Invites' },
                  { href: `/meetings/${meetingId}/phrases`, label: 'Phrase Pool' },
                  { href: `/meetings/${meetingId}/rules`, label: 'Game Rules' },
                  { href: `/meetings/${meetingId}/game`, label: 'Game Control' },
                ].map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded border border-gray-100 p-3 text-sm hover:bg-gray-50">
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Exports */}
          {isOwner && (
            <section className="rounded-lg border border-gray-200 p-5">
              <h2 className="mb-3 text-lg font-semibold">Exports</h2>
              <div className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-700">
                Exports may contain participant nicknames, timestamps, chat records, gameplay events,
                rankings, and winning card data. Handle exports as controlled records.
              </div>
              <button onClick={handleExport} className="mb-3 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">
                Export Meeting Data
              </button>
              {exports.length > 0 && (
                <ul className="space-y-1.5">
                  {exports.map((exp) => (
                    <li key={exp.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          exp.status === 'completed' ? 'bg-green-100 text-green-700' :
                          exp.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{exp.status}</span>
                        <span className="text-xs text-gray-500">{new Date(exp.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex gap-2">
                        {['pending', 'processing'].includes(exp.status) && (
                          <button onClick={() => refreshExport(exp.id)} className="text-xs text-blue-600 hover:underline">Refresh</button>
                        )}
                        {exp.file_path && (
                          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${exp.file_path}`}
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
            <section className="rounded-lg border border-gray-200 p-5">
              <h2 className="mb-3 text-lg font-semibold">AI Analysis Prompts</h2>
              <p className="mb-3 text-xs text-gray-500">
                Copy a prompt and paste it into an AI assistant along with your exported meeting data.
              </p>
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {prompts.map((p) => (
                  <li key={p.id} className="rounded border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{p.title}</span>
                        <p className="mt-1 text-xs text-gray-600 line-clamp-2">{p.prompt}</p>
                      </div>
                      <button
                        onClick={() => copyPrompt(p.prompt, p.id)}
                        className="shrink-0 rounded bg-gray-200 px-2.5 py-1 text-xs hover:bg-gray-300"
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
