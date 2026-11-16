'use client';

import { LeaderboardBackdrop } from './LeaderboardBackdrop';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchMyWinsRank,
  fetchWinsLeaderboardTop,
  getWeeklyWinsResetAt,
  type WinsBoardPeriod,
  type WinsStanding,
} from '@/lib/account/winsLeaderboardCloud';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { TickerNumber } from './onboarding/ticker';

type LoadState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PLACE_LABEL: Record<1 | 2 | 3, string> = { 1: '1ST', 2: '2ND', 3: '3RD' };

function isBoardPreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('boardPreview') === '1';
  } catch {
    return false;
  }
}

const PREVIEW_WEEKLY: WinsStanding[] = [
  ['Vaultline', 12],
  ['NorthStar', 9],
  ['Kairo', 8],
  ['Meridian', 6],
  ['Atlas', 5],
  ['Sable', 4],
  ['Onyx', 3],
  ['Halcyon', 2],
].map(([username, wins], i) => ({
  rank: i + 1,
  username: username as string,
  wins: wins as number,
}));

const PREVIEW_ALL_TIME: WinsStanding[] = [
  ['Vaultline', 148],
  ['NorthStar', 121],
  ['Kairo', 97],
  ['Meridian', 84],
  ['Atlas', 71],
  ['Sable', 58],
  ['Onyx', 44],
  ['Halcyon', 31],
].map(([username, wins], i) => ({
  rank: i + 1,
  username: username as string,
  wins: wins as number,
}));

