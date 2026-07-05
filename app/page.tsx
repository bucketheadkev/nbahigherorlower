'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { Leaderboard } from '@/components/Leaderboard';
import { UsernameSetup } from '@/components/UsernameSetup';
import { CATEGORY_COUNT } from '@/lib/categoryCycle';
import { formatXHandle, getXUsername } from '@/lib/xUsername';
import { getBestStreak } from '@/lib/storage';
import { getGamePath } from '@/lib/gameModes';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const router = useRouter();
  const [bestStreak, setBestStreak] = useState(0);
  const [xUsername, setXUsername] = useState('');
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  useEffect(() => {
    setBestStreak(getBestStreak());
    setXUsername(getXUsername());
  }, []);

  const startGame = () => {
    router.push(getGamePath());
  };

  return (
    <main className="page-bg min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-2 sm:px-6">
        <section className="hero-shell">
          <div className="hero-glow" aria-hidden />

          <div className="hero-grid">
            <div className="hero-copy">
              <div className="hero-badge">NBA stats challenge</div>
              <h1 className="title-display hero-title">
                NBA <span className="text-gradient">Higher or Lower</span>
              </h1>
              <p className="hero-subtitle">
                Thirteen categories in order — one minute per question. Guess right, build your streak,
                and climb the global leaderboard.
              </p>

              <div className="hero-actions">
                <button type="button" onClick={startGame} className="btn-accent btn-accent-lg">
                  Start Game
                </button>
                {xUsername ? (
                  <p className="text-sm text-white/50">
                    Competing as <span className="font-semibold text-white">{formatXHandle(xUsername)}</span>
                  </p>
                ) : null}
              </div>

              <div className="hero-stats">
                <div className="hero-stat-card">
                  <p className="hero-stat-label">Your best streak</p>
                  <p className="hero-stat-value">{bestStreak}</p>
                </div>
                <div className="hero-stat-card">
                  <p className="hero-stat-label">Categories</p>
                  <p className="hero-stat-value">{CATEGORY_COUNT}</p>
                </div>
                <div className="hero-stat-card">
                  <p className="hero-stat-label">Players</p>
                  <p className="hero-stat-value">60+</p>
                </div>
              </div>
            </div>

            <div className="hero-side">
              <UsernameSetup
                onSaved={(username) => {
                  setXUsername(username);
                  setLeaderboardKey((key) => key + 1);
                }}
              />
            </div>
          </div>
        </section>

        <section className="modes-section">
          <Leaderboard refreshKey={leaderboardKey} limit={50} showAll />
        </section>
      </div>
    </main>
  );
}
