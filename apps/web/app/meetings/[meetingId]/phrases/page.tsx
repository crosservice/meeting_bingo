'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import ThemeToggle from '@/components/theme-toggle';

interface PhraseSet { id: string; name: string; }
interface Phrase { id: string; text: string; normalized_text: string; is_active: boolean; }

export default function PhrasesPage() {
  const { meetingId } = useParams() as { meetingId: string };
  const [sets, setSets] = useState<PhraseSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [newSetName, setNewSetName] = useState('');
  const [newPhrase, setNewPhrase] = useState('');
  const [bulkPhrases, setBulkPhrases] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState('');
  const [importMeetingId, setImportMeetingId] = useState('');
  const [importSets, setImportSets] = useState<PhraseSet[]>([]);
  const [importSelectedSetId, setImportSelectedSetId] = useState('');
  const [importingFromMeeting, setImportingFromMeeting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ phrase_sets: PhraseSet[] }>(`/meetings/${meetingId}/phrase-sets`)
      .then((res) => {
        setSets(res.phrase_sets);
        if (res.phrase_sets.length > 0) setActiveSetId(res.phrase_sets[0].id);
      })
      .finally(() => setLoading(false));
  }, [meetingId]);

  useEffect(() => {
    if (!activeSetId) return;
    api.get<{ phrases: Phrase[] }>(`/phrase-sets/${activeSetId}/phrases`)
      .then((res) => setPhrases(res.phrases));
  }, [activeSetId]);

  async function handleCreateSet(e: FormEvent) {
    e.preventDefault();
    const res = await api.post<{ phrase_set: PhraseSet }>(`/meetings/${meetingId}/phrase-sets`, { name: newSetName });
    setSets((prev) => [res.phrase_set, ...prev]);
    setActiveSetId(res.phrase_set.id);
    setNewSetName('');
    setPhrases([]);
  }

  async function handleAddPhrase(e: FormEvent) {
    e.preventDefault();
    if (!activeSetId) return;
    setWarning('');
    const res = await api.post<{ phrase: Phrase; warning: string | null }>(`/phrase-sets/${activeSetId}/phrases`, { text: newPhrase });
    setPhrases((prev) => [...prev, res.phrase]);
    if (res.warning) setWarning(res.warning);
    setNewPhrase('');
  }

  async function handleBulkImport() {
    if (!activeSetId || !bulkPhrases.trim()) return;
    setBulkImporting(true);
    setBulkResult('');
    setWarning('');

    const items = bulkPhrases.split(',').map((s) => s.trim()).filter(Boolean);
    let imported = 0;
    const warnings: string[] = [];

    for (const text of items) {
      try {
        const res = await api.post<{ phrase: Phrase; warning: string | null }>(`/phrase-sets/${activeSetId}/phrases`, { text });
        setPhrases((prev) => [...prev, res.phrase]);
        imported++;
        if (res.warning) warnings.push(res.warning);
      } catch {
        // Skip duplicates or errors
      }
    }

    setBulkResult(`Imported ${imported} of ${items.length} phrases.`);
    if (warnings.length > 0) setWarning(warnings.join(' | '));
    setBulkPhrases('');
    setBulkImporting(false);
  }

  async function handleLoadImportSets() {
    if (!importMeetingId.trim()) return;
    setImportingFromMeeting(true);
    try {
      const res = await api.get<{ phrase_sets: PhraseSet[] }>(`/meetings/${importMeetingId.trim()}/phrase-sets`);
      setImportSets(res.phrase_sets);
      if (res.phrase_sets.length > 0) setImportSelectedSetId(res.phrase_sets[0].id);
      else setWarning('No phrase sets found in that meeting.');
    } catch {
      setWarning('Failed to load phrase sets from that meeting. Check the meeting ID.');
      setImportSets([]);
    } finally {
      setImportingFromMeeting(false);
    }
  }

  async function handleImportFromMeeting() {
    if (!activeSetId || !importSelectedSetId) return;
    setImportingFromMeeting(true);
    setBulkResult('');
    setWarning('');

    try {
      const res = await api.get<{ phrases: Phrase[] }>(`/phrase-sets/${importSelectedSetId}/phrases`);
      let imported = 0;
      const warnings: string[] = [];

      for (const phrase of res.phrases) {
        if (!phrase.is_active) continue;
        try {
          const addRes = await api.post<{ phrase: Phrase; warning: string | null }>(`/phrase-sets/${activeSetId}/phrases`, { text: phrase.text });
          setPhrases((prev) => [...prev, addRes.phrase]);
          imported++;
          if (addRes.warning) warnings.push(addRes.warning);
        } catch {
          // Skip duplicates or errors
        }
      }

      setBulkResult(`Imported ${imported} phrases from the selected set.`);
      if (warnings.length > 0) setWarning(warnings.join(' | '));
      setShowImportModal(false);
      setImportMeetingId('');
      setImportSets([]);
    } catch {
      setWarning('Failed to import phrases.');
    } finally {
      setImportingFromMeeting(false);
    }
  }

  async function handleDeletePhrase(phraseId: string) {
    await api.delete(`/phrases/${phraseId}`);
    setPhrases((prev) => prev.filter((p) => p.id !== phraseId));
  }

  if (loading) return <main className="p-8"><p className="text-gray-500">Loading...</p></main>;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <Link href={`/meetings/${meetingId}`} className="text-sm text-blue-600 hover:underline">&larr; Meeting</Link>
          <ThemeToggle />
        </div>
        <h1 className="mt-4 mb-6 text-2xl font-bold">Phrase Pool</h1>

        {/* Create new set */}
        <form onSubmit={handleCreateSet} className="mb-4 flex gap-2">
          <input
            type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)}
            placeholder="New phrase set name" required
            className="flex-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">Create Set</button>
        </form>

        {/* Set selector */}
        {sets.length > 0 && (
          <div className="mb-4 flex gap-2 flex-wrap">
            {sets.map((s) => (
              <button key={s.id} onClick={() => setActiveSetId(s.id)}
                className={`rounded px-3 py-1 text-sm ${activeSetId === s.id ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}

        {activeSetId && (
          <>
            {/* Add phrase */}
            <form onSubmit={handleAddPhrase} className="mb-4 flex gap-2">
              <input
                type="text" value={newPhrase} onChange={(e) => setNewPhrase(e.target.value)}
                placeholder="Add a phrase..." required
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm"
              />
              <button type="submit" className="rounded bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700">Add</button>
            </form>

            {/* Bulk import */}
            <div className="mb-4 space-y-2">
              <textarea
                value={bulkPhrases}
                onChange={(e) => setBulkPhrases(e.target.value)}
                placeholder="Paste comma-separated phrases..."
                rows={3}
                className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleBulkImport}
                  disabled={bulkImporting || !bulkPhrases.trim()}
                  className="rounded bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {bulkImporting ? 'Importing...' : 'Import'}
                </button>
                <button
                  onClick={() => setShowImportModal(!showImportModal)}
                  className="rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200 px-4 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Import from Meeting
                </button>
              </div>
            </div>

            {bulkResult && <div className="mb-3 rounded bg-green-50 dark:bg-green-900/30 p-2 text-sm text-green-700 dark:text-green-300">{bulkResult}</div>}

            {/* Import from another meeting */}
            {showImportModal && (
              <div className="mb-4 rounded border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <h3 className="text-sm font-semibold">Import from Another Meeting</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importMeetingId}
                    onChange={(e) => setImportMeetingId(e.target.value)}
                    placeholder="Meeting ID"
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={handleLoadImportSets}
                    disabled={importingFromMeeting || !importMeetingId.trim()}
                    className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Load Sets
                  </button>
                </div>
                {importSets.length > 0 && (
                  <div className="space-y-2">
                    <select
                      value={importSelectedSetId}
                      onChange={(e) => setImportSelectedSetId(e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5 text-sm"
                    >
                      {importSets.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleImportFromMeeting}
                      disabled={importingFromMeeting || !importSelectedSetId}
                      className="rounded bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {importingFromMeeting ? 'Importing...' : 'Import Phrases'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {warning && <div className="mb-3 rounded bg-amber-50 dark:bg-amber-900/30 p-2 text-sm text-amber-700 dark:text-amber-400">{warning}</div>}

            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">{phrases.filter((p) => p.is_active).length} active phrases (need 24-25 for a 5x5 board)</p>

            {/* Phrase list */}
            <ul className="space-y-1">
              {phrases.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded border border-gray-100 dark:border-gray-700 px-3 py-2">
                  <span className={`text-sm ${!p.is_active ? 'text-gray-400 line-through' : ''}`}>{p.text}</span>
                  <button onClick={() => handleDeletePhrase(p.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
