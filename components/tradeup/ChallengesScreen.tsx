'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { BANK_CHANGED_EVENT, challengeReward, formatCash } from '@/lib/tradeup/bank';
import { buildChallengeProgressList, type ChallengeProgress } from '@/lib/tradeup/challenges';
import { hapticLight } from '@/lib/tradeup/haptics';

type ChallengeFilter = 'incomplete' | 'complete';

function challengeKey(id: string): MessageKey {
  return `challenge.${id}.blurb` as MessageKey;
}

/** Smallest payout first; ties keep the list's natural order. */
function byPayout(list: ChallengeProgress[]): ChallengeProgress[] {
  return list
    .map((challenge, index) => ({ challenge, index }))
    .sort((a, b) => challengeReward(a.challenge.id) - challengeReward(b.challenge.id) || a.index - b.index)
    .map(({ challenge }) => challenge);
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
      <rect x="3.25" y="7" width="9.5" height="7.25" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.25 7V5.1a2.75 2.75 0 0 1 5.5 0V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
      <path
        d="M3.2 8.35 6.45 11.5 12.8 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AchievementCard({ challenge }: { challenge: ChallengeProgress }) {
  const { t } = useLocale();
  const reward = challengeReward(challenge.id);
  const goal = t(challengeKey(challenge.id));
  const pct = challenge.complete
    ? 100
    : Math.min(100, Math.round((challenge.progress / Math.max(1, challenge.goal)) * 100));
  const showProgress = !challenge.complete && challenge.goal > 1;
  const progressLabel =
    challenge.kind === 'money'
      ? `${formatDollars(challenge.progress)} / ${formatDollars(challenge.goal)}`
      : `${challenge.progress}/${challenge.goal}`;

  return (
    <li className={`ach-card${challenge.complete ? ' is-earned' : ''}`}>
      <span className="ach-card__medal" aria-hidden>
        {challenge.complete ? <CheckIcon /> : <LockIcon />}
      </span>
      <div className="ach-card__body">
        <h3 className="ach-card__goal">{goal}</h3>
        {showProgress ? (
          <div className="ach-card__progress">
            <div
              className="ach-card__bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goal} ${progressLabel}`}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="ach-card__progress-label">{progressLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="ach-card__reward">
        {challenge.complete ? (
          <span className="ach-card__stamp">{t('challenges.earned')}</span>
        ) : null}
        <strong className="ach-card__cash">+{formatCash(reward)}</strong>
      </div>
    </li>
  );
}

export function ChallengesScreen() {
  const { t } = useLocale();
  const [challenges, setChallenges] = useState<ChallengeProgress[]>(() =>
    buildChallengeProgressList(),
  );
  const [filter, setFilter] = useState<ChallengeFilter>('incomplete');
  const { state: account } = useAccountAuth();
  const bank = useBankBalance(account.status === 'permanent');

  useEffect(() => {
    const refresh = () => setChallenges(buildChallengeProgressList());
    window.addEventListener(BANK_CHANGED_EVENT, refresh);
    window.addEventListener(USER_DATA_CLEARED_EVENT, refresh);
    return () => {
      window.removeEventListener(BANK_CHANGED_EVENT, refresh);
      window.removeEventListener(USER_DATA_CLEARED_EVENT, refresh);
    };
  }, []);

  const earnedCount = challenges.filter((c) => c.complete).length;
  const openCount = challenges.length - earnedCount;

  const items = useMemo(
    () => byPayout(challenges.filter((c) => (filter === 'complete' ? c.complete : !c.complete))),
    [challenges, filter],
  );

  const setFilterMode = (next: ChallengeFilter) => {
    if (next === filter) return;
    hapticLight();
    setFilter(next);
  };

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub ach-screen">
      <ArenaAtmosphere intensity="hub" />
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">{t('challenges.eyebrow')}</p>
        <h1 className="oneb-hub__title">{t('challenges.title')}</h1>
      </header>

      <main className="oneb-hub__scroll ach-main">
        <section className="ach-bank" aria-label={t('challenges.bankLabel')}>
          <p className="ach-bank__label">{t('challenges.bankLabel')}</p>
          <p className="ach-bank__balance">{bank == null ? '\u00a0' : formatCash(bank)}</p>
        </section>

        <p className="ach-intro">{t('challenges.intro')}</p>

        <div className="ach-tabs" role="group" aria-label={t('challenges.filterLabel')}>
          <button
            type="button"
            className={`ach-tabs__btn ui-tap${filter === 'incomplete' ? ' is-active' : ''}`}
            aria-pressed={filter === 'incomplete'}
            onClick={() => setFilterMode('incomplete')}
          >
            {t('challenges.filterIncomplete')}
            <span className="ach-tabs__count">{openCount}</span>
          </button>
          <button
            type="button"
            className={`ach-tabs__btn ach-tabs__btn--earned ui-tap${
              filter === 'complete' ? ' is-active' : ''
            }`}
            aria-pressed={filter === 'complete'}
            onClick={() => setFilterMode('complete')}
          >
            {t('challenges.filterComplete')}
            <span className="ach-tabs__count">{earnedCount}</span>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="ach-empty">
            <p>
              {filter === 'complete'
                ? t('challenges.emptyComplete')
                : t('challenges.emptyIncomplete')}
            </p>
          </div>
        ) : (
          <ul className="ach-list">
            {items.map((challenge) => (
              <AchievementCard key={challenge.id} challenge={challenge} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
