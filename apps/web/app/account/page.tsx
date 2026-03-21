'use client';

import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete account state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setPasswordError(typeof data.message === 'string' ? data.message : 'Failed to change password');
      } else {
        setPasswordError('Failed to change password');
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError('');

    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }

    setDeleteLoading(true);
    try {
      await api.delete('/auth/me');
      await logout();
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setDeleteError(typeof data.message === 'string' ? data.message : 'Failed to delete account');
      } else {
        setDeleteError('Failed to delete account');
      }
    } finally {
      setDeleteLoading(false);
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
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Account Settings</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{user.nickname}</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Change Password */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600">{passwordSuccess}</p>
            )}
            <button
              type="submit"
              disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {passwordLoading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </section>

        {/* Delete Account */}
        <section className="rounded-lg border border-red-300 dark:border-red-800 p-6">
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Delete Account</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This action is permanent and cannot be undone. All your data will be removed.
          </p>
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div>
              <label htmlFor="delete-confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>
            {deleteError && (
              <p className="text-sm text-red-600">{deleteError}</p>
            )}
            <button
              type="submit"
              disabled={deleteLoading || deleteConfirm !== 'DELETE'}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete My Account'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
