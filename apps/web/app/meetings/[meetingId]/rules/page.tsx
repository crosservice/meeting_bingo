'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Ruleset {
  id: string;
  name: string;
  board_rows: number;
  board_cols: number;
  free_square_enabled: boolean;
  free_square_label: string;
  horizontal_enabled: boolean;
  vertical_enabled: boolean;
  diagonal_enabled: boolean;
  late_join_enabled: boolean;
}

export default function RulesPage() {
  const { meetingId } = useParams() as { meetingId: string };
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ rulesets: Ruleset[] }>(`/meetings/${meetingId}/rulesets`)
      .then((res) => setRulesets(res.rulesets))
      .finally(() => setLoading(false));
  }, [meetingId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const res = await api.post<{ ruleset: Ruleset }>(`/meetings/${meetingId}/rulesets`, {
      board_rows: 5,
      board_cols: 5,
    });
    setRulesets((prev) => [res.ruleset, ...prev]);
  }

  async function handleToggle(rulesetId: string, field: string, current: boolean) {
    const res = await api.patch<{ ruleset: Ruleset }>(`/rulesets/${rulesetId}`, { [field]: !current });
    if (res.ruleset) {
      setRulesets((prev) => prev.map((r) => (r.id === rulesetId ? res.ruleset : r)));
    }
  }

  if (loading) return <main className="p-8"><p className="text-gray-500">Loading...</p></main>;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-lg">
        <Link href={`/meetings/${meetingId}`} className="text-sm text-blue-600 hover:underline">&larr; Meeting</Link>
        <h1 className="mt-4 mb-6 text-2xl font-bold">Game Rules</h1>

        {rulesets.length === 0 ? (
          <div>
            <p className="mb-4 text-sm text-gray-500">No ruleset yet. Create a default one.</p>
            <button onClick={handleCreate}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              Create Default Ruleset
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {rulesets.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold mb-3">{r.name}</h2>
                <div className="text-sm text-gray-600 mb-3">Board: {r.board_rows}x{r.board_cols} (v1 fixed)</div>
                <div className="space-y-2">
                  {[
                    { field: 'free_square_enabled', label: 'Free Square' },
                    { field: 'horizontal_enabled', label: 'Horizontal Win' },
                    { field: 'vertical_enabled', label: 'Vertical Win' },
                    { field: 'diagonal_enabled', label: 'Diagonal Win' },
                    { field: 'late_join_enabled', label: 'Late Join' },
                  ].map(({ field, label }) => (
                    <label key={field} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(r as unknown as Record<string, boolean>)[field]}
                        onChange={() => handleToggle(r.id, field, (r as unknown as Record<string, boolean>)[field])}
                        className="rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
