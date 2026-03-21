'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import ThemeToggle from '@/components/theme-toggle';

interface Invite {
  id: string;
  expires_at: string;
  max_uses: number | null;
  current_uses: number;
  revoked_at: string | null;
  created_at: string;
}

export default function InvitesPage() {
  const params = useParams();
  const meetingId = params.meetingId as string;

  const [invites, setInvites] = useState<Invite[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ invites: Invite[] }>(`/meetings/${meetingId}/invites`)
      .then((res) => setInvites(res.invites))
      .catch(() => setError('Failed to load invites'))
      .finally(() => setLoading(false));
  }, [meetingId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNewToken(null);

    try {
      const res = await api.post<{ invite: Invite & { token: string } }>(
        `/meetings/${meetingId}/invites`,
        {
          expires_at: new Date(expiresAt).toISOString(),
          max_uses: maxUses ? parseInt(maxUses, 10) : null,
        },
      );
      setNewToken(res.invite.token);
      setInvites((prev) => [res.invite, ...prev]);
      setExpiresAt('');
      setMaxUses('');
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to create invite');
      }
    }
  }

  async function handleRevoke(inviteId: string) {
    await api.post(`/meetings/${meetingId}/invites/${inviteId}/revoke`);
    setInvites((prev) =>
      prev.map((inv) =>
        inv.id === inviteId ? { ...inv, revoked_at: new Date().toISOString() } : inv,
      ),
    );
  }

  function getInviteLink(token: string) {
    return `${window.location.origin}/join/${token}`;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <Link
            href={`/meetings/${meetingId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            &larr; Meeting
          </Link>
          <ThemeToggle />
        </div>
        <h1 className="mt-4 mb-6 text-2xl font-bold">Invite Links</h1>

        {/* Create new invite */}
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded border border-gray-200 p-4">
          <h2 className="text-sm font-semibold">Generate New Invite</h2>
          {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          <div>
            <label htmlFor="expiresAt" className="block text-xs font-medium mb-1">
              Expires At
            </label>
            <input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="maxUses" className="block text-xs font-medium mb-1">
              Max Uses (optional)
            </label>
            <input
              id="maxUses"
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>

          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate
          </button>
        </form>

        {/* Show generated token */}
        {newToken && (
          <div className="mb-6 rounded bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800 mb-2">
              Invite link created! Copy it now — you won&apos;t see the token again.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={getInviteLink(newToken)}
                className="flex-1 rounded border border-green-300 px-2 py-1 text-xs font-mono bg-white"
              />
              <button
                onClick={() => navigator.clipboard.writeText(getInviteLink(newToken))}
                className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-green-700">
              Access to a meeting is controlled by invite and account authentication. Meeting
              owners can revoke access at any time.
            </p>
          </div>
        )}

        {/* Invite list */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-gray-500">No invites yet.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li key={inv.id} className="rounded border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-500">Uses:</span> {inv.current_uses}
                    {inv.max_uses !== null && `/${inv.max_uses}`}
                    <span className="ml-3 text-gray-500">Expires:</span>{' '}
                    {new Date(inv.expires_at).toLocaleString()}
                    {inv.revoked_at && (
                      <span className="ml-2 text-xs text-red-500">Revoked</span>
                    )}
                  </div>
                  {!inv.revoked_at && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
