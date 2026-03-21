'use client';

import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Meeting {
  id: string;
  name: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
}

export default function DashboardPage() {
  const { user, loading, logout, theme, setTheme } = useAuth();
  const router = useRouter();
  const [inProgressMeetings, setInProgressMeetings] = useState<Meeting[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!user) return;

    Promise.all([
      api.get<{ meetings: Meeting[] }>('/me/meetings/in-progress').catch(() => ({ meetings: [] })),
    ])
      .then(([inProgress]) => {
        setInProgressMeetings(inProgress.meetings);
      })
      .finally(() => setFetching(false));
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {user.nickname}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="rounded bg-gray-200 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <Link
              href="/meetings/new"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New Meeting
            </Link>
            <button
              onClick={logout}
              className="rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-gray-200 p-6">
            <h2 className="mb-4 text-lg font-semibold">In-Progress Meetings</h2>
            {fetching ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : inProgressMeetings.length === 0 ? (
              <p className="text-sm text-gray-500">No active meetings to rejoin.</p>
            ) : (
              <ul className="space-y-2">
                {inProgressMeetings.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/meetings/${m.id}`}
                      className="block rounded border border-gray-100 p-3 hover:bg-gray-50"
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 text-xs text-gray-500">{m.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 p-6">
            <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/meetings/new"
                className="block rounded border border-gray-100 p-3 text-sm hover:bg-gray-50"
              >
                Create a new meeting
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
