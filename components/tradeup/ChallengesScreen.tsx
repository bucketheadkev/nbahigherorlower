'use client';

import { useMemo } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { formatDollars, formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { buildChallengeProgressList } from '@/lib/tradeup/challenges';

function challengeKey(id: string, field: 'title' | 'blurb'): MessageKey {
  return `challenge.${id}.${field}` as MessageKey;
}

export function ChallengesScreen() {
  const { t } = useLocale();
  const challenges = useMemo(() => buildChallengeProgressList(), []);
  const doneCount = challenges.filter((c) => c.complete).length;

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
            const pct = Math.min(
              100,
              Math.round((challenge.progress / Math.max(1, challenge.goal)) * 100),
            );
            const status = challenge.complete
              ? t('challenges.done')
              : challenge.kind === 'money'
                ? `${formatDollars(challenge.progress)} / ${formatDollars(challenge.goal)}`
                : `${challenge.progress}/${challenge.goal}`;
            return (
              <li
                key={challenge.id}
                className={`challenge-tile${challenge.complete ? ' is-complete' : ''}`}
              >
                <div className="challenge-tile__head">
                  <h2>{title}</h2>
                  <span className={`challenge-tile__status${challenge.complete ? ' is-done' : ''}`}>
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
                  aria-label={`${title}: ${status}`}
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
