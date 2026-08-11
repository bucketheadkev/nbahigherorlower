'use client';

import { useMemo } from 'react';
import {
  BILLION_GOAL,
  formatDollars,
  formatDollarsExact,
} from '@/lib/tradeup/billionDollar';
import { getBillionRuns } from '@/lib/tradeup/billionRuns';
import {
  getBestFourPlayerSum,
  getBestRosterValue,
} from '@/lib/tradeup/storage';

interface ChallengesScreenProps {
  personalBest?: number;
  bestFourPlayerSum?: number;
}

interface ChallengeDef {
  id: string;
  title: string;
  blurb: string;
  progress: number;
  goal: number;
}

export function ChallengesScreen({
  personalBest,
  bestFourPlayerSum,
}: ChallengesScreenProps) {
  const pb = personalBest ?? getBestRosterValue();
  const four = bestFourPlayerSum ?? getBestFourPlayerSum();
  const billionRuns = useMemo(() => getBillionRuns().length, []);

  const challenges = useMemo<ChallengeDef[]>(() => {
    return [
      {
        id: 'hit-1b',
        title: 'Billion Club',
        blurb: 'Finish a Classic run worth $1,000,000,000 or more.',
        progress: Math.min(pb, BILLION_GOAL),
        goal: BILLION_GOAL,
      },
      {
        id: 'hit-1-05b',
        title: 'Over the Top',
        blurb: 'Build a five worth $1,050,000,000 or more.',
        progress: Math.min(pb, 1_050_000_000),
        goal: 1_050_000_000,
      },
      {
        id: 'hit-1-1b',
        title: 'Market Peak',
        blurb: 'Push a finished roster to $1,100,000,000 or more.',
        progress: Math.min(pb, 1_100_000_000),
        goal: 1_100_000_000,
      },
      {
        id: 'hit-1-25b',
        title: 'Supermax Five',
        blurb: 'Reach $1,250,000,000 or more on a single run.',
        progress: Math.min(pb, 1_250_000_000),
        goal: 1_250_000_000,
      },
      {
        id: 'hit-1-5b',
        title: 'Dynasty Cap',
        blurb: 'Post $1,500,000,000 or more with your starting five.',
        progress: Math.min(pb, 1_500_000_000),
        goal: 1_500_000_000,
      },
      {
        id: 'four-man-billion',
        title: 'Four-Man Fortune',
        blurb: 'Have your top four players alone combine for $1,000,000,000+.',
        progress: Math.min(four, BILLION_GOAL),
        goal: BILLION_GOAL,
      },
      {
        id: 'three-billion-runs',
        title: 'Repeat Billionaire',
        blurb: 'Complete 3 separate Classic runs at $1,000,000,000 or more.',
        progress: Math.min(billionRuns, 3),
        goal: 3,
      },
      {
        id: 'five-billion-runs',
        title: 'Board Room Regular',
        blurb: 'Bank 5 billion-dollar squads in My Runs.',
        progress: Math.min(billionRuns, 5),
        goal: 5,
      },
    ];
  }, [billionRuns, four, pb]);

  const doneCount = challenges.filter((c) => c.progress >= c.goal).length;

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">SEASON GOALS</p>
        <h1 className="oneb-hub__title">Challenges</h1>
        <p className="oneb-hub__meta">
          {doneCount}/{challenges.length} complete
        </p>
      </header>

      <main className="oneb-hub__scroll">
        <p className="oneb-hub__intro">
          Hit billion-dollar milestones with your five. Progress tracks your best Classic
          roster value.
        </p>

        <ul className="challenges-list oneb-challenges">
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
                  aria-label={`${challenge.title}: ${formatDollarsExact(challenge.progress)} of goal`}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
