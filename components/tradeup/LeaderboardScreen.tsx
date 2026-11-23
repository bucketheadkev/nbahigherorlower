'use client';

import { LeaderboardBackdrop } from './LeaderboardBackdrop';
import { motion, AnimatePresence } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchMyBankRank,
  fetchBankLeaderboardTop,
  type BankStanding,
} from '@/lib/account/bankLeaderboardCloud';
import {
  fetchMyWinsRank,
  fetchWinsLeaderboardTop,
  getDailyWinsResetAt,
  settleDailyWinsPayouts,
  type WinsBoardPeriod,
  type WinsStanding,
} from '@/lib/account/winsLeaderboardCloud';
import { formatCash } from '@/lib/tradeup/bank';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { TickerNumber } from './onboarding/ticker';

type LoadState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';
type BoardMetric = 'wins' | 'bank';

type BoardEntry = {
  rank: number;
  username: string;
  value: number;
  unit: string;
};

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

const PREVIEW_DAILY: WinsStanding[] = [
  ['Vaultline', 12],
  ['NorthStar', 9],
  ['Kairo', 8],
  ['Meridian', 6],
  ['Atlas', 5],
  ['Sable', 4],
  ['Onyx', 3],
  ['Halcyon', 2],
  ['Riven', 2],
  ['Solace', 1],
].map(([username, wins], i) => ({
  rank: i + 1,
  username: username as string,
  wins: wins as number,
}));

const PREVIEW_ALL_TIME: WinsStanding[] = Array.from({ length: 24 }, (_, i) => ({
  rank: i + 1,
  username: [
    'Vaultline',
    'NorthStar',
    'Kairo',
    'Meridian',
    'Atlas',
    'Sable',
    'Onyx',
    'Halcyon',
    'Riven',
    'Solace',
    'Drift',
    'Nova',
  ][i % 12] + (i >= 12 ? String(i) : ''),
  wins: Math.max(1, 148 - i * 5),
}));

const PREVIEW_BANK: BankStanding[] = [
  ['Vaultline', 428_500_000],
  ['NorthStar', 312_000_000],
  ['Kairo', 275_250_000],
  ['Meridian', 198_400_000],
  ['Atlas', 156_000_000],
  ['Sable', 121_750_000],
  ['Onyx', 98_200_000],
  ['Halcyon', 74_500_000],
  ['Riven', 52_000_000],
  ['Solace', 38_250_000],
  ['Drift', 24_100_000],
  ['Nova', 12_500_000],
].map(([username, bankTotal], i) => ({
  rank: i + 1,
  username: username as string,
  bankTotal: bankTotal as number,
}));

