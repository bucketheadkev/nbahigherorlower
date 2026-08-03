'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  enterRoundButtonLabel,
  nextPlayoffRound,
  playoffRoundLabel,
  type PlayoffRoundId,
} from '@/lib/tradeup/historicalPlayoffTeams';
import {
  advanceSeriesGame,
  createPlayoffRun,
  startPlayoffSeries,
  type PlayoffRunState,
} from '@/lib/tradeup/playoffSeries';
import {
  createPlayoffBracket,
  ensureUserRoundReady,
  syncBracketWithUserSeries,
  type PlayoffBracketState,
} from '@/lib/tradeup/playoffBracket';
import type { HistoricalPlayoffTeam } from '@/lib/tradeup/historicalPlayoffTeams';
import { awardNbaChampionshipRing } from '@/lib/tradeup/achievements';
import { getPlayerSimulationStrength } from '@/lib/tradeup/lineupSeason';
import { deriveSeasonStanding } from '@/lib/tradeup/seasonStanding';
import { formatUserTeamLabel, type UserTeamIdentity } from '@/lib/tradeup/userTeam';
import type { SeasonRecord } from '@/lib/tradeup/lineupSeason';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { GameBackground } from './game/GameBackground';
import { TradeUpLogo } from './TradeUpLogo';
import { ChampionshipCelebration } from './ChampionshipCelebration';
import { ChampionshipRingVisual } from './ChampionshipRingVisual';
import { PlayoffBracketView } from './PlayoffBracketView';

type Phase = 'series' | 'between' | 'champion' | 'eliminated';

interface PlayoffRunScreenProps {
  players: Array<{ slot: Position; player: TradePlayer }>;
  record: SeasonRecord;
  userTeam: UserTeamIdentity | null;
  onExit: () => void;
  onPlayAgain: () => void;
  onChampionshipWon?: () => void;
}

const GAME_DELAY_REDUCED_MS = 700;
const PRE_SCORE_MS = 2200;
const PRE_SCORE_REDUCED_MS = 500;
const POST_SCORE_MS = 1800;
const POST_SCORE_REDUCED_MS = 450;

function nextGameDelay(reduceMotion: boolean, stage: 'pre' | 'post'): number {
  if (reduceMotion) return stage === 'pre' ? PRE_SCORE_REDUCED_MS : POST_SCORE_REDUCED_MS;
  if (stage === 'pre') return PRE_SCORE_MS + Math.floor(Math.random() * 600);
  return POST_SCORE_MS + Math.floor(Math.random() * 900);
}

function pickFinalsMvp(players: Array<{ player: TradePlayer }>): TradePlayer {
  return players.reduce((best, entry) => {
    const bestScore = getPlayerSimulationStrength(best.player);
    const nextScore = getPlayerSimulationStrength(entry.player);
    return nextScore > bestScore ? entry : best;
  }).player;
}

