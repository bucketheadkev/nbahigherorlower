'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchClassicLeaderboardTop,
  fetchMyClassicLeaderboardRank,
  type LeaderboardRow,
  type MyLeaderboardStanding,
} from '@/lib/account/leaderboardCloud';
import {
  resolveLeaderboardLineup,
  type LeaderboardTeamPlayer,
} from '@/lib/account/leaderboardTeamResolve';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { hapticLight } from '@/lib/tradeup/haptics';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';

type LoadState = 'loading' | 'ready' | 'error' | 'empty';

/** Exact roster value for leaderboard — whole millions, no soft rounding. */
function formatExactBoardValue(value: number): string {
  const rounded = Math.round(value);
  if (rounded >= 1_000_000_000) {
    const billions = rounded / 1_000_000_000;
    return `$${Number.isInteger(billions) ? billions.toFixed(0) : billions.toFixed(2)}B`;
  }
  if (rounded >= 1_000_000) {
    const millions = rounded / 1_000_000;
    return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  return formatDollarsExact(rounded);
}

function formatPlayerValue(value: number): string {
  const millions = Math.round(value) / 1_000_000;
  if (millions >= 1000) {
    const billions = millions / 1000;
    return `$${Number.isInteger(billions) ? billions.toFixed(0) : billions.toFixed(2)}B`;
  }
  return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
}

function LeaderboardTeamView({
  entry,
  players,
  onBack,
}: {
  entry: LeaderboardRow;
  players: LeaderboardTeamPlayer[];
  onBack: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <ArenaAtmosphere intensity="hub" />
      <header className="oneb-hub__header">
        <button type="button" className="leaderboard-team__back" onClick={onBack}>
          {t('leaderboard.back')}
        </button>
        <p className="oneb-hub__eyebrow">{t('leaderboard.teamEyebrow')}</p>
        <h1 className="oneb-hub__title">{entry.username}</h1>
        <p className="oneb-hub__meta">
          #{entry.rank.toLocaleString('en-US')}
          {' · '}
          <span className="oneb-hub__meta-accent">{formatExactBoardValue(entry.verifiedBest)}</span>
        </p>
      </header>

      <main className="oneb-hub__scroll">
        {players.length === 0 ? (
          <div className="leaderboard-world__empty">
            <p className="run-empty__copy">{t('leaderboard.teamEmpty')}</p>
          </div>
        ) : (
          <ul className="run-ledger leaderboard-team-ledger">
            <li className="run-ledger__card is-best is-open">
              <div className="run-ledger__summary leaderboard-team__summary" aria-hidden>
                <span className="run-ledger__copy">
                  <span className="run-ledger__value-row">
                    <strong>{formatExactBoardValue(entry.verifiedBest)}</strong>
                  </span>
                  <em>{t('leaderboard.verifiedLineup')}</em>
                </span>
              </div>
              <ul className="run-ledger__players">
                {players.map((player) => {
                  const primary = player.teamId
                    ? getTeamColors(player.teamId).primary
                    : '#333333';
                  const ink = contrastOnPrimary(primary);
                  return (
                    <li
                      key={`${player.playerId}-${player.position}`}
                      className="run-ledger__player-row leaderboard-team__player"
                      style={
                        {
                          ['--row-accent' as string]: primary,
                          ['--row-ink' as string]: ink,
                          backgroundColor: primary,
                          color: ink,
                        } as CSSProperties
                      }
                    >
                      <span className="run-ledger__pos">{player.position}</span>
                      <span className="run-ledger__meta">
                        <strong>{player.name}</strong>
                        <em>
                          {player.teamName}
                          {player.era !== '—' ? ` · ${player.era}` : ''}
                        </em>
                      </span>
                      <span className="run-ledger__val">
                        {formatPlayerValue(player.dollarValue)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          </ul>
        )}
      </main>
    </div>
  );
}

function BoardRow({
  entry,
  isYou,
  onViewTeam,
}: {
  entry: LeaderboardRow;
  isYou: boolean;
  onViewTeam: (entry: LeaderboardRow) => void;
}) {
  const { t } = useLocale();
  const placeClass =
    entry.rank === 1
      ? ' is-first'
      : entry.rank === 2
        ? ' is-second'
        : entry.rank === 3
          ? ' is-third'
          : '';

  return (
    <li className={`leaderboard-card${placeClass}${isYou ? ' is-you' : ''}`}>
      <span className="leaderboard-card__place" aria-label={`Rank ${entry.rank}`}>
        {entry.rank}
      </span>
      <div className="leaderboard-card__body">
        <div className="leaderboard-card__name-row">
          <strong>{entry.username}</strong>
          {isYou ? <em className="leaderboard-card__you">{t('leaderboard.you')}</em> : null}
        </div>
        <button
          type="button"
          className="leaderboard-card__view"
          onClick={() => {
            hapticLight();
            onViewTeam(entry);
          }}
        >
          {t('leaderboard.viewTeam')}
        </button>
      </div>
      <span className="leaderboard-card__value">{formatExactBoardValue(entry.verifiedBest)}</span>
    </li>
  );
}

export function LeaderboardScreen() {
  const { t } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [mine, setMine] = useState<MyLeaderboardStanding | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [viewing, setViewing] = useState<LeaderboardRow | null>(null);

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
  const mineInTop = Boolean(
    mine &&
      myUsername &&
      rows.some((row) => row.rank === mine.rank && row.username === mine.username),
  );
  const showMineBelow = Boolean(mine && mine.rank > 100 && !mineInTop);

  const viewingPlayers = useMemo(
    () => (viewing ? resolveLeaderboardLineup(viewing.lineup) : []),
    [viewing],
  );

  const openAccount = (view: AccountSheetView = 'menu') => {
    setSheetView(view);
    setSheetOpen(true);
  };

  if (viewing) {
    return (
      <LeaderboardTeamView
        entry={viewing}
        players={viewingPlayers}
        onBack={() => setViewing(null)}
      />
    );
  }

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
            {rows.map((entry) => (
              <BoardRow
                key={`${entry.rank}-${entry.username}`}
                entry={entry}
                isYou={
                  isPermanent &&
                  mine != null &&
                  entry.rank === mine.rank &&
                  entry.username === mine.username
                }
                onViewTeam={setViewing}
              />
            ))}
          </ul>
        ) : null}

        {showMineBelow && mine ? (
          <>
            <div className="leaderboard-world__divider" aria-hidden />
            <ul className="leaderboard-board">
              <BoardRow
                entry={{ ...mine, rank: mine.rank }}
                isYou
                onViewTeam={setViewing}
              />
            </ul>
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
