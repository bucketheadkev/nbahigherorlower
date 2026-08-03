'use client';

import { useMemo } from 'react';
import { BILLION_GOAL, formatDollars } from '@/lib/tradeup/billionDollar';
import {
  getBestFourPlayerSum,
  getBestRosterValue,
  getBestWorldRank,
} from '@/lib/tradeup/storage';
import { HomeBackground } from './home/HomeBackground';
import { TradeUpLogo } from './TradeUpLogo';

interface ChallengesScreenProps {
  /** Optional refresh token from parent after a run. */
  personalBest?: number;
  bestWorldRank?: number;
  bestFourPlayerSum?: number;
}

interface ChallengeDef {
  id: string;
  title: string;
  blurb: string;
  progress: number;
  goal: number;
  reward: string;
}

function rankProgress(bestRank: number, target: number): number {
  if (bestRank <= 0) return 0;
  return bestRank <= target ? 1 : 0;
}

export function ChallengesScreen({
  personalBest,
  bestWorldRank,
  bestFourPlayerSum,
}: ChallengesScreenProps) {
  const pb = personalBest ?? getBestRosterValue();
  const rank = bestWorldRank ?? getBestWorldRank();
  const four = bestFourPlayerSum ?? getBestFourPlayerSum();

  const challenges = useMemo<ChallengeDef[]>(() => {
    return [
      {
        id: 'billion-club',
        title: 'Billion Dollar Club',
        blurb: `Surpass ${formatDollars(BILLION_GOAL)} in team value on a finished run.`,
        progress: Math.min(pb, BILLION_GOAL),
        goal: BILLION_GOAL,
        reward: 'Dynasty crest',
      },
      {
        id: 'four-man-billion',
        title: 'Four-Man Fortune',
        blurb: `Surpass ${formatDollars(BILLION_GOAL)} using only your top four players' combined value.`,
        progress: Math.min(four, BILLION_GOAL),
        goal: BILLION_GOAL,
        reward: 'Assay vault skin',
      },
      {
        id: 'top-100',
        title: 'World Top 100',
        blurb: 'Enter the top 100 on the global leaderboard.',
        progress: rankProgress(rank, 100),
        goal: 1,
        reward: '100-club badge',
      },
      {
        id: 'top-20',
        title: 'World Top 20',
        blurb: 'Climb into the top 20 GMs worldwide.',
        progress: rankProgress(rank, 20),
        goal: 1,
        reward: 'Elite board flair',
      },
      {
        id: 'top-5',
        title: 'Featured Five',
        blurb: 'Break into the top 5 on the leaderboard.',
        progress: rankProgress(rank, 5),
        goal: 1,
        reward: 'Featured rival slot',
      },
      {
        id: 'world-number-one',
        title: 'Number One',
        blurb: 'Claim #1 ranked in the world.',
        progress: rankProgress(rank, 1),
        goal: 1,
        reward: 'Global crown',
      },
    ];
  }, [four, pb, rank]);

  const doneCount = challenges.filter((c) => c.progress >= c.goal).length;

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub">
      <HomeBackground />

      <header className="hub-screen-header">
        <TradeUpLogo size="xs" />
        <div className="hub-screen-header__copy">
          <p className="hub-screen-header__eyebrow">Season Goals</p>
          <h1 className="hub-screen-header__title">Challenges</h1>
        </div>
        <p className="hub-screen-header__meta">
          {doneCount}/{challenges.length}
        </p>
      </header>

      <main className="hub-scroll challenges-main">
        <p className="challenges-intro">
          Clear billion-dollar milestones and climb the world board. Progress saves with
          your personal best.
        </p>

        <ul className="challenges-list">
          {challenges.map((challenge) => {
            const complete = challenge.progress >= challenge.goal;
            const pct = Math.min(
              100,
              Math.round((challenge.progress / Math.max(1, challenge.goal)) * 100),
            );
            const isMoney = challenge.goal >= 1_000_000;
            return (
              <li
                key={challenge.id}
                className={`challenges-card${complete ? ' is-complete' : ''}`}
              >
                <div className="challenges-card__top">
                  <h2>{challenge.title}</h2>
                  <span>
                    {complete
                      ? 'Done'
                      : isMoney
                        ? `${formatDollars(challenge.progress)} / ${formatDollars(challenge.goal)}`
                        : `${challenge.progress}/${challenge.goal}`}
                  </span>
                </div>
                <p>{challenge.blurb}</p>
                <div
                  className="challenges-card__bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="challenges-card__reward">Reward · {challenge.reward}</p>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
