'use client';

import { useMemo } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import {
  BILLION_GOAL,
  formatDollars,
  formatDollarsExact,
} from '@/lib/tradeup/billionDollar';
import { getBillionRuns } from '@/lib/tradeup/billionRuns';
import { statsFromBillionRuns } from '@/lib/tradeup/challengeStats';
import { getBestFourPlayerSum, getBestRosterValue } from '@/lib/tradeup/storage';

interface ChallengesScreenProps {
  personalBest?: number;
  bestFourPlayerSum?: number;
}

type ChallengeKind = 'money' | 'count';

interface ChallengeDef {
  id: string;
  progress: number;
  goal: number;
  kind: ChallengeKind;
}

function challengeKey(id: string, field: 'title' | 'blurb'): MessageKey {
  return `challenge.${id}.${field}` as MessageKey;
}

export function ChallengesScreen({
  personalBest,
  bestFourPlayerSum,
}: ChallengesScreenProps) {
  const { t } = useLocale();
  const pb = personalBest ?? getBestRosterValue();
  const four = bestFourPlayerSum ?? getBestFourPlayerSum();
  const billionRuns = useMemo(() => getBillionRuns(), []);
  const runStats = useMemo(() => statsFromBillionRuns(billionRuns), [billionRuns]);
  const billionRunCount = billionRuns.length;

  const challenges = useMemo<ChallengeDef[]>(() => {
    return [
      {
        id: 'hit-1b',
        progress: Math.min(pb, BILLION_GOAL),
        goal: BILLION_GOAL,
        kind: 'money',
      },
      {
        id: 'near-miss-950m',
        progress: Math.min(pb, 950_000_000),
        goal: 950_000_000,
        kind: 'money',
      },
      {
        id: 'hit-1-05b',
        progress: Math.min(pb, 1_050_000_000),
        goal: 1_050_000_000,
        kind: 'money',
      },
      {
        id: 'four-man-1-1b',
        progress: Math.min(four, 1_100_000_000),
        goal: 1_100_000_000,
        kind: 'money',
      },
      {
        id: 'max-player-350m',
        progress: Math.min(runStats.bestSinglePlayer, 350_000_000),
        goal: 350_000_000,
        kind: 'money',
      },
      {
        id: 'three-billion-runs',
        progress: Math.min(billionRunCount, 3),
        goal: 3,
        kind: 'count',
      },
      {
        id: 'five-billion-runs',
        progress: Math.min(billionRunCount, 5),
        goal: 5,
        kind: 'count',
      },
      {
        id: 'five-runs-1-1b',
        progress: Math.min(runStats.runsAtLeast1_1b, 5),
        goal: 5,
        kind: 'count',
      },
      {
        id: 'ten-billion-runs',
        progress: Math.min(billionRunCount, 10),
        goal: 10,
        kind: 'count',
      },
    ];
  }, [billionRunCount, four, pb, runStats]);

  const doneCount = challenges.filter((c) => c.progress >= c.goal).length;

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <ArenaAtmosphere intensity="hub" />
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">{t('challenges.eyebrow')}</p>
        <h1 className="oneb-hub__title">{t('challenges.title')}</h1>
        <p className="oneb-hub__meta">
          <span className="oneb-hub__meta-accent">{doneCount}</span>
          <span>
            /{challenges.length} {t('challenges.completeLabel')}
          </span>
        </p>
      </header>

      <main className="oneb-hub__scroll">
        <p className="oneb-hub__intro">{t('challenges.intro')}</p>

        <ul className="challenges-list oneb-challenges">
          {challenges.map((challenge) => {
            const title = t(challengeKey(challenge.id, 'title'));
            const blurb = t(challengeKey(challenge.id, 'blurb'));
            const complete = challenge.progress >= challenge.goal;
            const pct = Math.min(
              100,
              Math.round((challenge.progress / Math.max(1, challenge.goal)) * 100),
            );
            const status = complete
              ? t('challenges.done')
              : challenge.kind === 'money'
                ? `${formatDollars(challenge.progress)} / ${formatDollars(challenge.goal)}`
                : `${challenge.progress}/${challenge.goal}`;
            return (
              <li
                key={challenge.id}
                className={`challenge-tile${complete ? ' is-complete' : ''}`}
              >
                <div className="challenge-tile__head">
                  <h2>{title}</h2>
                  <span className={`challenge-tile__status${complete ? ' is-done' : ''}`}>
                    {status}
                  </span>
                </div>
                <p>{blurb}</p>
                <div
                  className="challenge-tile__bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${title}: ${formatDollarsExact(challenge.progress)} of goal`}
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
