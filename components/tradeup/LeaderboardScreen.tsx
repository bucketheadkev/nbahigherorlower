'use client';

import { useMemo } from 'react';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getBestRosterValue } from '@/lib/tradeup/storage';
import {
  FEATURED_LEADERS,
  WORLD_POOL_SIZE,
  buildLeaderboardRows,
  formatWorldRank,
  getWorldRank,
} from '@/lib/tradeup/worldLeaderboard';
import { HomeBackground } from './home/HomeBackground';
import { TradeUpLogo } from './TradeUpLogo';

interface LeaderboardScreenProps {
  personalBest?: number;
}

export function LeaderboardScreen({ personalBest }: LeaderboardScreenProps) {
  const pb = personalBest ?? (typeof window !== 'undefined' ? getBestRosterValue() : 0);
  const rank = useMemo(() => (pb > 0 ? getWorldRank(pb) : null), [pb]);
  const rows = useMemo(() => buildLeaderboardRows(pb), [pb]);
  const chasing = FEATURED_LEADERS[FEATURED_LEADERS.length - 1]!;

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub">
      <HomeBackground />

      <header className="hub-screen-header">
        <TradeUpLogo size="xs" />
        <div className="hub-screen-header__copy">
          <p className="hub-screen-header__eyebrow">Global Board</p>
          <h1 className="hub-screen-header__title">Leaderboard</h1>
        </div>
        <p className="hub-screen-header__meta">Live</p>
      </header>

      <main className="hub-scroll leaderboard-main">
        <section className="leaderboard-standings" aria-label="Your world rank">
          <div className="leaderboard-standings__top">
            <div>
              <p className="leaderboard-standings__eyebrow">Your standing</p>
              <h2 className="leaderboard-standings__rank">
                {rank ? formatWorldRank(rank) : '—'}
              </h2>
            </div>
            <div className="leaderboard-standings__chip">
              {WORLD_POOL_SIZE.toLocaleString('en-US')} GMs
            </div>
          </div>
          {rank ? (
            <p className="leaderboard-standings__blurb">
              Best roster · {formatDollarsExact(pb)}
            </p>
          ) : (
            <p className="leaderboard-standings__blurb">
              Finish a run to claim your world rank. Chase{' '}
              {formatDollarsExact(chasing.value)} to crack the featured five.
            </p>
          )}
          {rank ? (
            <div
              className="leaderboard-standings__bar"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={WORLD_POOL_SIZE}
              aria-valuenow={rank}
              aria-label="World rank position"
            >
              <span
                style={{
                  width: `${Math.max(
                    6,
                    Math.round(
                      ((WORLD_POOL_SIZE - rank + 1) / WORLD_POOL_SIZE) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          ) : (
            <div className="leaderboard-standings__bar is-empty" aria-hidden>
              <span style={{ width: '8%' }} />
            </div>
          )}
        </section>

        <p className="leaderboard-intro">
          Hit $1B, then keep climbing. The featured board is how you stay in the chase.
        </p>

        <ul className="leaderboard-board">
          {rows.map((entry) => {
            const place = getWorldRank(entry.value);
            return (
              <li
                key={entry.id}
                className={`leaderboard-card${entry.isYou ? ' is-you' : ''}${
                  place === 1 ? ' is-first' : ''
                }`}
              >
                <span className="leaderboard-card__place" aria-label={`Rank ${place}`}>
                  {place}
                </span>
                <div className="leaderboard-card__body">
                  <div className="leaderboard-card__name-row">
                    <strong>{entry.name}</strong>
                    {entry.isYou ? (
                      <em className="leaderboard-card__you">You</em>
                    ) : null}
                  </div>
                  <p className="leaderboard-card__meta">
                    {place === 1
                      ? 'World #1 · Featured rival'
                      : place <= 5
                        ? 'Featured board'
                        : 'Global field'}
                  </p>
                </div>
                <span className="leaderboard-card__value">
                  {formatDollarsExact(entry.value)}
                </span>
              </li>
            );
          })}
        </ul>

        {pb > 0 && rank != null && rank > 5 ? (
          <section className="leaderboard-card leaderboard-card--you-offboard" aria-label="Your rank outside top five">
            <span className="leaderboard-card__place">{formatWorldRank(rank)}</span>
            <div className="leaderboard-card__body">
              <div className="leaderboard-card__name-row">
                <strong>You</strong>
                <em className="leaderboard-card__you">Climbing</em>
              </div>
              <p className="leaderboard-card__meta">
                Keep stacking value to crack the featured board.
              </p>
            </div>
            <span className="leaderboard-card__value">{formatDollarsExact(pb)}</span>
          </section>
        ) : null}
      </main>
    </div>
  );
}
