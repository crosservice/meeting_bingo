import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">Meeting Bingo</h1>
      <p className="mt-4 text-lg text-gray-600">Real-time bingo games for live meetings.</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="rounded border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Create Account
        </Link>
      </div>
    </main>
  );
}
