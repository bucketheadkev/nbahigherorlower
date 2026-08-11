'use client';

import { useMemo } from 'react';
import type { ChampionshipRing } from '@/lib/tradeup/achievements';
import { ChampionshipRingVisual } from './ChampionshipRingVisual';
import { HomeBackground } from './home/HomeBackground';
import { BallionWordmark } from './BallionWordmark';

interface AchievementsLockerProps {
  rings: ChampionshipRing[];
}

function formatEarnedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function AchievementsLocker({ rings }: AchievementsLockerProps) {
  const count = rings.length;
  const empty = count === 0;

  const subtitle = useMemo(() => {
    if (empty) return 'Win the Finals to earn your first championship ring.';
    if (count === 1) return '1 championship locked in.';
    return `${count} championships locked in.`;
  }, [count, empty]);

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub achievements-shell">
      <HomeBackground />

      <header className="hub-screen-header">
        <BallionWordmark />
        <div className="hub-screen-header__copy">
          <p className="hub-screen-header__eyebrow">Trophy Case</p>
          <h1 className="hub-screen-header__title">Championships</h1>
        </div>
        <p className="hub-screen-header__meta">
          {count} {count === 1 ? 'ring' : 'rings'}
        </p>
      </header>

      <main className="achievements-locker hub-scroll">
        <section className="achievements-hero">
          <ChampionshipRingVisual size="lg" />
          <h2 className="achievements-hero__title">Ring Locker</h2>
          <p className="achievements-hero__sub">{subtitle}</p>
        </section>

        {empty ? (
          <section className="achievements-empty" aria-live="polite">
            <p>No championship rings yet.</p>
            <p>Make the playoffs and win the NBA Finals to unlock one.</p>
          </section>
        ) : (
          <section className="achievements-grid" aria-label="Championship rings">
            {rings.map((ring, index) => (
              <article key={ring.id} className="achievements-ring-card">
                <div className="achievements-ring-card__visual">
                  <ChampionshipRingVisual size="md" />
                  <span className="achievements-ring-card__num">#{count - index}</span>
                </div>
                <div className="achievements-ring-card__body">
                  <h2>
                    {ring.kind === 'nba_champion' ? 'NBA Champions' : 'Perfect Season'}
                  </h2>
                  <p className="achievements-ring-card__record">
                    {ring.wins}–{ring.losses}
                  </p>
                  <p className="achievements-ring-card__date">{formatEarnedAt(ring.earnedAt)}</p>
                  {ring.path && ring.path.length > 0 ? (
                    <p className="achievements-ring-card__path">
                      Beat {ring.path.join(' · ')}
                    </p>
                  ) : null}
                  <ul className="achievements-ring-card__lineup">
                    {ring.lineup.map((name) => (
                      <li key={`${ring.id}-${name}`}>{name}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
