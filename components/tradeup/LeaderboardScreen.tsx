'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchClassicLeaderboardTop,
  fetchClassicLeaderboardTeam,
  fetchMyClassicLeaderboardRank,
  type LeaderboardRow,
  type MyLeaderboardStanding,
} from '@/lib/account/leaderboardCloud';
import {
  resolveLeaderboardLineup,
  type LeaderboardTeamPlayer,
} from '@/lib/account/leaderboardTeamResolve';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { hapticLight } from '@/lib/tradeup/haptics';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';

type LoadState = 'loading' | 'ready' | 'error' | 'empty';

type BoardStanding = LeaderboardRow & {
  /** Sum of million-rounded seated prices. */
  roundedTotal: number;
  /** Sum of whole-dollar seated prices, before the million snap. */
  rawTotal: number;
  /** True when another board team rounds to the same million total. */
  showExact: boolean;
};

function scoreLineup(entry: LeaderboardRow): { roundedTotal: number; rawTotal: number } {
  const players = resolveLeaderboardLineup(entry.lineup);
  if (players.length >= 5) {
    return {
      roundedTotal: players.reduce((sum, player) => sum + Math.round(player.dollarValue), 0),
      rawTotal: players.reduce((sum, player) => sum + Math.round(player.rawDollarValue), 0),
    };
  }
  const stored = Math.max(0, Math.round(entry.verifiedBest));
  return { roundedTotal: stored, rawTotal: stored };
}

/** Highest exact total first. Ties at the displayed million show whole dollars. */
function rankBoard(rows: LeaderboardRow[]): BoardStanding[] {
  const scored = rows.map((entry) => ({ entry, ...scoreLineup(entry) }));
  scored.sort(
    (a, b) => b.rawTotal - a.rawTotal || a.entry.rank - b.entry.rank || a.entry.username.localeCompare(b.entry.username),
  );
  const roundedCounts = new Map<number, number>();
  for (const row of scored) {
    roundedCounts.set(row.roundedTotal, (roundedCounts.get(row.roundedTotal) ?? 0) + 1);
  }
  return scored.map((row, index) => ({
    ...row.entry,
    rank: index + 1,
    roundedTotal: row.roundedTotal,
    rawTotal: row.rawTotal,
    showExact: (roundedCounts.get(row.roundedTotal) ?? 0) > 1,
  }));
}

function formatBoardDollars(value: number, exact: boolean): string {
  const n = Math.max(0, Math.round(value));
  if (!exact) return formatDollars(n);
  return `$${n.toLocaleString('en-US')}`;
}

function displayTotal(entry: BoardStanding): number {
  return entry.showExact ? entry.rawTotal : entry.roundedTotal;
}

