'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket, useSocketEvent } from '@/lib/socket';
import ThemeToggle from '@/components/theme-toggle';

interface ChatMsg {
  id: string;
  meeting_id: string;
  user_id: string;
  nickname: string;
  message_text: string;
  moderation_status: string;
  created_at: string;
}

interface Cell {
  id: string;
  row_index: number;
  col_index: number;
  phrase_text: string;
  is_free_square: boolean;
  current_count: number;
}

interface GameInfo {
  id: string;
  status: string;
  winner_user_id: string | null;
}

interface RankingEntry {
  rank: number;
  user_id: string;
  nickname: string;
  marks_until_win: number;
}

function generateEventId(): string {
  return crypto.randomUUID();
}

export default function PlayPage() {
  const { meetingId, gameId } = useParams() as { meetingId: string; gameId: string };
  const { user } = useAuth();
  const { joinMeeting, leaveMeeting, status: socketStatus } = useSocket();

  const [chatEnabled, setChatEnabled] = useState(true);
  const [viewingResults, setViewingResults] = useState(false);
  const [resultsWinnerNickname, setResultsWinnerNickname] = useState<string | null>(null);
  const [resultsWinningCard, setResultsWinningCard] = useState<Cell[]>([]);
  const [game, setGame] = useState<GameInfo | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [winnerNickname, setWinnerNickname] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ user_id: string; nickname: string; role: string; access_status: string }[]>([]);
  const [kicked, setKicked] = useState(false);

  const fetchRankings = useCallback(async () => {
    try {
      const res = await api.get<{ rankings: RankingEntry[] }>(`/games/${gameId}/rankings`);
      setRankings(res.rankings);
    } catch {
      // Rankings may fail if game just started
    }
  }, [gameId]);

  useEffect(() => {
    async function load() {
      try {
        const [gameRes, cardRes, chatRes, meetingRes, participantsRes] = await Promise.all([
          api.get<{ game: GameInfo }>(`/games/${gameId}`),
          api.get<{ card: { cells: Cell[] } }>(`/games/${gameId}/cards/me`).catch(() => null),
          api.get<{ messages: ChatMsg[] }>(`/meetings/${meetingId}/chat?limit=50`).catch(() => ({ messages: [] })),
          api.get<{ meeting: { chat_enabled: boolean; owner_user_id: string } }>(`/meetings/${meetingId}`).catch(() => ({ meeting: { chat_enabled: true, owner_user_id: '' } })),
          api.get<{ participants: { user_id: string; nickname: string; role: string; access_status: string }[] }>(`/meetings/${meetingId}/participants`).catch(() => ({ participants: [] })),
        ]);
        setGame(gameRes.game);
        setChatMessages(chatRes.messages);
        setChatEnabled(meetingRes.meeting.chat_enabled);
        setOwnerUserId(meetingRes.meeting.owner_user_id);
        setParticipants(participantsRes.participants);

        if (cardRes?.card) {
          setCells(cardRes.card.cells);
          await fetchRankings();

          if (gameRes.game.winner_user_id) {
            const winner = await api.get<{ rankings: RankingEntry[] }>(`/games/${gameId}/rankings`)
              .then((r) => r.rankings.find((e) => e.user_id === gameRes.game.winner_user_id));
            if (winner) setWinnerNickname(winner.nickname);
          }
        } else {
          // No card — show results view for finished games
          setViewingResults(true);
          try {
            const results = await api.get<{
              game: GameInfo;
              winner_nickname: string | null;
              winning_card: Cell[] | null;
            }>(`/games/${gameId}/results`);
            if (results.winner_nickname) setResultsWinnerNickname(results.winner_nickname);
            if (results.winning_card) setResultsWinningCard(results.winning_card);
          } catch {
            // Results fetch failed
          }
          await fetchRankings();
        }
      } catch {
        // Handle error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gameId, fetchRankings]);

  // Join meeting room for real-time updates
  useEffect(() => {
    joinMeeting(meetingId);
    return () => leaveMeeting();
  }, [meetingId, joinMeeting, leaveMeeting]);

  // Listen for real-time ranking updates
  useSocketEvent<{ game_id: string; rankings: RankingEntry[] }>('ranking.updated', (data) => {
    if (data.game_id === gameId) {
      setRankings(data.rankings);
    }
  });



  // Listen for game won event
  useSocketEvent<{ game_id: string; winner_user_id: string }>('game.won', (data) => {
    if (data.game_id === gameId) {
      setGame((prev) => prev ? { ...prev, status: 'won', winner_user_id: data.winner_user_id } : prev);
      const winner = rankings.find((r) => r.user_id === data.winner_user_id);
      setWinnerNickname(winner?.nickname || (data.winner_user_id === user?.id ? 'You' : 'Someone'));
    }
  });

  // Listen for game status changes
  useSocketEvent<{ game_id: string; game: GameInfo }>('game.updated', (data) => {
    if (data.game_id === gameId && data.game) {
      setGame(data.game);
    }
  });

  // Listen for new chat messages
  useSocketEvent<ChatMsg>('chat.created', (msg) => {
    if (msg.meeting_id === meetingId) {
      setChatMessages((prev) => [...prev.slice(-99), msg]);
    }
  });

  // Listen for hidden chat messages
  useSocketEvent<{ message_id: string }>('chat.hidden', (data) => {
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === data.message_id ? { ...m, moderation_status: 'hidden', message_text: '[message hidden]' } : m,
      ),
    );
  });

  // Listen for participant revocation — immediately redirect
  useSocketEvent<{ meeting_id: string; user_id: string }>('participant.revoked', (data) => {
    if (data.meeting_id === meetingId && data.user_id === user?.id) {
      setKicked(true);
      // Force navigation after a brief moment so they see the message
      setTimeout(() => {
        window.location.href = '/dashboard?kicked=1';
      }, 3000);
    }
  });

  // Fallback: poll rankings every 5 seconds in case WS is disconnected
  useEffect(() => {
    if (!game || game.status !== 'active') return;
    if (socketStatus === 'connected') return; // WS handles it
    const interval = setInterval(fetchRankings, 5000);
    return () => clearInterval(interval);
  }, [game, fetchRankings, socketStatus]);

  async function handleIncrement(cellId: string) {
    if (!game || game.status !== 'active') return;
    if (pendingCells.has(cellId)) return;

    const clientEventId = generateEventId();

    // Optimistic update
    setCells((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, current_count: c.current_count + 1 } : c)),
    );
    setPendingCells((prev) => new Set(prev).add(cellId));

    try {
      const res = await api.post<{ cell: Cell | null; winner: string | null }>(
        `/games/${gameId}/cards/me/cells/${cellId}/increment`,
        { client_event_id: clientEventId },
      );

      if (res.cell) {
        setCells((prev) => prev.map((c) => (c.id === cellId ? { ...c, current_count: res.cell!.current_count } : c)));
      }

      if (res.winner) {
        setGame((prev) => prev ? { ...prev, status: 'won', winner_user_id: res.winner } : prev);
        setWinnerNickname(user?.nickname || 'You');
      }

      await fetchRankings();
    } catch {
      // Revert optimistic update
      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, current_count: Math.max(0, c.current_count - 1) } : c)),
      );
    } finally {
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
    }
  }

  async function handleDecrement(cellId: string) {
    if (!game || game.status !== 'active') return;
    if (pendingCells.has(cellId)) return;

    const cell = cells.find((c) => c.id === cellId);
    if (!cell || cell.current_count <= 0) return;

    const clientEventId = generateEventId();

    setCells((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, current_count: Math.max(0, c.current_count - 1) } : c)),
    );
    setPendingCells((prev) => new Set(prev).add(cellId));

    try {
      const res = await api.post<{ cell: Cell | null }>(
        `/games/${gameId}/cards/me/cells/${cellId}/decrement`,
        { client_event_id: clientEventId },
      );

      if (res.cell) {
        setCells((prev) => prev.map((c) => (c.id === cellId ? { ...c, current_count: res.cell!.current_count } : c)));
      }

      await fetchRankings();
    } catch {
      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, current_count: c.current_count + 1 } : c)),
      );
    } finally {
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
    }
  }

  async function handleSendChat() {
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);
    setChatError('');
    try {
      await api.post(`/meetings/${meetingId}/chat`, {
        message_text: chatInput.trim(),
        game_id: gameId,
      });
      setChatInput('');
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setChatError(typeof data?.message === 'string' ? data.message : 'Failed to send');
    } finally {
      setChatSending(false);
    }
  }

  const isOwner = user && ownerUserId && user.id === ownerUserId;

  async function handleHideMessage(msgId: string) {
    try {
      await api.post(`/chat/${msgId}/hide`);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, moderation_status: 'hidden', message_text: '[message hidden]' } : m,
        ),
      );
    } catch {
      // Ignore hide errors
    }
  }

  async function handleKick(targetUserId: string, nickname: string) {
    if (!confirm(`Kick ${nickname} from this meeting?`)) return;
    try {
      await api.post(`/meetings/${meetingId}/participants/${targetUserId}/revoke`);
      setRankings((prev) => prev.filter((r) => r.user_id !== targetUserId));
      setParticipants((prev) =>
        prev.map((p) => (p.user_id === targetUserId ? { ...p, access_status: 'revoked' } : p)),
      );
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string } })?.data;
      alert(`Failed to kick: ${data?.message || (err instanceof Error ? err.message : 'Unknown error')}`);
    }
  }

  async function handleRestore(targetUserId: string) {
    try {
      await api.post(`/meetings/${meetingId}/participants/${targetUserId}/unrevoke`);
      setParticipants((prev) =>
        prev.map((p) => (p.user_id === targetUserId ? { ...p, access_status: 'active' } : p)),
      );
      await fetchRankings();
    } catch (err) {
      alert(`Failed to restore: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (kicked) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="fixed inset-0 bg-black/50 z-40" />
        <div className="relative z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm mx-auto p-8 text-center">
          <div className="text-5xl mb-4">👋</div>
          <h1 className="text-2xl font-bold mb-2">lol you got kicked</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">
            The meeting owner removed you. Better luck next time!
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">Redirecting to dashboard in 3 seconds...</p>
          <a href="/dashboard" className="inline-block rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            Go Now
          </a>
        </div>
      </main>
    );
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center"><p className="text-gray-500">Loading game...</p></main>;
  }

  if (!game) {
    return <main className="flex min-h-screen items-center justify-center"><p className="text-red-600">Game not found</p></main>;
  }

  // Results view for users who weren't in this game
  if (viewingResults) {
    const winGrid: (Cell | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(null));
    for (const cell of resultsWinningCard) {
      winGrid[cell.row_index][cell.col_index] = cell;
    }

    return (
      <main className="min-h-screen p-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <Link href={`/meetings/${meetingId}`} className="text-sm text-blue-600 hover:underline">&larr; Meeting</Link>
            <ThemeToggle />
          </div>

          <div className="text-center mb-6">
            <span className={`text-sm px-3 py-1 rounded ${
              game.status === 'won' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
              game.status === 'closed' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
              'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            }`}>Game {game.status}</span>
          </div>

          {resultsWinnerNickname && (
            <div className="mb-6 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600 p-6 text-center">
              <p className="text-2xl font-bold mb-1">Winner: {resultsWinnerNickname}</p>
            </div>
          )}

          {resultsWinningCard.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3 text-center">Winning Card</h2>
              <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
                {winGrid.map((row, ri) =>
                  row.map((cell, ci) => {
                    if (!cell) return <div key={`${ri}-${ci}`} className="aspect-square bg-gray-100 dark:bg-gray-700 rounded" />;
                    const isMarked = cell.current_count > 0;
                    return (
                      <div
                        key={`${ri}-${ci}`}
                        className={`flex flex-col items-center justify-center rounded border-2 p-1 text-center
                          ${cell.is_free_square ? 'bg-purple-100 border-purple-300 dark:bg-purple-900 dark:border-purple-600' :
                            isMarked ? 'bg-green-100 border-green-400 dark:bg-green-900 dark:border-green-600' :
                            'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-600'}
                        `}
                        style={{ aspectRatio: '1' }}
                      >
                        <span className="text-[10px] font-medium leading-tight line-clamp-3">{cell.phrase_text}</span>
                        {!cell.is_free_square && <span className="text-[10px] text-gray-500">{cell.current_count}</span>}
                        {cell.is_free_square && <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">FREE</span>}
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          )}

          {/* Rankings */}
          {rankings.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-center">Final Rankings</h2>
              <ul className="space-y-1 max-w-md mx-auto">
                {rankings.map((r) => (
                  <li key={r.user_id} className={`rounded border px-3 py-2 text-sm
                    ${r.marks_until_win === 0 ? 'font-bold text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-600' : 'border-gray-200 dark:border-gray-700'}
                  `}>
                    <span className="font-semibold">#{r.rank}</span>{' '}
                    <span>{r.nickname}</span>
                    <span className="float-right text-gray-500 dark:text-gray-400">
                      {r.marks_until_win === 0 ? 'BINGO!' : `${r.marks_until_win} away`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    );
  }

  // Build 5x5 grid
  const grid: (Cell | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const cell of cells) {
    grid[cell.row_index][cell.col_index] = cell;
  }

  const isGameOver = game.status === 'won' || game.status === 'closed' || game.status === 'expired';
  const isWinner = game.winner_user_id === user?.id;

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto max-w-6xl flex gap-6">
        {/* Bingo Card */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            {isOwner ? (
              <Link href={`/meetings/${meetingId}/game`} className="text-sm text-blue-600 hover:underline">&larr; Game Control</Link>
            ) : (
              <Link href={`/meetings/${meetingId}`} className="text-sm text-blue-600 hover:underline">&larr; Meeting</Link>
            )}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <span className={`w-2 h-2 rounded-full ${
                socketStatus === 'connected' ? 'bg-green-500' :
                socketStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`} title={socketStatus} />
              <span className={`text-sm px-3 py-1 rounded ${
                game.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                game.status === 'won' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>{game.status}</span>
            </div>
          </div>

          {/* Winner announcement */}
          {game.status === 'won' && (
            <div className={`mb-4 rounded-lg p-4 text-center ${isWinner ? 'bg-yellow-100 border-2 border-yellow-400 dark:bg-yellow-900/50 dark:border-yellow-600' : 'bg-blue-50 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-700'}`}>
              <p className="text-xl font-bold">{isWinner ? 'You won!' : `${winnerNickname} wins!`}</p>
            </div>
          )}

          {/* Gameplay warning */}
          <div className="mb-3 rounded bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
            Phrase selections, counts, timestamps, and participation activity are logged for gameplay, ranking, analytics, and export.
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-5 gap-1">
            {grid.map((row, ri) =>
              row.map((cell, ci) => {
                if (!cell) return <div key={`${ri}-${ci}`} className="aspect-square bg-gray-100 dark:bg-gray-700 rounded" />;

                const isMarked = cell.current_count > 0;
                const isPending = pendingCells.has(cell.id);

                return (
                  <div
                    key={cell.id}
                    className={`relative flex flex-col items-center justify-center rounded border-2 p-1 text-center transition-colors
                      ${cell.is_free_square ? 'bg-purple-100 border-purple-300 dark:bg-purple-900 dark:border-purple-600' :
                        isMarked ? 'bg-green-100 border-green-400 dark:bg-green-900 dark:border-green-600' :
                        'bg-white border-gray-200 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:border-gray-500'}
                      ${isPending ? 'opacity-70' : ''}
                    `}
                    style={{ aspectRatio: '1' }}
                  >
                    <span className="text-xs font-medium leading-tight line-clamp-3 mb-1">
                      {cell.phrase_text}
                    </span>

                    {!cell.is_free_square && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDecrement(cell.id)}
                          disabled={isGameOver || cell.current_count <= 0}
                          className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{cell.current_count}</span>
                        <button
                          onClick={() => handleIncrement(cell.id)}
                          disabled={isGameOver}
                          className="w-6 h-6 rounded bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    )}

                    {cell.is_free_square && (
                      <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold">AUTO</span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Sidebar: Rankings + Chat */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          {/* Rankings (filtered: exclude revoked) */}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Rankings</h2>
            {(() => {
              const revokedIds = new Set(participants.filter((p) => p.access_status === 'revoked').map((p) => p.user_id));
              const activeRankings = rankings.filter((r) => !revokedIds.has(r.user_id));
              return activeRankings.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No rankings yet.</p>
              ) : (
                <ul className="space-y-1">
                  {activeRankings.map((r, i) => (
                    <li
                      key={r.user_id}
                      className={`rounded border px-2 py-1.5 text-xs
                        ${r.user_id === user?.id ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30' : 'border-gray-100 dark:border-gray-700'}
                        ${r.marks_until_win === 0 ? 'font-bold text-yellow-700 dark:text-yellow-400' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">#{i + 1}</span>{' '}
                          <span>{r.nickname}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500 dark:text-gray-400">
                            {r.marks_until_win === 0 ? 'BINGO!' : `${r.marks_until_win} to go`}
                          </span>
                          {isOwner && r.user_id !== user?.id && (
                            <button
                              onClick={() => handleKick(r.user_id, r.nickname)}
                              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-[10px] font-medium ml-1"
                              title={`Kick ${r.nickname}`}
                            >
                              Kick
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>

          {/* Participants panel (owner only) */}
          {isOwner && participants.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Participants</h2>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {participants
                  .filter((p) => p.role !== 'owner')
                  .map((p) => (
                    <li key={p.user_id} className="flex items-center justify-between rounded border border-gray-100 dark:border-gray-700 px-2 py-1 text-xs">
                      <div>
                        <span className="font-medium">{p.nickname}</span>
                        {p.access_status === 'revoked' && (
                          <span className="ml-1 text-red-500 text-[10px]">kicked</span>
                        )}
                      </div>
                      {p.access_status === 'active' ? (
                        <button
                          onClick={() => handleKick(p.user_id, p.nickname)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 text-[10px] font-medium"
                        >
                          Kick
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(p.user_id)}
                          className="text-green-600 hover:text-green-700 dark:text-green-400 text-[10px] font-medium"
                        >
                          Restore
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Chat */}
          {chatEnabled ? (
            <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" style={{ height: '350px' }}>
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-semibold">Chat</h2>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-xs">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex items-start justify-between gap-1 ${msg.moderation_status === 'hidden' ? 'opacity-50' : ''}`}>
                    <div>
                      <span className="font-semibold">{msg.nickname}: </span>
                      <span>{msg.message_text}</span>
                    </div>
                    {isOwner && msg.moderation_status !== 'hidden' && (
                      <button
                        onClick={() => handleHideMessage(msg.id)}
                        className="shrink-0 text-gray-400 hover:text-red-500 text-[10px] leading-none mt-0.5"
                        title="Hide message"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                {chatMessages.length === 0 && (
                  <p className="text-gray-400 text-center py-4">No messages yet</p>
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700">
                <div className="px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-[10px] text-amber-700 dark:text-amber-400">
                  Do not post confidential or personal information. Messages are logged and may be exported.
                </div>
                {chatError && (
                  <div className="px-2 py-1 bg-red-50 dark:bg-red-900/30 text-[10px] text-red-600 dark:text-red-400">{chatError}</div>
                )}
                <div className="flex gap-1 p-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                    placeholder="Type a message..."
                    maxLength={1000}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={chatSending || !chatInput.trim()}
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Chat is disabled for this meeting.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
