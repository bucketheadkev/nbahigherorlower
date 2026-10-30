'use client';

import { LeaderboardBackdrop } from './LeaderboardBackdrop';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchBankLeaderboardTop,
  fetchMyBankRank,
  type BankStanding,
} from '@/lib/account/bankLeaderboardCloud';
import { formatCash } from '@/lib/tradeup/bank';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { WALL_OF_FAME_GOAL } from '@/lib/tradeup/wallOfFame';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { TickerNumber } from './onboarding/ticker';

type LoadState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';

const EASE: [number, number, number, number] = [0.25, 1, 0.5, 1];
const PLACE_LABEL: Record<1 | 2 | 3, string> = { 1: '1ST', 2: '2ND', 3: '3RD' };

/** ?boardPreview=1 — sample Banks for design review before the server function ships. */
function isBoardPreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('boardPreview') === '1';
  } catch {
    return false;
  }
}

const PREVIEW_ROWS: BankStanding[] = [
  ['Vaultline', 1_840_000],
  ['NorthStar', 1_515_000],
  ['Kairo', 1_260_000],
  ['Meridian', 985_000],
  ['Atlas', 860_000],
  ['Sable', 735_000],
  ['Onyx', 610_000],
  ['Halcyon', 480_000],
].map(([username, bankTotal], i) => ({
  rank: i + 1,
  username: username as string,
  bankTotal: bankTotal as number,
}));

function PodiumCard({
  entry,
  place,
  isYou,
  youLabel,
  index,
  reduceMotion,
}: {
  entry: BankStanding;
  place: 1 | 2 | 3;
  isYou: boolean;
  youLabel: string;
  index: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.article
      className={`lbx-podium__card is-place-${place}${isYou ? ' is-you' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.08 + index * 0.08 }}
    >
      <span className="lbx-podium__medal">{PLACE_LABEL[place]}</span>
      <h2 className="lbx-podium__name">{entry.username}</h2>
      {isYou ? <em className="lbx-you">{youLabel}</em> : null}
      <p className="lbx-podium__value">
        <TickerNumber value={entry.bankTotal} duration={reduceMotion ? 0 : 1100} />
      </p>
    </motion.article>
  );
}

function BoardRow({
  entry,
  isYou,
  youLabel,
  index,
  reduceMotion,
}: {
  entry: BankStanding;
  isYou: boolean;
  youLabel: string;
  index: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.li
      className={`lbx-row${isYou ? ' is-you' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(0.6, 0.2 + index * 0.025) }}
    >
      <span className="lbx-row__rank">{entry.rank}</span>
      <span className="lbx-row__name">
        <strong>{entry.username}</strong>
        {isYou ? <em className="lbx-you">{youLabel}</em> : null}
      </span>
      <span className="lbx-row__value">{formatCash(entry.bankTotal)}</span>
    </motion.li>
  );
}

