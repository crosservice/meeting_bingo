'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import ThemeToggle from '@/components/theme-toggle';

export default function NewMeetingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await api.post<{ meeting: { id: string } }>('/meetings', {
        name,
        scheduled_start_at: new Date(startAt).toISOString(),
        scheduled_end_at: new Date(endAt).toISOString(),
      });
      router.push(`/meetings/${res.meeting.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to create meeting');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            &larr; Dashboard
          </Link>
          <ThemeToggle />
        </div>
        <h1 className="mt-4 mb-6 text-2xl font-bold">Create Meeting</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Meeting Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="startAt" className="block text-sm font-medium mb-1">
              Scheduled Start
            </label>
            <input
              id="startAt"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="endAt" className="block text-sm font-medium mb-1">
              Scheduled End
            </label>
            <input
              id="endAt"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="rounded bg-amber-50 p-3 text-xs text-amber-800">
            You are responsible for any data entered into this meeting, including phrase lists,
            chat, participant access decisions, exports, and downstream AI analysis. Do not use
            this system for confidential, personal, regulated, or restricted information.
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Meeting'}
          </button>
        </form>
      </div>
    </main>
  );
}
