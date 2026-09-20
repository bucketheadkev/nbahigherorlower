'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchClassicLeaderboardTop,
  fetchMyClassicLeaderboardRank,
  type LeaderboardRow,
  type MyLeaderboardStanding,
} from '@/lib/account/leaderboardCloud';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';

type LoadState = 'loading' | 'ready' | 'error' | 'empty';

export function LeaderboardScreen() {
  const { t } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [mine, setMine] = useState<MyLeaderboardStanding | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');

  const isPermanent = accountState.status === 'permanent';
  const isGuestLike =
    accountState.status === 'guest' ||
    accountState.status === 'anonymous' ||
    accountState.status === 'needs_username';

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);

    const [topResult, mineResult] = await Promise.all([
      fetchClassicLeaderboardTop(100),
      fetchMyClassicLeaderboardRank(),
    ]);

    if (topResult.ok === false) {
      setRows([]);
      setMine(null);
      setErrorMessage(topResult.message);
      setLoadState('error');
      return;
    }

    setRows(topResult.rows);
    if (mineResult.ok === true) {
      setMine(mineResult.standing);
    } else {
      setMine(null);
    }

    setLoadState(topResult.rows.length === 0 ? 'empty' : 'ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load, accountState.status]);

  const myUsername =
    accountState.status === 'permanent' ? accountState.profile.username : null;
  const mineInTop =
    Boolean(
      mine &&
        myUsername &&
        rows.some((row) => row.rank === mine.rank && row.username === mine.username),
    );
  const showMineBelow = Boolean(mine && mine.rank > 100 && !mineInTop);

  const openAccount = (view: AccountSheetView = 'menu') => {
    setSheetView(view);
    setSheetOpen(true);
  };

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <ArenaAtmosphere intensity="hub" />
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">{t('leaderboard.eyebrow')}</p>
        <h1 className="oneb-hub__title">{t('leaderboard.title')}</h1>
        <p className="oneb-hub__meta">
          <span className="oneb-hub__meta-accent">{t('leaderboard.world')}</span>
          {' · '}
          {t('leaderboard.metaTop')}
        </p>
      </header>

      <main className="oneb-hub__scroll leaderboard-world">
        {loadState === 'loading' ? (
          <p className="leaderboard-world__status">{t('leaderboard.loading')}</p>
        ) : null}

        {loadState === 'error' ? (
          <div className="leaderboard-world__empty">
            <p className="leaderboard-world__status">{errorMessage ?? t('leaderboard.error')}</p>
            <button type="button" className="leaderboard-world__retry" onClick={() => void load()}>
              {t('leaderboard.retry')}
            </button>
          </div>
        ) : null}

        {loadState === 'empty' ? (
          <div className="leaderboard-world__empty">
            <p className="run-empty__kicker">{t('leaderboard.emptyKicker')}</p>
            <p className="run-empty__copy">{t('leaderboard.emptyCopy')}</p>
          </div>
        ) : null}

        {loadState === 'ready' ? (
          <ul className="leaderboard-board" aria-label={t('leaderboard.world')}>
            {rows.map((entry) => {
              const isYou =
                isPermanent &&
                mine != null &&
                entry.rank === mine.rank &&
                entry.username === mine.username;
              const placeClass =
                entry.rank === 1
                  ? ' is-first'
                  : entry.rank === 2
                    ? ' is-second'
                    : entry.rank === 3
                      ? ' is-third'
                      : '';
              return (
                <li
                  key={`${entry.rank}-${entry.username}`}
                  className={`leaderboard-card${placeClass}${isYou ? ' is-you' : ''}`}
                >
                  <span className="leaderboard-card__place" aria-label={`Rank ${entry.rank}`}>
                    {entry.rank}
                  </span>
                  <div className="leaderboard-card__body">
                    <div className="leaderboard-card__name-row">
                      <strong>{entry.username}</strong>
                      {isYou ? <em className="leaderboard-card__you">{t('leaderboard.you')}</em> : null}
                    </div>
                  </div>
                  <span className="leaderboard-card__value">
                    {formatDollars(entry.verifiedBest)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {showMineBelow && mine ? (
          <>
            <div className="leaderboard-world__divider" aria-hidden />
            <section
              className="leaderboard-card leaderboard-card--you-offboard is-you"
              aria-label={t('leaderboard.yourRank')}
            >
              <span className="leaderboard-card__place">#{mine.rank.toLocaleString('en-US')}</span>
              <div className="leaderboard-card__body">
                <div className="leaderboard-card__name-row">
                  <strong>{mine.username}</strong>
                  <em className="leaderboard-card__you">{t('leaderboard.you')}</em>
                </div>
              </div>
              <span className="leaderboard-card__value">{formatDollars(mine.verifiedBest)}</span>
            </section>
          </>
        ) : null}

        {isPermanent && loadState !== 'loading' && loadState !== 'error' && !mine ? (
          <p className="leaderboard-world__hint">{t('leaderboard.noVerified')}</p>
        ) : null}

        {isGuestLike && loadState !== 'loading' && loadState !== 'error' ? (
          <div className="leaderboard-world__guest">
            <p>{t('leaderboard.guestHint')}</p>
            <button
              type="button"
              className="leaderboard-world__guest-btn"
              onClick={() => openAccount('signup')}
            >
              {t('leaderboard.guestCta')}
            </button>
          </div>
        ) : null}
      </main>

      <AccountAuthSheet
        open={sheetOpen}
        initialView={sheetView}
        state={accountState}
        onStateChange={setAccountState}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