export function LeaderboardScreen() {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  const [rows, setRows] = useState<BankStanding[]>([]);
  const [mine, setMine] = useState<BankStanding | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');

  const isPermanent = accountState.status === 'permanent';
  const isGuestLike =
    accountState.status === 'guest' ||
    accountState.status === 'anonymous' ||
    accountState.status === 'needs_username';
  const myUsername = isPermanent ? accountState.profile.username : null;
  const bank = useBankBalance(isPermanent) ?? 0;

  const load = useCallback(async () => {
    setLoadState('loading');
    if (isBoardPreview()) {
      setRows(PREVIEW_ROWS);
      setMine(null);
      setLoadState('ready');
      return;
    }
    const [top, me] = await Promise.all([fetchBankLeaderboardTop(100), fetchMyBankRank()]);
    if (top.ok === false) {
      setRows([]);
      setMine(null);
      setLoadState(top.reason);
      return;
    }
    setRows(top.rows);
    setMine(me.ok === true ? me.standing : null);
    setLoadState(top.rows.length === 0 ? 'empty' : 'ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load, accountState.status]);

  const isYou = (entry: BankStanding) =>
    myUsername != null && entry.username.toLowerCase() === myUsername.toLowerCase();
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const mineInTop = rows.some(isYou);
  const showMineBelow = Boolean(mine && !mineInTop && mine.rank > rows.length);
  const wallLeft = Math.max(0, WALL_OF_FAME_GOAL - bank);
  const wallPct = Math.min(1, bank / WALL_OF_FAME_GOAL);
  const rankLabel = mine
    ? t('leaderboard.rankOf', { rank: mine.rank.toLocaleString('en-US') })
    : t('leaderboard.unranked');

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub lbx-screen">
      <LeaderboardBackdrop />
      <header className="oneb-hub__header lb-head">
        <button
          type="button"
          className="lb-help"
          aria-expanded={helpOpen}
          aria-label={t('leaderboard.helpLabel')}
          onClick={() => setHelpOpen((open) => !open)}
        >
          ?
        </button>
        <p className="oneb-hub__eyebrow">{t('leaderboard.eyebrow')}</p>
        <h1 className="oneb-hub__title">{t('leaderboard.title')}</h1>
        <p className="oneb-hub__meta">{t('leaderboard.metaTop')}</p>
        {helpOpen ? <p className="lb-help__note">{t('leaderboard.helpCopy')}</p> : null}
      </header>

      <main className="oneb-hub__scroll lbx-main">
        <motion.section
          className="lbx-mine"
          aria-label={t('leaderboard.myBank')}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="lbx-mine__top">
            <span className="lbx-mine__label">{t('leaderboard.myBank')}</span>
            <span className={`lbx-mine__rank${mine ? ' is-ranked' : ''}`}>
              {isGuestLike ? t('leaderboard.unranked') : rankLabel}
            </span>
          </div>
          <p className="lbx-mine__balance">
            <TickerNumber value={bank} duration={reduceMotion ? 0 : 900} />
          </p>
          <div className="lbx-mine__bar" aria-hidden>
            <motion.span
              initial={reduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: Math.max(wallPct, 0.012) }}
              transition={{ duration: 1, ease: EASE, delay: 0.2 }}
            />
          </div>
          <p className="lbx-mine__goal">
            {wallLeft > 0
              ? t('leaderboard.wallGoal', { amount: formatCash(wallLeft) })
              : t('leaderboard.wallReached')}
          </p>
        </motion.section>

        {loadState === 'loading' ? (
          <ul className="lbx-skeleton" aria-label={t('leaderboard.loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} />
            ))}
          </ul>
        ) : null}

        {loadState === 'unavailable' ? (
          <div className="lbx-state">
            <p className="lbx-state__kicker">{t('leaderboard.comingKicker')}</p>
            <p className="lbx-state__copy">{t('leaderboard.comingCopy')}</p>
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="lbx-state">
            <p className="lbx-state__copy">{t('leaderboard.error')}</p>
            <button type="button" className="lbx-state__btn" onClick={() => void load()}>
              {t('leaderboard.retry')}
            </button>
          </div>
        ) : null}

        {loadState === 'empty' ? (
          <div className="lbx-state">
            <p className="lbx-state__kicker">{t('leaderboard.emptyKicker')}</p>
            <p className="lbx-state__copy">{t('leaderboard.emptyCopy')}</p>
          </div>
        ) : null}

        {loadState === 'ready' && podium.length > 0 ? (
          <section className="lbx-podium" aria-label={t('leaderboard.world')}>
            {[podium[1], podium[0], podium[2]]
              .filter((entry): entry is BankStanding => entry != null)
              .map((entry, i) => (
                <PodiumCard
                  key={entry.username}
                  entry={entry}
                  place={entry.rank === 1 ? 1 : entry.rank === 2 ? 2 : 3}
                  isYou={isYou(entry)}
                  youLabel={t('leaderboard.you')}
                  index={i}
                  reduceMotion={reduceMotion}
                />
              ))}
          </section>
        ) : null}

        {loadState === 'ready' && rest.length > 0 ? (
          <ol className="lbx-list" aria-label={t('leaderboard.world')}>
            {rest.map((entry, i) => (
              <BoardRow
                key={entry.username}
                entry={entry}
                isYou={isYou(entry)}
                youLabel={t('leaderboard.you')}
                index={i}
                reduceMotion={reduceMotion}
              />
            ))}
          </ol>
        ) : null}

        {showMineBelow && mine ? (
          <>
            <div className="lbx-gap" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <ol className="lbx-list">
              <BoardRow
                entry={mine}
                isYou
                youLabel={t('leaderboard.you')}
                index={0}
                reduceMotion={reduceMotion}
              />
            </ol>
          </>
        ) : null}

        {isGuestLike && loadState !== 'loading' ? (
          <div className="lbx-guest">
            <p>{t('leaderboard.guestHint')}</p>
            <button
              type="button"
              className="lbx-guest__btn"
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
