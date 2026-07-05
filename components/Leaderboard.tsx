'use client';

import { getModeLabel } from '@/lib/categories';
import { fetchLeaderboard, formatXHandle } from '@/lib/xUsername';
import type { GameMode } from '@/types/game';
import { useEffect, useState } from 'react';

interface LeaderboardRow {
  xUsername: string;
  bestStreak: number;
  mode: string;
}

function safeModeLabel(mode: string): string {
  try {
    return getModeLabel(mode as GameMode);
  } catch {
    return mode;
  }
}

interface LeaderboardProps {
  refreshKey?: number;
  limit?: number;
  showAll?: boolean;
}

export function Leaderboard({ refreshKey = 0, limit = 10, showAll = false }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(limit).then((rows) => {
      setEntries(rows);
      setLoading(false);
    });
  }, [refreshKey, limit]);

  return (
    <section id="leaderboard" className="leaderboard-panel">
      <div className="leaderboard-panel-header">
        <div>
          <p className="section-label">Global leaderboard</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            {showAll ? 'All players' : 'Top streaks'}
          </h2>
        </div>
        <span className="live-badge">Live</span>
      </div>

      <div className="leaderboard-list">
        {loading ? (
          <p className="py-8 text-center text-sm text-white/35">Loading scores…</p>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-white/45">No scores yet — be the first on the board.</p>
          </div>
        ) : (
          entries.map((entry, index) => (
            <div key={`${entry.xUsername}-${index}`} className="leaderboard-row">
              <span className={`rank-badge ${index < 3 ? `rank-${index + 1}` : ''}`}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{formatXHandle(entry.xUsername)}</p>
                <p className="truncate text-xs text-white/35">{safeModeLabel(entry.mode)}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums text-orange-400">{entry.bestStreak}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/30">streak</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
