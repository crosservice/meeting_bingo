'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, ApiError } from '@/lib/auth-context';
import ThemeToggle from '@/components/theme-toggle';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      await register(nickname, password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string | Record<string, string[]> };
        if (typeof data.message === 'string') {
          setError(data.message);
        } else if (data.message && typeof data.message === 'object') {
          setFieldErrors(data.message);
        } else {
          setError('Registration failed');
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-center">Create Account</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="nickname" className="block text-sm font-medium mb-1">
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors.nickname && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.nickname[0]}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              3-30 characters. Letters, numbers, hyphens, and underscores only.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password[0]}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              8+ characters with uppercase, lowercase, and a number.
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 rounded bg-gray-50 p-3 text-xs text-gray-600">
          Your nickname, authentication activity, meeting participation, chat messages, and
          gameplay actions may be stored to operate the service, enforce security, and generate
          meeting/game exports for the meeting owner.
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