function useCountProgress(active: boolean): number {
  const [progress, setProgress] = useState(active ? 0 : 1);
  useEffect(() => {
    if (!active) {
      setProgress(1);
      return;
    }
    setProgress(0);
    const start = performance.now();
    const ms = 1100;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return progress;
}

function countedDollars(value: number, progress: number, exact: boolean): string {
  const target = Math.max(0, Math.round(value));
  if (progress >= 1) return formatBoardDollars(target, exact);
  const eased = 1 - (1 - progress) ** 3;
  const shown = Math.round(target * eased);
  if (!exact && target - shown < 1_000_000) return formatBoardDollars(target, false);
  return formatBoardDollars(shown, exact);
}

function formatPlayerValue(value: number, exact: boolean): string {
  return formatBoardDollars(value, exact);
}

function LeaderboardTeamView({
  entry,
  players,
  loading,
  error,
  onBack,
}: {
  entry: BoardStanding;
  players: LeaderboardTeamPlayer[];
  loading: boolean;
  error: string | null;
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
          <span className="oneb-hub__meta-accent">{formatBoardDollars(displayTotal(entry), entry.showExact)}</span>
        </p>
      </header>

      <main className="oneb-hub__scroll">
        {loading ? (
          <p className="leaderboard-world__status">{t('leaderboard.loading')}</p>
        ) : null}

        {!loading && (error || players.length === 0) ? (
          <div className="leaderboard-world__empty">
            <p className="run-empty__copy">{error ?? t('leaderboard.teamEmpty')}</p>
          </div>
        ) : null}

        {!loading && players.length > 0 ? (
          <ul className="run-ledger leaderboard-team-ledger">
            <li className="run-ledger__card is-open">
              <div className="run-ledger__summary leaderboard-team__summary" aria-hidden>
                <span className="run-ledger__copy">
                  <span className="run-ledger__value-row">
                    <strong>{formatBoardDollars(displayTotal(entry), entry.showExact)}</strong>
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
                        {formatPlayerValue(
                          entry.showExact ? player.rawDollarValue : player.dollarValue,
                          entry.showExact,
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          </ul>
        ) : null}
      </main>
    </div>
  );
}

function BoardRow({
  entry,
  isYou,
  progress,
  onViewTeam,
}: {
  entry: BoardStanding;
  isYou: boolean;
  progress: number;
  onViewTeam: (entry: BoardStanding) => void;
}) {
  const { t } = useLocale();
  const total = displayTotal(entry);

  return (
    <li className={`leaderboard-card${isYou ? ' is-you' : ''}`}>
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
          onClick={() => onViewTeam(entry)}
        >
          {t('leaderboard.viewTeam')}
        </button>
      </div>
      <span className="leaderboard-card__value">{countedDollars(total, progress, entry.showExact)}</span>
    </li>
  );
}

function PodiumCard({
  entry,
  place,
  isYou,
  progress,
  onViewTeam,
}: {
  entry: BoardStanding;
  place: 1 | 2 | 3;
  isYou: boolean;
  progress: number;
  onViewTeam: (entry: BoardStanding) => void;
}) {
  const { t } = useLocale();
  const total = displayTotal(entry);
  const label = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';

  return (
    <article className={`lb-podium__card is-place-${place}${isYou ? ' is-you' : ''}`}>
      <p className="lb-podium__place">{label}</p>
      <h2 className="lb-podium__name">{entry.username}</h2>
      {isYou ? <em className="leaderboard-card__you">{t('leaderboard.you')}</em> : null}
      <p className={`lb-podium__value${entry.showExact ? ' is-exact' : ''}`}>
        {countedDollars(total, progress, entry.showExact)}
      </p>
      <button type="button" className="lb-podium__view" onClick={() => onViewTeam(entry)}>
        {t('leaderboard.viewTeam')}
      </button>
    </article>
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [viewing, setViewing] = useState<BoardStanding | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

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
  const board = useMemo(() => rankBoard(rows), [rows]);
  const mineInTop = Boolean(myUsername && board.some((row) => row.username === myUsername));
  const showMineBelow = Boolean(mine && mine.rank > 100 && !mineInTop);
  const countProgress = useCountProgress(loadState === 'ready' && board.length > 0);
  const podium = board.slice(0, 3);
  const rest = board.slice(3);
  const youOn = (entry: BoardStanding) =>
    isPermanent && myUsername != null && entry.username === myUsername;

  const viewingPlayers = useMemo(
    () => (viewing ? resolveLeaderboardLineup(viewing.lineup) : []),
    [viewing],
  );

  const openTeam = useCallback(async (entry: BoardStanding) => {
    hapticLight();
    setTeamError(null);

    if (entry.lineup.length >= 5) {
      setViewing(entry);
      return;
    }

    setTeamLoading(true);
    setViewing(entry);
    const result = await fetchClassicLeaderboardTeam(entry.username);
    setTeamLoading(false);

    if (result.ok === false) {
      setTeamError(result.message);
      return;
    }
    if (result.lineup.length < 5) {
      setTeamError(t('leaderboard.teamEmpty'));
      return;
    }
    const next = {
      ...entry,
      lineup: result.lineup,
      verifiedBest: result.verifiedBest || entry.verifiedBest,
    };
    const scored = scoreLineup(next);
    setViewing({
      ...next,
      roundedTotal: scored.roundedTotal,
      rawTotal: scored.rawTotal,
      showExact: entry.showExact,
    });
  }, [t]);

  const openAccount = (view: AccountSheetView = 'menu') => {
    setSheetView(view);
    setSheetOpen(true);
  };

  if (viewing) {
    return (
      <LeaderboardTeamView
        entry={viewing}
        players={viewingPlayers}
        loading={teamLoading}
        error={teamError}
        onBack={() => {
          setViewing(null);
          setTeamError(null);
          setTeamLoading(false);
        }}
      />
    );
  }

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <ArenaAtmosphere intensity="hub" />
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

        {loadState === 'ready' && podium.length > 0 ? (
          <div className="lb-podium" aria-label="Top three">
            {[podium[1], podium[0], podium[2]]
              .filter((entry): entry is LeaderboardRow => entry != null)
              .map((entry) => (
              <PodiumCard
                key={`${entry.rank}-${entry.username}`}
                entry={entry}
                place={entry.rank === 1 ? 1 : entry.rank === 2 ? 2 : 3}
                isYou={youOn(entry)}
                progress={countProgress}
                onViewTeam={(next) => {
                  void openTeam(next);
                }}
              />
            ))}
          </div>
        ) : null}

        {loadState === 'ready' && rest.length > 0 ? (
          <ul className="leaderboard-board" aria-label={t('leaderboard.world')}>
            {rest.map((entry) => (
              <BoardRow
                key={`${entry.rank}-${entry.username}`}
                entry={entry}
                isYou={youOn(entry)}
                progress={countProgress}
                onViewTeam={(next) => {
                  void openTeam(next);
                }}
              />
            ))}
          </ul>
        ) : null}

        {showMineBelow && mine ? (
          <>
            <div className="leaderboard-world__divider" aria-hidden />
            <ul className="leaderboard-board">
              <BoardRow
                entry={{
                  ...mine,
                  ...scoreLineup(mine),
                  showExact: board.some((row) => row.roundedTotal === scoreLineup(mine).roundedTotal),
                }}
                isYou
                progress={1}
                onViewTeam={(entry) => {
                  void openTeam(entry);
                }}
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
