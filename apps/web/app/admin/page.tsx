'use client';

import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/theme-toggle';
import { useEffect, useState } from 'react';

interface AdminUser {
  id: string;
  nickname: string;
  status: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  deleted_at: string | null;
}

interface AdminUserDetail extends AdminUser {
  theme: string;
  updated_at: string;
  games_played: number;
  games_won: number;
  meetings_owned: number;
  meetings_joined: number;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'superuser')) {
      router.push('/dashboard');
      return;
    }
    if (!user) return;

    fetchUsers();
  }, [user, loading, router]);

  async function fetchUsers() {
    setFetching(true);
    try {
      const res = await api.get<{ users: AdminUser[] }>('/admin/users');
      setUsers(res.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setFetching(false);
    }
  }

  async function viewUser(userId: string) {
    setDetailLoading(true);
    setError('');
    try {
      const res = await api.get<{ user: AdminUserDetail }>(`/admin/users/${userId}`);
      setSelectedUser(res.user);
    } catch {
      setError('Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  }

  async function suspendUser(userId: string) {
    setActionLoading(userId);
    setError('');
    try {
      await api.post(`/admin/users/${userId}/suspend`);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        await viewUser(userId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to suspend user');
      } else {
        setError('Failed to suspend user');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function restoreUser(userId: string) {
    setActionLoading(userId);
    setError('');
    try {
      await api.post(`/admin/users/${userId}/restore`);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        await viewUser(userId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to restore user');
      } else {
        setError('Failed to restore user');
      }
    } finally {
      setActionLoading(null);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">User Management</p>
          </div>
          <div className="flex gap-3">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* User List */}
          <section className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">All Users ({users.length})</h2>
              <button
                onClick={fetchUsers}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Refresh
              </button>
            </div>

            {fetching ? (
              <p className="text-sm text-gray-500">Loading users...</p>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Nickname</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Role</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Last Login</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                          selectedUser?.id === u.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        onClick={() => viewUser(u.id)}
                      >
                        <td className="px-4 py-2 font-medium">
                          {u.nickname}
                          {u.deleted_at && <span className="ml-1 text-xs text-gray-400">(deleted)</span>}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              u.status === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : u.status === 'suspended'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {u.role === 'superuser' ? (
                            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">superuser</span>
                          ) : (
                            <span className="text-xs text-gray-500">user</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                          {u.role !== 'superuser' && (
                            <>
                              {u.status === 'active' && (
                                <button
                                  onClick={() => suspendUser(u.id)}
                                  disabled={actionLoading === u.id}
                                  className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                                >
                                  {actionLoading === u.id ? '...' : 'Suspend'}
                                </button>
                              )}
                              {u.status === 'suspended' && (
                                <button
                                  onClick={() => restoreUser(u.id)}
                                  disabled={actionLoading === u.id}
                                  className="text-xs text-green-600 dark:text-green-400 hover:underline disabled:opacity-50"
                                >
                                  {actionLoading === u.id ? '...' : 'Restore'}
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* User Detail Panel */}
          <section>
            <h2 className="text-lg font-semibold mb-3">User Details</h2>
            {detailLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : selectedUser ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                <div>
                  <h3 className="text-xl font-bold">{selectedUser.nickname}</h3>
                  <div className="mt-1 flex gap-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        selectedUser.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : selectedUser.status === 'suspended'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {selectedUser.status}
                    </span>
                    {selectedUser.role === 'superuser' && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        superuser
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">ID</span>
                    <span className="font-mono text-xs">{selectedUser.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Last Login IP</span>
                    <span className="font-mono text-xs">{selectedUser.last_login_ip || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Last Login</span>
                    <span className="text-xs">
                      {selectedUser.last_login_at
                        ? new Date(selectedUser.last_login_at).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Created</span>
                    <span className="text-xs">{new Date(selectedUser.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Theme</span>
                    <span className="text-xs">{selectedUser.theme || 'light'}</span>
                  </div>
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                <div>
                  <h4 className="text-sm font-semibold mb-2">Activity</h4>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded bg-gray-50 dark:bg-gray-800 p-2">
                      <div className="text-lg font-bold text-blue-600">{selectedUser.games_played}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Games Played</div>
                    </div>
                    <div className="rounded bg-gray-50 dark:bg-gray-800 p-2">
                      <div className="text-lg font-bold text-green-600">{selectedUser.games_won}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Games Won</div>
                    </div>
                    <div className="rounded bg-gray-50 dark:bg-gray-800 p-2">
                      <div className="text-lg font-bold text-purple-600">{selectedUser.meetings_owned}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Meetings Owned</div>
                    </div>
                    <div className="rounded bg-gray-50 dark:bg-gray-800 p-2">
                      <div className="text-lg font-bold text-orange-500">{selectedUser.meetings_joined}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Meetings Joined</div>
                    </div>
                  </div>
                </div>

                {selectedUser.role !== 'superuser' && (
                  <>
                    <hr className="border-gray-200 dark:border-gray-700" />
                    <div>
                      {selectedUser.status === 'active' && (
                        <button
                          onClick={() => suspendUser(selectedUser.id)}
                          disabled={actionLoading === selectedUser.id}
                          className="w-full rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading === selectedUser.id ? 'Suspending...' : 'Suspend User'}
                        </button>
                      )}
                      {selectedUser.status === 'suspended' && (
                        <button
                          onClick={() => restoreUser(selectedUser.id)}
                          disabled={actionLoading === selectedUser.id}
                          className="w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === selectedUser.id ? 'Restoring...' : 'Restore User'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Click a user to view details</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
