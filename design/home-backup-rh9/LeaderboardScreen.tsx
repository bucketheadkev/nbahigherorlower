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
  settleDailyWinsPayouts,
  type WinsBoardPeriod,
  type WinsStanding,
} from '@/lib/account/winsLeaderboardCloud';
import { useBankBalance } from '@/hooks/useBankBalance';
import { flushPendingTriviaBonuses } from '@/lib/tradeup/trivia/bankTrivia';
import { formatCash } from '@/lib/tradeup/bank';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { HomeProfileMark } from './home/HomeProfileMark';

type LoadState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';
type BoardMetric = 'wins' | 'bank';

type BoardSnapshot = {
  rows: BoardEntry[];
  mine: BoardEntry | null;
  state: LoadState;
};

type BoardEntry = {
  rank: number;
  username: string;
  value: number;
  unit: string;
};

const EMPTY_ROWS: BoardEntry[] = [];
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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
  username:
    [
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

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  wide,
}: {
  label: string;
  value: T;
  options: readonly { id: T; text: string }[];
  onChange: (next: T) => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.id === value)?.text ?? value;

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

  return (
    <div
      className={`wb-filter${wide ? ' is-wide' : ''}${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="wb-filter__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="wb-filter__value">{selected}</span>
        <svg className="wb-filter__chev" viewBox="0 0 12 8" width="12" height="8" aria-hidden>
          <path
            d="M1 1.5 L6 6.5 L11 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            className="wb-filter__menu"
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
          >
            {options.map((opt) => (
              <li key={opt.id} role="option" aria-selected={value === opt.id}>
                <button
                  type="button"
                  className={`wb-filter__option${value === opt.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                >
                  {opt.text}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PodiumSlot({
  entry,
  place,
  isYou,
  youLabel,
  scoreText,
  isBank,
  reduceMotion,
  index,
}: {
  entry: BoardEntry;
  place: 1 | 2 | 3;
  isYou: boolean;
  youLabel: string;
  scoreText: string;
  isBank: boolean;
  reduceMotion: boolean;
  index: number;
}) {
  return (
    <motion.article
      className={`wb-podium__slot is-place-${place}${isYou ? ' is-you' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.05 + index * 0.06 }}
    >
      <div className="wb-podium__player">
        <span className={`wb-podium__mark is-place-${place}`}>
          <HomeProfileMark label={entry.username} />
        </span>
        <h2 className="wb-podium__name">
          {entry.username}
          {isYou ? <em className="wb-you">{youLabel}</em> : null}
        </h2>
        <p className={`wb-podium__score${isBank ? ' is-bank' : ''}`}>{scoreText}</p>
      </div>
      <div className={`wb-podium__plinth is-place-${place}`} aria-hidden>
        <span className="wb-podium__num">{place}</span>
      </div>
    </motion.article>
  );
}

function BoardRow({
  entry,
  isYou,
  youLabel,
  scoreText,
  isBank,
  index,
  reduceMotion,
}: {
  entry: BoardEntry;
  isYou: boolean;
  youLabel: string;
  scoreText: string;
  isBank: boolean;
  index: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.li
      className={`wb-row${isYou ? ' is-you' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(0.5, 0.12 + index * 0.02) }}
    >
      <span className="wb-row__rank">{entry.rank}</span>
      <span className="wb-row__mark">
        <HomeProfileMark label={entry.username} />
      </span>
      <span className="wb-row__name">
        <strong>{entry.username}</strong>
        {isYou ? <em className="wb-you">{youLabel}</em> : null}
      </span>
      <span className={`wb-row__score${isBank ? ' is-bank' : ''}`}>{scoreText}</span>
    </motion.li>
  );
}

/** Memoized — hub Shop/Home taps must not rebuild this board on website. */
export const LeaderboardScreen = memo(function LeaderboardScreen() {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  const liveBank = useBankBalance(accountState.status);
  const [boardMetric, setBoardMetric] = useState<BoardMetric>('wins');
  const [period, setPeriod] = useState<WinsBoardPeriod>('daily');
  const [snapshots, setSnapshots] = useState<Record<string, BoardSnapshot>>({});
  const loadSeq = useRef(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');

  useEffect(() => {
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
  const formatScore = useCallback(
    (entry: BoardEntry) => {
      if (boardMetric === 'bank') return formatCash(entry.value);
      return `${formatWins(entry.value)} ${entry.unit || winsUnit}`;
    },
    [boardMetric, winsUnit],
  );

  const boardKey = `${boardMetric}-${boardMetric === 'wins' ? period : 'bank'}`;

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const key = boardKey;
    const unit = boardMetric === 'wins' ? winsUnit : '';

    const commit = (next: BoardSnapshot) => {
      if (seq !== loadSeq.current) return;
      setSnapshots((prev) => {
        const old = prev[key];
        const failed = next.state === 'error' || next.state === 'unavailable';
        if (failed && old && old.rows.length > 0) {
          return { ...prev, [key]: { ...old, state: 'ready' } };
        }
        return { ...prev, [key]: next };
      });
    };

    if (isBoardPreview()) {
      const rows =
        boardMetric === 'bank'
          ? PREVIEW_BANK.map((row) => mapBankEntry(row, unit))
          : (period === 'daily' ? PREVIEW_DAILY : PREVIEW_ALL_TIME).map((row) =>
              mapWinsEntry(row, unit),
            );
      commit({ rows, mine: null, state: 'ready' });
      return;
    }

    if (boardMetric === 'bank') {
      try {
        await flushPendingTriviaBonuses();
      } catch {
        /* offline */
      }
      if (seq !== loadSeq.current) return;
      const [top, me] = await Promise.all([fetchBankLeaderboardTop(100), fetchMyBankRank()]);
      if (top.ok === false) {
        commit({ rows: [], mine: null, state: top.reason });
        return;
      }
      commit({
        rows: top.rows.map((row) => mapBankEntry(row, unit)),
        mine: me.ok === true && me.standing ? mapBankEntry(me.standing, unit) : null,
        state: top.rows.length === 0 ? 'empty' : 'ready',
      });
      return;
    }

    void settleDailyWinsPayouts();

    const limit = period === 'daily' ? 10 : 100;
    const [top, me] = await Promise.all([
      fetchWinsLeaderboardTop(period, limit),
      fetchMyWinsRank(period),
    ]);
    if (top.ok === false) {
      commit({ rows: [], mine: null, state: top.reason });
      return;
    }
    commit({
      rows: top.rows.map((row) => mapWinsEntry(row, unit)),
      mine: me.ok === true && me.standing ? mapWinsEntry(me.standing, unit) : null,
      state: top.rows.length === 0 ? 'empty' : 'ready',
    });
  }, [boardKey, boardMetric, period, winsUnit]);

  useEffect(() => {
    void load();
  }, [load, accountState.status]);

  const snapshot = snapshots[boardKey];
  const rows = snapshot?.rows ?? EMPTY_ROWS;
  const mine = snapshot?.mine ?? null;
  const loadState: LoadState = snapshot?.state ?? 'loading';

  const isYou = (entry: BoardEntry) =>
    myUsername != null && entry.username.toLowerCase() === myUsername.toLowerCase();

  const displayMine =
    boardMetric === 'bank' && mine && liveBank != null && liveBank > mine.value
      ? { ...mine, value: liveBank }
      : mine;
  const syncedRows = useMemo(() => {
    if (boardMetric !== 'bank' || liveBank == null || !myUsername) return rows;
    const me = myUsername.toLowerCase();
    return rows.map((row) =>
      row.username.toLowerCase() === me && liveBank > row.value
        ? { ...row, value: liveBank }
        : row,
    );
  }, [boardMetric, liveBank, myUsername, rows]);
  const podium = syncedRows.slice(0, 3);
  const rest = syncedRows.slice(3);
  const mineInTop = syncedRows.some(isYou);
  const showMineBelow = Boolean(
    displayMine && !mineInTop && displayMine.rank > syncedRows.length,
  );

  const boardOptions: { id: BoardMetric; text: string }[] = useMemo(
    () => [
      { id: 'wins', text: t('leaderboard.metricWins') },
      { id: 'bank', text: t('leaderboard.metricBank') },
    ],
    [t],
  );
  const isBank = boardMetric === 'bank';

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub wb-screen">
      <LeaderboardBackdrop />

      <header className="wb-filters">
        <button
          type="button"
          className="wb-help"
          aria-expanded={helpOpen}
          aria-label={t('leaderboard.helpLabel')}
          onClick={() => setHelpOpen((open) => !open)}
        >
          ?
        </button>

        <FilterSelect<BoardMetric>
          wide
          label={`${t('leaderboard.metricWins')} / ${t('leaderboard.metricBank')}`}
          value={boardMetric}
          options={boardOptions}
          onChange={(next) => setBoardMetric(next)}
        />

        {boardMetric === 'wins' ? (
          <div className="wb-period" role="tablist" aria-label={t('leaderboard.periods')}>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'daily'}
              className={`wb-period__btn${period === 'daily' ? ' is-on' : ''}`}
              onClick={() => setPeriod('daily')}
            >
              {t('leaderboard.dailyWins')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'allTime'}
              className={`wb-period__btn${period === 'allTime' ? ' is-on' : ''}`}
              onClick={() => setPeriod('allTime')}
            >
              {t('leaderboard.allTimeWins')}
            </button>
          </div>
        ) : null}

        {helpOpen ? <p className="wb-help__note">{t('leaderboard.helpCopy')}</p> : null}
      </header>

      <main className="oneb-hub__scroll wb-main">
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
                  .map((entry, i) => {
                    if (!entry) return null;
                    const place = (entry.rank === 1 ? 1 : entry.rank === 2 ? 2 : 3) as 1 | 2 | 3;
                    return (
                      <PodiumSlot
                        key={`${boardKey}-${entry.username}`}
                        entry={entry}
                        place={place}
                        isYou={isYou(entry)}
                        youLabel={t('leaderboard.you')}
                        scoreText={formatScore(entry)}
                        isBank={isBank}
                        reduceMotion={reduceMotion}
                        index={i}
                      />
                    );
                  })
                  .filter(Boolean)}
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
                    scoreText={formatScore(entry)}
                    isBank={isBank}
                    index={i}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </ol>
            ) : null}

            {showMineBelow && displayMine ? (
              <>
                <div className="wb-gap" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <ol className="wb-list">
                  <BoardRow
                    entry={displayMine}
                    isYou
                    youLabel={t('leaderboard.you')}
                    scoreText={formatScore(displayMine)}
                    isBank={isBank}
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
});