function formatWins(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

function mapWinsEntry(row: WinsStanding, unit: string): BoardEntry {
  return { rank: row.rank, username: row.username, value: row.wins, unit };
}

function mapBankEntry(row: BankStanding, unit: string): BoardEntry {
  return { rank: row.rank, username: row.username, value: row.bankTotal, unit };
}

function PodiumCard({
  entry,
  place,
  isYou,
  youLabel,
  formatValue,
  index,
  reduceMotion,
  isBank,
}: {
  entry: BoardEntry;
  place: 1 | 2 | 3;
  isYou: boolean;
  youLabel: string;
  formatValue: (n: number) => string;
  index: number;
  reduceMotion: boolean;
  isBank: boolean;
}) {
  return (
    <motion.article
      className={`wb-podium__card is-place-${place}${isYou ? ' is-you' : ''}${isBank ? ' is-bank' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.06 + index * 0.07 }}
    >
      <span className="wb-podium__medal">{PLACE_LABEL[place]}</span>
      <h2 className="wb-podium__name">{entry.username}</h2>
      {isYou ? <em className="wb-you">{youLabel}</em> : null}
      <p className={`wb-podium__value${isBank ? ' is-bank-cash' : ''}`}>
        <TickerNumber value={entry.value} duration={reduceMotion ? 0 : 1000} format={formatValue} />
      </p>
      {entry.unit ? <span className="wb-podium__unit">{entry.unit}</span> : null}
    </motion.article>
  );
}

function BoardRow({
  entry,
  isYou,
  youLabel,
  formatValue,
  index,
  reduceMotion,
  isBank,
}: {
  entry: BoardEntry;
  isYou: boolean;
  youLabel: string;
  formatValue: (n: number) => string;
  index: number;
  reduceMotion: boolean;
  isBank: boolean;
}) {
  return (
    <motion.li
      className={`wb-row${isYou ? ' is-you' : ''}${isBank ? ' is-bank' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(0.55, 0.16 + index * 0.022) }}
    >
      <span className="wb-row__rank">{entry.rank}</span>
      <span className="wb-row__name">
        <strong>{entry.username}</strong>
        {isYou ? <em className="wb-you">{youLabel}</em> : null}
      </span>
      <span className={`wb-row__value${isBank ? ' is-bank-cash' : ''}`}>
        <strong>{formatValue(entry.value)}</strong>
        {entry.unit ? <small>{entry.unit}</small> : null}
      </span>
    </motion.li>
  );
}

function BoardMetricMenu({
  value,
  onChange,
  winsLabel,
  bankLabel,
  metricLabel,
}: {
  value: BoardMetric;
  onChange: (next: BoardMetric) => void;
  winsLabel: string;
  bankLabel: string;
  metricLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = value === 'bank' ? bankLabel : winsLabel;

  return (
    <div className={`wb-dd${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="wb-dd__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={metricLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <svg className="wb-dd__chev" viewBox="0 0 12 8" width="10" height="7" aria-hidden>
          <path d="M1 1.5 L6 6.5 L11 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            className="wb-dd__menu"
            role="listbox"
            aria-label={metricLabel}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {(
              [
                ['wins', winsLabel],
                ['bank', bankLabel],
              ] as const
            ).map(([id, text]) => (
              <li key={id} role="option" aria-selected={value === id}>
                <button
                  type="button"
                  className={`wb-dd__option${value === id ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                >
                  {text}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Memoized — hub Shop/Home taps must not rebuild this board on website. */
export const LeaderboardScreen = memo(function LeaderboardScreen() {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  // Always start 'wins' so SSR matches the first client paint (sessionStorage later).
  const [boardMetric, setBoardMetric] = useState<BoardMetric>('wins');
  const [period, setPeriod] = useState<WinsBoardPeriod>('daily');
  const [rows, setRows] = useState<BoardEntry[]>([]);
  const [mine, setMine] = useState<BoardEntry | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    setNowTick(Date.now());
    try {
      const pref = sessionStorage.getItem('oneb_board_metric');
      if (pref === 'bank' || pref === 'wins') {
        sessionStorage.removeItem('oneb_board_metric');
        setBoardMetric(pref);
      }
    } catch {
      /* private mode */
    }
  }, []);

  const isPermanent = accountState.status === 'permanent';
  const isGuestLike =
    accountState.status === 'guest' ||
    accountState.status === 'anonymous' ||
    accountState.status === 'needs_username';
  const myUsername = isPermanent ? accountState.profile.username : null;

  const winsUnit = t('leaderboard.winsUnit');
  const formatValue = boardMetric === 'bank' ? formatCash : formatWins;

  const resetAt = useMemo(
    () => (nowTick > 0 ? getDailyWinsResetAt(new Date(nowTick)) : null),
    [nowTick],
  );
  const resetLabel = useMemo(() => {
    if (!resetAt || nowTick <= 0) return t('leaderboard.resetInHours', { hours: 24 });
    const ms = Math.max(0, resetAt.getTime() - nowTick);
    const minutes = Math.floor(ms / 60_000);
    const hours = Math.floor(ms / 3_600_000);
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    if (days > 0) return t('leaderboard.resetInDays', { days, hours: remH });
    if (hours < 1) return t('leaderboard.resetInMinutes', { minutes: Math.max(1, minutes) });
    return t('leaderboard.resetInHours', { hours: Math.max(1, hours) });
  }, [resetAt, nowTick, t]);

  useEffect(() => {
    if (boardMetric !== 'wins' || period !== 'daily') return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [boardMetric, period]);

  const load = useCallback(async () => {
    setLoadState('loading');
    const unit = boardMetric === 'wins' ? winsUnit : '';

    if (isBoardPreview()) {
      if (boardMetric === 'bank') {
        setRows(PREVIEW_BANK.map((row) => mapBankEntry(row, unit)));
      } else {
        const preview = period === 'daily' ? PREVIEW_DAILY : PREVIEW_ALL_TIME;
        setRows(preview.map((row) => mapWinsEntry(row, unit)));
      }
      setMine(null);
      setLoadState('ready');
      return;
    }

    if (boardMetric === 'bank') {
      const [top, me] = await Promise.all([fetchBankLeaderboardTop(100), fetchMyBankRank()]);
      if (top.ok === false) {
        setRows([]);
        setMine(null);
        setLoadState(top.reason);
        return;
      }
      setRows(top.rows.map((row) => mapBankEntry(row, unit)));
      setMine(me.ok === true && me.standing ? mapBankEntry(me.standing, unit) : null);
      setLoadState(top.rows.length === 0 ? 'empty' : 'ready');
      return;
    }

    // Settle prior 24h period (idempotent) before reading the live board.
    void settleDailyWinsPayouts();

    const limit = period === 'daily' ? 10 : 100;
    const [top, me] = await Promise.all([
      fetchWinsLeaderboardTop(period, limit),
      fetchMyWinsRank(period),
    ]);
    if (top.ok === false) {
      setRows([]);
      setMine(null);
      setLoadState(top.reason);
      return;
    }
    setRows(top.rows.map((row) => mapWinsEntry(row, unit)));
    setMine(me.ok === true && me.standing ? mapWinsEntry(me.standing, unit) : null);
    setLoadState(top.rows.length === 0 ? 'empty' : 'ready');
  }, [boardMetric, period, winsUnit]);

  useEffect(() => {
    void load();
  }, [load, accountState.status]);

  const isYou = (entry: BoardEntry) =>
    myUsername != null && entry.username.toLowerCase() === myUsername.toLowerCase();
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const mineInTop = rows.some(isYou);
  const showMineBelow = Boolean(mine && !mineInTop && mine.rank > rows.length);
  const rankLabel = mine
    ? t('leaderboard.rankOf', { rank: mine.rank.toLocaleString('en-US') })
    : t('leaderboard.unranked');
  const myLabel = boardMetric === 'bank' ? t('leaderboard.myBank') : t('leaderboard.myWins');
  const boardKey = `${boardMetric}-${boardMetric === 'wins' ? period : 'bank'}`;

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
        <div className="wb-head__title-row">
          <h1 className="wb-head__title">{t('leaderboard.title')}</h1>
          <BoardMetricMenu
            value={boardMetric}
            onChange={setBoardMetric}
            winsLabel={t('leaderboard.metricWins')}
            bankLabel={t('leaderboard.metricBank')}
            metricLabel={t('leaderboard.boardMetric')}
          />
        </div>
        {boardMetric === 'wins' ? (
          <p className="wb-head__meta">{t('leaderboard.metaTop')}</p>
        ) : (
          <p className="wb-head__meta">{t('leaderboard.metricBank')}</p>
        )}
        {helpOpen ? <p className="wb-help__note">{t('leaderboard.helpCopy')}</p> : null}

        {boardMetric === 'wins' ? (
          <div className="wb-tabs" role="tablist" aria-label={t('leaderboard.periods')}>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'daily'}
              className={`wb-tabs__btn${period === 'daily' ? ' is-active' : ''}`}
              onClick={() => setPeriod('daily')}
            >
              {t('leaderboard.dailyWins')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'allTime'}
              className={`wb-tabs__btn${period === 'allTime' ? ' is-active' : ''}`}
              onClick={() => setPeriod('allTime')}
            >
              {t('leaderboard.allTimeWins')}
            </button>
          </div>
        ) : null}
      </header>

      <main className="oneb-hub__scroll wb-main">
        <motion.section
          className="wb-mine"
          aria-label={myLabel}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="wb-mine__top">
            <span className="wb-mine__label">{myLabel}</span>
            <span className={`wb-mine__rank${mine ? ' is-ranked' : ''}`}>
              {isGuestLike ? t('leaderboard.unranked') : rankLabel}
            </span>
          </div>
          <p className={`wb-mine__balance${boardMetric === 'bank' ? ' is-bank-cash' : ''}`}>
            <TickerNumber
              value={mine?.value ?? 0}
              duration={reduceMotion ? 0 : 900}
              format={formatValue}
            />
            {boardMetric === 'wins' ? (
              <span className="wb-mine__unit">{winsUnit}</span>
            ) : null}
          </p>
          {boardMetric === 'wins' ? (
            <p className="wb-mine__goal">
              {period === 'daily' ? resetLabel : t('leaderboard.allTimeHint')}
            </p>
          ) : null}
        </motion.section>

        <AnimatePresence mode="wait">
          <motion.div
            key={boardKey}
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
                  {boardMetric === 'bank'
                    ? t('leaderboard.emptyCopy')
                    : period === 'daily'
                      ? t('leaderboard.emptyDaily')
                      : t('leaderboard.emptyAllTime')}
                </p>
              </div>
            ) : null}

            {loadState === 'ready' && podium.length > 0 ? (
              <section className="wb-podium" aria-label={t('leaderboard.world')}>
                {[podium[1], podium[0], podium[2]]
                  .filter((entry): entry is BoardEntry => entry != null)
                  .map((entry, i) => (
                    <PodiumCard
                      key={`${boardKey}-${entry.username}`}
                      entry={entry}
                      place={entry.rank === 1 ? 1 : entry.rank === 2 ? 2 : 3}
                      isYou={isYou(entry)}
                      youLabel={t('leaderboard.you')}
                      formatValue={formatValue}
                      index={i}
                      reduceMotion={reduceMotion}
                      isBank={boardMetric === 'bank'}
                    />
                  ))}
              </section>
            ) : null}

            {loadState === 'ready' && rest.length > 0 ? (
              <ol className="wb-list" aria-label={t('leaderboard.world')}>
                {rest.map((entry, i) => (
                  <BoardRow
                    key={`${boardKey}-${entry.username}`}
                    entry={entry}
                    isYou={isYou(entry)}
                    youLabel={t('leaderboard.you')}
                    formatValue={formatValue}
                    index={i}
                    reduceMotion={reduceMotion}
                    isBank={boardMetric === 'bank'}
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
                    formatValue={formatValue}
                    index={0}
                    reduceMotion={reduceMotion}
                    isBank={boardMetric === 'bank'}
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
});