function formatWins(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

function PodiumCard({
  entry,
  place,
  isYou,
  youLabel,
  winsLabel,
  index,
  reduceMotion,
}: {
  entry: WinsStanding;
  place: 1 | 2 | 3;
  isYou: boolean;
  youLabel: string;
  winsLabel: string;
  index: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.article
      className={`wb-podium__card is-place-${place}${isYou ? ' is-you' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.06 + index * 0.07 }}
    >
      <span className="wb-podium__medal">{PLACE_LABEL[place]}</span>
      <h2 className="wb-podium__name">{entry.username}</h2>
      {isYou ? <em className="wb-you">{youLabel}</em> : null}
      <p className="wb-podium__value">
        <TickerNumber value={entry.wins} duration={reduceMotion ? 0 : 1000} format={formatWins} />
      </p>
      <span className="wb-podium__unit">{winsLabel}</span>
    </motion.article>
  );
}

function BoardRow({
  entry,
  isYou,
  youLabel,
  winsLabel,
  index,
  reduceMotion,
}: {
  entry: WinsStanding;
  isYou: boolean;
  youLabel: string;
  winsLabel: string;
  index: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.li
      className={`wb-row${isYou ? ' is-you' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(0.55, 0.16 + index * 0.022) }}
    >
      <span className="wb-row__rank">{entry.rank}</span>
      <span className="wb-row__name">
        <strong>{entry.username}</strong>
        {isYou ? <em className="wb-you">{youLabel}</em> : null}
      </span>
      <span className="wb-row__value">
        <strong>{formatWins(entry.wins)}</strong>
        <small>{winsLabel}</small>
      </span>
    </motion.li>
  );
}

export function LeaderboardScreen() {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  const [period, setPeriod] = useState<WinsBoardPeriod>('weekly');
  const [rows, setRows] = useState<WinsStanding[]>([]);
  const [mine, setMine] = useState<WinsStanding | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isPermanent = accountState.status === 'permanent';
  const isGuestLike =
    accountState.status === 'guest' ||
    accountState.status === 'anonymous' ||
    accountState.status === 'needs_username';
  const myUsername = isPermanent ? accountState.profile.username : null;

  const resetAt = useMemo(() => getWeeklyWinsResetAt(new Date(nowTick)), [nowTick]);
  const resetLabel = useMemo(() => {
    const ms = Math.max(0, resetAt.getTime() - nowTick);
    const hours = Math.floor(ms / 3_600_000);
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    if (days > 0) return t('leaderboard.resetInDays', { days, hours: remH });
    return t('leaderboard.resetInHours', { hours: Math.max(1, hours) });
  }, [resetAt, nowTick, t]);

  useEffect(() => {
    if (period !== 'weekly') return;
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [period]);

  const load = useCallback(async () => {
    setLoadState('loading');
    if (isBoardPreview()) {
      setRows(period === 'weekly' ? PREVIEW_WEEKLY : PREVIEW_ALL_TIME);
      setMine(null);
      setLoadState('ready');
      return;
    }
    const [top, me] = await Promise.all([
      fetchWinsLeaderboardTop(period, 100),
      fetchMyWinsRank(period),
    ]);
    if (top.ok === false) {
      setRows([]);
      setMine(null);
      setLoadState(top.reason);
      return;
    }
    setRows(top.rows);
    setMine(me.ok === true ? me.standing : null);
    setLoadState(top.rows.length === 0 ? 'empty' : 'ready');
  }, [period]);

  useEffect(() => {
    void load();
  }, [load, accountState.status]);

  const isYou = (entry: WinsStanding) =>
    myUsername != null && entry.username.toLowerCase() === myUsername.toLowerCase();
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const mineInTop = rows.some(isYou);
  const showMineBelow = Boolean(mine && !mineInTop && mine.rank > rows.length);
  const rankLabel = mine
    ? t('leaderboard.rankOf', { rank: mine.rank.toLocaleString('en-US') })
    : t('leaderboard.unranked');
  const winsWord = t('leaderboard.winsUnit');

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub wb-screen">
      <LeaderboardBackdrop />

      <header className="wb-head">
        <button
          type="button"
          className="wb-help"
          aria-expanded={helpOpen}
          aria-label={t('leaderboard.helpLabel')}
          onClick={() => setHelpOpen((open) => !open)}
        >
          ?
        </button>
        <p className="wb-head__eyebrow">{t('leaderboard.eyebrow')}</p>
        <h1 className="wb-head__title">{t('leaderboard.title')}</h1>
        <p className="wb-head__meta">{t('leaderboard.metaTop')}</p>
        {helpOpen ? <p className="wb-help__note">{t('leaderboard.helpCopy')}</p> : null}

        <div className="wb-tabs" role="tablist" aria-label={t('leaderboard.periods')}>
          <button
            type="button"
            role="tab"
            aria-selected={period === 'weekly'}
            className={`wb-tabs__btn${period === 'weekly' ? ' is-active' : ''}`}
            onClick={() => setPeriod('weekly')}
          >
            {t('leaderboard.weekly')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={period === 'allTime'}
            className={`wb-tabs__btn${period === 'allTime' ? ' is-active' : ''}`}
            onClick={() => setPeriod('allTime')}
          >
            {t('leaderboard.allTime')}
          </button>
        </div>
      </header>

      <main className="oneb-hub__scroll wb-main">
        <motion.section
          className="wb-mine"
          aria-label={t('leaderboard.myWins')}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="wb-mine__top">
            <span className="wb-mine__label">{t('leaderboard.myWins')}</span>
            <span className={`wb-mine__rank${mine ? ' is-ranked' : ''}`}>
              {isGuestLike ? t('leaderboard.unranked') : rankLabel}
            </span>
          </div>
          <p className="wb-mine__balance">
            <TickerNumber value={mine?.wins ?? 0} duration={reduceMotion ? 0 : 900} format={formatWins} />
            <span className="wb-mine__unit">{winsWord}</span>
          </p>
          <p className="wb-mine__goal">
            {period === 'weekly' ? resetLabel : t('leaderboard.allTimeHint')}
          </p>
        </motion.section>

        <AnimatePresence mode="wait">
          <motion.div
            key={period}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            {loadState === 'loading' ? (
              <ul className="wb-skeleton" aria-label={t('leaderboard.loading')}>
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i} />
                ))}
              </ul>
            ) : null}

            {loadState === 'unavailable' ? (
              <div className="wb-state">
                <p className="wb-state__kicker">{t('leaderboard.comingKicker')}</p>
                <p className="wb-state__copy">{t('leaderboard.comingCopy')}</p>
              </div>
            ) : null}

            {loadState === 'error' ? (
              <div className="wb-state">
                <p className="wb-state__copy">{t('leaderboard.error')}</p>
                <button type="button" className="wb-state__btn" onClick={() => void load()}>
                  {t('leaderboard.retry')}
                </button>
              </div>
            ) : null}

            {loadState === 'empty' ? (
              <div className="wb-state">
                <p className="wb-state__kicker">{t('leaderboard.emptyKicker')}</p>
                <p className="wb-state__copy">
                  {period === 'weekly' ? t('leaderboard.emptyWeekly') : t('leaderboard.emptyAllTime')}
                </p>
              </div>
            ) : null}

            {loadState === 'ready' && podium.length > 0 ? (
              <section className="wb-podium" aria-label={t('leaderboard.world')}>
                {[podium[1], podium[0], podium[2]]
                  .filter((entry): entry is WinsStanding => entry != null)
                  .map((entry, i) => (
                    <PodiumCard
                      key={`${period}-${entry.username}`}
                      entry={entry}
                      place={entry.rank === 1 ? 1 : entry.rank === 2 ? 2 : 3}
                      isYou={isYou(entry)}
                      youLabel={t('leaderboard.you')}
                      winsLabel={winsWord}
                      index={i}
                      reduceMotion={reduceMotion}
                    />
                  ))}
              </section>
            ) : null}

            {loadState === 'ready' && rest.length > 0 ? (
              <ol className="wb-list" aria-label={t('leaderboard.world')}>
                {rest.map((entry, i) => (
                  <BoardRow
                    key={`${period}-${entry.username}`}
                    entry={entry}
                    isYou={isYou(entry)}
                    youLabel={t('leaderboard.you')}
                    winsLabel={winsWord}
                    index={i}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </ol>
            ) : null}

            {showMineBelow && mine ? (
              <>
                <div className="wb-gap" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <ol className="wb-list">
                  <BoardRow
                    entry={mine}
                    isYou
                    youLabel={t('leaderboard.you')}
                    winsLabel={winsWord}
                    index={0}
                    reduceMotion={reduceMotion}
                  />
                </ol>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>

        {isGuestLike && loadState !== 'loading' ? (
          <div className="wb-guest">
            <p>{t('leaderboard.guestHint')}</p>
            <button
              type="button"
              className="wb-guest__btn"
              onClick={() => {
                setSheetView('signup');
                setSheetOpen(true);
              }}
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
