'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import ThemeToggle from '@/components/theme-toggle';

interface PhraseSet { id: string; name: string; }
interface Ruleset { id: string; name: string; }
interface Game { id: string; status: string; started_at: string | null; winner_user_id: string | null; }

export default function GameControlPage() {
  const { meetingId } = useParams() as { meetingId: string };
  const [phraseSets, setPhraseSets] = useState<PhraseSet[]>([]);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [selectedRulesetId, setSelectedRulesetId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ phrase_sets: PhraseSet[] }>(`/meetings/${meetingId}/phrase-sets`),
      api.get<{ rulesets: Ruleset[] }>(`/meetings/${meetingId}/rulesets`),
      api.get<{ games: Game[] }>(`/meetings/${meetingId}/games`),
    ]).then(([psRes, rRes, gRes]) => {
      setPhraseSets(psRes.phrase_sets);
      setRulesets(rRes.rulesets);
      setGames(gRes.games);
      if (psRes.phrase_sets.length > 0) setSelectedSetId(psRes.phrase_sets[0].id);
      if (rRes.rulesets.length > 0) setSelectedRulesetId(rRes.rulesets[0].id);
    }).finally(() => setLoading(false));
  }, [meetingId]);

  async function handleCreateGame() {
    setError('');
    try {
      const res = await api.post<{ game: Game }>(`/meetings/${meetingId}/games`, {
        phrase_set_id: selectedSetId,
        ruleset_id: selectedRulesetId,
      });
      setGames((prev) => [res.game, ...prev]);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to create game');
      }
    }
  }

  async function handleStartGame(gameId: string) {
    setError('');
    try {
      const res = await api.post<{ game: Game }>(`/games/${gameId}/start`);
      if (res.game) setGames((prev) => prev.map((g) => (g.id === gameId ? res.game : g)));
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(typeof data.message === 'string' ? data.message : 'Failed to start game');
      }
    }
  }

  async function handleCloseGame(gameId: string) {
    const res = await api.post<{ game: Game }>(`/games/${gameId}/close`);
    if (res.game) setGames((prev) => prev.map((g) => (g.id === gameId ? res.game : g)));
  }

  if (loading) return <main className="p-8"><p className="text-gray-500">Loading...</p></main>;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <Link href={`/meetings/${meetingId}`} className="text-sm text-blue-600 hover:underline">&larr; Meeting</Link>
          <ThemeToggle />
        </div>
        <h1 className="mt-4 mb-6 text-2xl font-bold">Game Control</h1>

        {error && <div className="mb-4 rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

        {/* Create game */}
        <div className="mb-6 rounded border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="mb-3 font-semibold">Create New Game</h2>
          <div className="grid gap-3 sm:grid-cols-2 mb-3">
            <div>
              <label className="block text-xs font-medium mb-1">Phrase Set</label>
              <select value={selectedSetId} onChange={(e) => setSelectedSetId(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5 text-sm">
                {phraseSets.map((ps) => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Ruleset</label>
              <select value={selectedRulesetId} onChange={(e) => setSelectedRulesetId(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5 text-sm">
                {rulesets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleCreateGame} disabled={!selectedSetId || !selectedRulesetId}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            Create Game
          </button>
        </div>

        {/* Game list */}
        <h2 className="mb-3 font-semibold">Games</h2>
        {games.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No games yet.</p>
        ) : (
          <ul className="space-y-2">
            {games.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 p-3">
                <div>
                  <span className="text-sm font-medium">Game</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                    g.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    g.status === 'won' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                    g.status === 'draft' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  }`}>{g.status}</span>
                </div>
                <div className="flex gap-2">
                  {g.status === 'draft' && (
                    <button onClick={() => handleStartGame(g.id)}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">Start</button>
                  )}
                  {(g.status === 'active' || g.status === 'won') && (
                    <>
                      <Link href={`/meetings/${meetingId}/game/${g.id}`}
                        className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">Play</Link>
                      <button onClick={() => handleCloseGame(g.id)}
                        className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700">Close</button>
                    </>
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
