'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import ThemeToggle from '@/components/theme-toggle';

export default function JoinPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [meetingName, setMeetingName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [validating, setValidating] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ valid: boolean; meeting_id: string; meeting_name: string }>(
        `/invites/${token}/validate`,
      )
      .then((res) => {
        setMeetingName(res.meeting_name);
        setMeetingId(res.meeting_id);
      })
      .catch(() => {
        setError('This invite link is invalid or has expired.');
      })
      .finally(() => setValidating(false));
  }, [token]);

  async function handleJoin() {
    setJoining(true);
    setError('');

    try {
      const res = await api.post<{ meeting_id: string }>(`/invites/${token}/join`);
      router.push(`/meetings/${res.meeting_id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to join meeting');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setJoining(false);
    }
  }

  if (validating || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Validating invite...</p>
      </main>
    );
  }

  if (error && !meetingId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Invite</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link href="/" className="text-blue-600 hover:underline">
            Go to homepage
          </Link>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-2">Join: {meetingName}</h1>
          <p className="text-gray-600 mb-6">Sign in or create an account to join this meeting.</p>
          <div className="flex gap-3 justify-center">
            <Link
              href={`/login?redirect=/join/${token}`}
              className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign In
            </Link>
            <Link
              href={`/register?redirect=/join/${token}`}
              className="rounded border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Register
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-2">Join: {meetingName}</h1>
        <p className="text-gray-600 mb-4">
          You&apos;re about to join as <strong>{user.nickname}</strong>.
        </p>

        {error && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        <div className="rounded bg-gray-50 p-3 text-xs text-gray-600 mb-4">
          Access to a meeting is controlled by invite and account authentication. Meeting
          owners can revoke access at any time.
        </div>

        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {joining ? 'Joining...' : 'Join Meeting'}
        </button>
      </div>
    </main>
  );
}