export function PlayoffRunScreen({
  players,
  record,
  userTeam,
  onExit,
  onPlayAgain,
  onChampionshipWon,
}: PlayoffRunScreenProps) {
  const [run, setRun] = useState<PlayoffRunState>(() => createPlayoffRun(record));
  const [phase, setPhase] = useState<Phase>('series');
  const [simulating, setSimulating] = useState(false);
  const [pendingRound, setPendingRound] = useState<PlayoffRoundId>('first_round');
  const [seriesToken, setSeriesToken] = useState(0);
  const [finalsMvp, setFinalsMvp] = useState<TradePlayer | null>(null);
  const [bracket, setBracket] = useState<PlayoffBracketState | null>(null);
  const [championReveal, setChampionReveal] = useState(false);
  const [focusGame, setFocusGame] = useState(1);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const awardedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const runRef = useRef(run);
  const bracketRef = useRef<PlayoffBracketState | null>(null);
  const {
    playAccept,
    playChampionship,
    playDefeat,
    playVictory,
    playBattleRoundWin,
    playBattleRoundLoss,
    resume,
    playTap,
  } = useSound();

  const lineupNames = useMemo(() => players.map(({ player }) => player.name), [players]);
  const teamLabel = formatUserTeamLabel(userTeam);
  const standing = useMemo(
    () => deriveSeasonStanding(record.wins, record.losses),
    [record.wins, record.losses],
  );

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    bracketRef.current = bracket;
  }, [bracket]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const ensureBracket = useCallback((): PlayoffBracketState | null => {
    if (bracketRef.current) return bracketRef.current;
    if (!userTeam) return null;
    const seed = Math.min(8, Math.max(1, standing.seed || 8));
    const next = createPlayoffBracket({
      identity: userTeam,
      userSeed: seed,
      lineupScore: record.analysis.lineupScore,
      userWins: record.wins,
      userLosses: record.losses,
    });
    bracketRef.current = next;
    setBracket(next);
    return next;
  }, [userTeam, standing.seed, record.analysis.lineupScore, record.wins, record.losses]);

  const opponentFromBracket = useCallback(
    (round: PlayoffRoundId, active: PlayoffBracketState): HistoricalPlayoffTeam | undefined => {
      const match = active.series.find(
        (s) =>
          s.round === round &&
          (s.high.isUser || s.low.isUser) &&
          s.status !== 'complete',
      );
      if (!match) return undefined;
      const foe = match.high.isUser ? match.low : match.high;
      return {
        id: foe.id,
        year: new Date().getFullYear(),
        city: foe.label.split(' ')[0] ?? foe.short,
        name: foe.short,
        label: foe.label,
        conference: active.userConference,
        deepestRound: round,
        strength: foe.strength,
      };
    },
    [],
  );

  const beginRound = useCallback(
    (round: PlayoffRoundId) => {
      resume();
      playTap();

      let active = ensureBracket();
      if (active) {
        active = ensureUserRoundReady(active, round);
        bracketRef.current = active;
        setBracket(active);
      }

      const forced = active ? opponentFromBracket(round, active) : undefined;
      setRun((current) => {
        const next = startPlayoffSeries(current, round, forced);
        runRef.current = next;
        return next;
      });
      setPhase('series');
      setSimulating(true);
      setFocusGame(1);
      setScoreRevealed(false);
      setSeriesToken((value) => value + 1);
    },
    [playTap, resume, ensureBracket, opponentFromBracket],
  );

  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    beginRound('first_round');
  }, [beginRound]);

  useEffect(() => {
    if (phase !== 'series' || !simulating || seriesToken === 0) return;

    const reduceMotion = getPrefersReducedMotion();
    let cancelled = false;

    const finishSeries = (next: PlayoffRunState) => {
      if (cancelled) return;
      setSimulating(false);
      setScoreRevealed(true);
      const series = next.series;
      if (!series?.complete) return;
      if (series.userWonSeries) {
        playVictory();
        if (next.champion) {
          const mvp = pickFinalsMvp(players);
          setFinalsMvp(mvp);
          setPhase('champion');
          playChampionship();
        } else {
          const following = nextPlayoffRound(series.round);
          if (following) setPendingRound(following);
          setPhase('between');
        }
      } else {
        playDefeat();
        setPhase('eliminated');
      }
    };

    const revealThenContinue = () => {
      if (cancelled) return;
      const current = runRef.current;
      if (!current.series || current.series.complete) {
        setSimulating(false);
        return;
      }

      const gameNumber = current.series.games.length + 1;
      setFocusGame(gameNumber);
      setScoreRevealed(false);

      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        const next = advanceSeriesGame(runRef.current);
        runRef.current = next;
        setRun(next);
        setScoreRevealed(true);

        if (bracketRef.current && next.series) {
          const synced = syncBracketWithUserSeries(bracketRef.current, {
            userRound: next.series.round,
            userWins: next.series.userWins,
            opponentWins: next.series.opponentWins,
            userSeriesComplete: next.series.complete,
            userWonSeries: next.series.userWonSeries,
            opponentLabel: next.series.opponent.label,
          });
          bracketRef.current = synced;
          setBracket(synced);
        }

        const last = next.series?.games[next.series.games.length - 1];
        if (last?.result === 'W') playBattleRoundWin();
        else if (last?.result === 'L') playBattleRoundLoss();

        if (next.series?.complete) {
          timerRef.current = window.setTimeout(
            () => finishSeries(next),
            reduceMotion ? 320 : 1100,
          );
          return;
        }

        timerRef.current = window.setTimeout(
          revealThenContinue,
          nextGameDelay(reduceMotion, 'post'),
        );
      }, nextGameDelay(reduceMotion, 'pre'));
    };

    timerRef.current = window.setTimeout(revealThenContinue, reduceMotion ? 180 : 500);

    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [
    phase,
    simulating,
    seriesToken,
    players,
    playChampionship,
    playDefeat,
    playVictory,
    playBattleRoundWin,
    playBattleRoundLoss,
  ]);

  useEffect(() => {
    if (phase !== 'champion' || awardedRef.current) return;
    awardedRef.current = true;
    awardNbaChampionshipRing({
      lineupNames,
      seasonWins: record.wins,
      seasonLosses: record.losses,
      path: run.pathLabels,
    });
    onChampionshipWon?.();
  }, [phase, lineupNames, record.wins, record.losses, run.pathLabels, onChampionshipWon]);

  const series = run.series;
  const nextLabel = enterRoundButtonLabel(pendingRound);
  const latestGame = series?.games[series.games.length - 1] ?? null;
  const showHome = phase === 'champion' || phase === 'eliminated';
  const showBracket = Boolean(bracket) && (phase === 'between' || phase === 'eliminated');
  const roundTitle =
    phase === 'champion'
      ? 'NBA Champions'
      : phase === 'eliminated'
        ? 'Season Over'
        : series
          ? playoffRoundLabel(series.round)
          : 'Playoffs';

  return (
    <div className={`tradeup-shell playoff-screen playoff-screen--${phase}${phase === 'series' ? ' playoff-screen--focus' : ''}`}>
      <GameBackground />

      {phase === 'champion' && !championReveal ? (
        <ChampionshipCelebration
          active
          teamLabel={teamLabel}
          mvpName={finalsMvp?.name}
          onFinished={() => setChampionReveal(true)}
        />
      ) : null}

      <main className={`playoff-screen__content${showBracket ? ' playoff-screen__content--split' : ' playoff-screen__content--focus'}`}>
        <header className="playoff-screen__header playoff-screen__header--hero">
          {showHome && (championReveal || phase === 'eliminated') ? (
            <button type="button" className="tu-back" onClick={onExit}>
              ← Home
            </button>
          ) : (
            <span className="playoff-screen__header-spacer" aria-hidden />
          )}
          <div className="playoff-screen__brand">
            <TradeUpLogo size="xs" className="game-screen-brand" />
            <p className="playoff-screen__eyebrow">Postseason</p>
          </div>
          <h1 className="playoff-screen__title playoff-screen__title--xl">{roundTitle}</h1>
        </header>

        {series && (phase === 'series' || phase === 'between' || phase === 'eliminated') ? (
          <section
            className={`playoff-live playoff-live--hero${phase === 'series' && simulating ? ' is-simming' : ''}${
              scoreRevealed && latestGame ? ` playoff-live--${latestGame.result.toLowerCase()}` : ''
            }`}
            aria-live="polite"
          >
            <div className="playoff-live__topline">
              <span>
                {teamLabel} vs {series.opponent.name}
              </span>
              <strong>
                Series {series.userWins}–{series.opponentWins}
              </strong>
            </div>

            {phase === 'series' && simulating ? (
              <div
                key={`tip-${focusGame}-${scoreRevealed ? 'score' : 'wait'}`}
                className={`playoff-live__tip${scoreRevealed ? ' is-final' : ' is-waiting'}`}
                aria-live="assertive"
              >
                <span className="playoff-live__pulse" aria-hidden />
                <p className="playoff-live__game-label">GAME {focusGame}</p>
                {scoreRevealed && latestGame ? (
                  <strong className="playoff-live__score-line">
                    {latestGame.userScore}–{latestGame.opponentScore}
                    <span>{latestGame.result === 'W' ? 'WIN' : 'LOSS'}</span>
                  </strong>
                ) : (
                  <strong className="playoff-live__score-line playoff-live__score-line--pending">
                    Simulating…
                  </strong>
                )}
              </div>
            ) : null}

            {series.complete ? (
              <p
                className={`playoff-live__series-end${
                  series.userWonSeries ? ' is-win' : ' is-loss'
                }`}
              >
                {series.userWonSeries
                  ? `Series won ${series.userWins}–${series.opponentWins}`
                  : `Eliminated · ${series.userWins}–${series.opponentWins}`}
              </p>
            ) : null}

            <div className="playoff-live__pips" aria-label="Series games">
              {Array.from({ length: 7 }, (_, index) => {
                const game = series.games[index];
                const isFocus = phase === 'series' && simulating && index + 1 === focusGame;
                return (
                  <span
                    key={`${seriesToken}-${index}-${game?.result ?? 'p'}`}
                    className={
                      game
                        ? `is-${game.result.toLowerCase()}${
                            index === series.games.length - 1 && scoreRevealed ? ' is-latest' : ''
                          }`
                        : isFocus
                          ? 'is-focus'
                          : 'is-pending'
                    }
                  >
                    {game && (scoreRevealed || index < series.games.length - 1)
                      ? game.result
                      : index + 1}
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}

        {showBracket ? (
          <div className="playoff-bracket-stage">
            <PlayoffBracketView
              bracket={bracket!}
              showFinals={
                series?.round === 'nba_finals' ||
                pendingRound === 'nba_finals' ||
                Boolean(
                  bracket!.series.some(
                    (s) =>
                      s.round === 'nba_finals' &&
                      (s.status === 'active' || s.status === 'complete'),
                  ),
                )
              }
            />
          </div>
        ) : null}

        {phase === 'between' ? (
          <div className="playoff-next-bar">
            <button
              type="button"
              className="tu-btn tu-btn--primary playoff-next-bar__btn"
              onClick={() => beginRound(pendingRound)}
            >
              {nextLabel}
            </button>
          </div>
        ) : null}

        {phase === 'champion' && championReveal ? (
          <section className="playoff-champion" aria-live="polite">
            <ChampionshipRingVisual size="lg" />
            <h2>NBA Champions</h2>
            <p>The {teamLabel} win the title.</p>
            {finalsMvp ? (
              <div className="playoff-champion__mvp">
                <span>Finals MVP</span>
                <strong>{finalsMvp.name}</strong>
              </div>
            ) : null}
            <ul className="playoff-champion__lineup">
              {lineupNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <div className="playoff-screen__actions">
              <button type="button" className="tu-btn tu-btn--primary" onClick={onPlayAgain}>
                Build Another Dynasty
              </button>
              <button type="button" className="tu-btn tu-btn--secondary" onClick={onExit}>
                Home
              </button>
            </div>
          </section>
        ) : null}

        {phase === 'eliminated' ? (
          <div className="playoff-screen__actions">
            <button
              type="button"
              className="tu-btn tu-btn--primary"
              onClick={() => {
                playAccept();
                onPlayAgain();
              }}
            >
              Build Another Dynasty
            </button>
            <button type="button" className="tu-btn tu-btn--secondary" onClick={onExit}>
              Home
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
