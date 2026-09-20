'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  buildChallengeProgressList,
  type ChallengeProgress,
} from '@/lib/tradeup/challenges';
import { hapticLight } from '@/lib/tradeup/haptics';

type ChallengeFilter = 'incomplete' | 'complete';

function challengeKey(id: string, field: 'title' | 'blurb'): MessageKey {
  return `challenge.${id}.${field}` as MessageKey;
}

export function ChallengesScreen() {
  const { t } = useLocale();
  const [challenges, setChallenges] = useState<ChallengeProgress[]>(() =>
    buildChallengeProgressList(),
  );
  const [filter, setFilter] = useState<ChallengeFilter>('incomplete');

  useEffect(() => {
    const refresh = () => setChallenges(buildChallengeProgressList());
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, refresh);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, refresh);
  }, []);

  const doneCount = challenges.filter((c) => c.complete).length;
  const openCount = challenges.length - doneCount;

  const visible = useMemo(
    () =>
      challenges.filter((c) =>
        filter === 'complete' ? c.complete : !c.complete,
      ),
    [challenges, filter],
  );

  const setFilterMode = (next: ChallengeFilter) => {
    if (next === filter) return;
    hapticLight();
    setFilter(next);
  };

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

        <div className="challenge-filter" role="group" aria-label={t('challenges.filterLabel')}>
          <button
            type="button"
            className={`challenge-filter__btn ui-tap${
              filter === 'incomplete' ? ' is-active' : ''
            }`}
            aria-pressed={filter === 'incomplete'}
            onClick={() => setFilterMode('incomplete')}
          >
            <span className="challenge-filter__icon challenge-filter__icon--lock" aria-hidden>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <rect
                  x="3.25"
                  y="7"
                  width="9.5"
                  height="7.25"
                  rx="1.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M5.25 7V5.1a2.75 2.75 0 0 1 5.5 0V7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            {t('challenges.filterIncomplete')}
            <span className="challenge-filter__count">{openCount}</span>
          </button>
          <button
            type="button"
            className={`challenge-filter__btn ui-tap${
              filter === 'complete' ? ' is-active' : ''
            }`}
            aria-pressed={filter === 'complete'}
            onClick={() => setFilterMode('complete')}
          >
            <span className="challenge-filter__icon challenge-filter__icon--check" aria-hidden>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path
                  d="M3.2 8.35 6.45 11.5 12.8 4.5"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {t('challenges.filterComplete')}
            <span className="challenge-filter__count">{doneCount}</span>
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="challenge-empty">
            <p className="challenge-empty__copy">
              {filter === 'complete'
                ? t('challenges.emptyComplete')
                : t('challenges.emptyIncomplete')}
            </p>
          </div>
        ) : (
          <ul className="challenges-list oneb-challenges">
            {visible.map((challenge) => {
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
                    <span
                      className={`challenge-tile__status${
                        challenge.complete ? ' is-done' : ''
                      }`}
                    >
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
        )}
      </main>
    </div>
  );
}
