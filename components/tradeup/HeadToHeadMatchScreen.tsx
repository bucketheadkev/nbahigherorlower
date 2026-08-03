'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  hydrateOpponentFromIds,
  type LineupSlotPlayer,
} from '@/lib/tradeup/headToHead';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { LineupMatchState } from '@/lib/tradeup/lineupStorage';
import type { Position } from '@/lib/tradeup/types';
import { useSound } from '@/hooks/useSound';
import { GameBackground } from './game/GameBackground';
import { PlayerCardVisual } from './PlayerCardVisual';

type MatchPhase = 'matchmaking' | 'intro' | 'battle' | 'result';
type BattleAnim = 'idle' | 'present' | 'charge' | 'lunge' | 'impact' | 'knockout' | 'tally';
type PaceMode = 'normal' | 'fast' | 'skip';

const MATCHMAKING_STATUSES = [
  'FINDING OPPONENT',
  'Searching…',
  'Checking matchup strength…',
  'Preparing matchup…',
  'OPPONENT FOUND',
] as const;

interface HeadToHeadMatchScreenProps {
  userLineup: LineupSlotPlayer[];
  match: LineupMatchState;
  onBeginMatch: () => void;
  onResolveMatch: () => void;
  onSetPhase: (phase: MatchPhase) => void;
  onMarkTrophiesApplied: () => void;
  onExit: () => void;
  onPlayAgain: () => void;
  onSimulateSeason?: () => void;
}

function MiniCard({
  slot,
  player,
  dimmed,
  size = 'default',
}: {
  slot: Position;
  player: LineupSlotPlayer['player'];
  dimmed?: boolean;
  size?: 'default' | 'preview';
}) {
  const isPreview = size === 'preview';
  return (
    <div
      className={`h2h-mini-card h2h-mini-card--meta${isPreview ? ' h2h-mini-card--preview' : ''}${
        dimmed ? ' h2h-mini-card--out' : ''
      }`}
    >
      <PlayerCardVisual
        player={player}
        slot={slot}
        variant="meta"
        size={isPreview ? 'md' : 'sm'}
      />
    </div>
  );
}

function LineupStatusTile({
  slot,
  player,
  knocked,
  winPulse,
  isActive,
}: {
  slot: Position;
  player: LineupSlotPlayer['player'];
  knocked: boolean;
  winPulse: boolean;
  isActive: boolean;
}) {
  return (
    <div
      className={[
        'h2h-status-tile',
        'h2h-status-tile--meta',
        knocked ? 'is-out' : '',
        winPulse ? 'is-win-pulse' : '',
        isActive ? 'is-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${slot} ${player.name}${knocked ? ' knocked out' : ''}`}
    >
      <PlayerCardVisual player={player} slot={slot} variant="meta" size="sm" />
      {knocked ? (
        <span className="h2h-status-tile__ko" aria-hidden>
          KO
        </span>
      ) : null}
    </div>
  );
}

function BattleCard({
  side,
  slot,
  player,
  anim,
  isWinner,
}: {
  side: 'user' | 'opp';
  slot: Position;
  player: LineupSlotPlayer['player'];
  anim: BattleAnim;
  isWinner: boolean | null;
}) {
  return (
    <div
      className={[
        'h2h-battle-card',
        'h2h-battle-card--meta',
        `h2h-battle-card--${side}`,
        `h2h-battle-card--${anim}`,
        isWinner === true ? 'h2h-battle-card--winner' : '',
        isWinner === false ? 'h2h-battle-card--loser' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="h2h-battle-card__face h2h-battle-card__face--meta">
        <PlayerCardVisual player={player} slot={slot} variant="meta" size="lg" />
      </div>
      <span className="h2h-battle-card__flash" aria-hidden />
    </div>
  );
}

export function HeadToHeadMatchScreen({
  userLineup,
  match,
  onBeginMatch,
  onResolveMatch,
  onSetPhase,
  onMarkTrophiesApplied,
  onExit,
  onPlayAgain,
  onSimulateSeason,
}: HeadToHeadMatchScreenProps) {
  const reduceMotion = useGameReducedMotion();
  const {
    resume,
    playMatchmaking,
    playOpponentFound,
    playOpponentReveal,
    playBattleRoundAppear,
    playBattleCharge,
    playBattleLunge,
    playBattleSlap,
    playBattleKnockout,
    playBattleCounter,
    playBattleRoundWin,
    playBattleRoundLoss,
    playVictory,
    playPerfectSweep,
    playDefeat,
    playTap,
  } = useSound();

  const phase = match.phase;
  const opponent = useMemo(
    () => hydrateOpponentFromIds(match.opponentIds) ?? [],
    [match.opponentIds],
  );

  const [statusLine, setStatusLine] = useState<string>(MATCHMAKING_STATUSES[0]);
  const [matchmakingFound, setMatchmakingFound] = useState(false);
  const [resultReady, setResultReady] = useState(phase === 'result');
  const [roundIndex, setRoundIndex] = useState(0);
  const [battleAnim, setBattleAnim] = useState<BattleAnim>('idle');
  const [userAlive, setUserAlive] = useState(5);
  const [oppAlive, setOppAlive] = useState(5);
  const [knockedUser, setKnockedUser] = useState<Set<Position>>(() => new Set());
  const [knockedOpp, setKnockedOpp] = useState<Set<Position>>(() => new Set());
  const [pulseWinner, setPulseWinner] = useState<{ side: 'user' | 'opp'; slot: Position } | null>(
    null,
  );
  const [pace, setPace] = useState<PaceMode>('normal');
  const [showMatchupReview, setShowMatchupReview] = useState(false);
  const [isSweep, setIsSweep] = useState(false);

  const trophyLockRef = useRef(false);
  const matchmakingSoundPlayedRef = useRef(false);
  const matchmakingAdvanceLockRef = useRef(false);
  const resultSoundPlayedRef = useRef(false);
  const battleStartedRef = useRef(false);
  const resolveRequestedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const paceRef = useRef<PaceMode>('normal');
  const skipRef = useRef(false);
  const activeMatchIdRef = useRef(match.matchId);

  if (activeMatchIdRef.current !== match.matchId) {
    activeMatchIdRef.current = match.matchId;
    matchmakingSoundPlayedRef.current = false;
    matchmakingAdvanceLockRef.current = false;
    resultSoundPlayedRef.current = false;
    battleStartedRef.current = false;
    resolveRequestedRef.current = false;
  }

  useEffect(() => {
    paceRef.current = pace;
  }, [pace]);

  useEffect(() => {
    onBeginMatch();
  }, [onBeginMatch]);

  const resultHydratedRef = useRef(false);
  const shouldHydrateFinishedResult = useRef(
    phase === 'result' && Boolean(match.trophiesApplied),
  );

  // Remount / refresh on an already-finished match.
  useEffect(() => {
    if (!shouldHydrateFinishedResult.current || resultHydratedRef.current) return;
    if (!match.result) return;
    resultHydratedRef.current = true;
    const sweep =
      Boolean(match.result.sweep) ||
      (match.result.won &&
        match.result.userSurviving === 5 &&
        match.result.opponentSurviving === 0);
    setIsSweep(sweep);
    trophyLockRef.current = true;
  }, [match.result]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const queue = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const scale = useCallback((ms: number) => {
    if (reduceMotion || paceRef.current === 'fast') return Math.max(40, Math.round(ms * 0.45));
    return ms;
  }, [reduceMotion]);

  // Matchmaking → intro (2–4s with slight variation; opponent already generated once upstream)
  useEffect(() => {
    if (phase !== 'matchmaking') return;
    if (matchmakingAdvanceLockRef.current) return;

    let cancelled = false;
    const timers: number[] = [];
    const searchMs = reduceMotion
      ? 420
      : 3000 + Math.floor(Math.random() * 4000); // 3–7s

    setMatchmakingFound(false);
    setStatusLine(MATCHMAKING_STATUSES[0]);

    if (!matchmakingSoundPlayedRef.current) {
      matchmakingSoundPlayedRef.current = true;
      resume();
      playMatchmaking();
    }

    const queueStatus = (index: number, atMs: number) => {
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          const next = MATCHMAKING_STATUSES[index];
          if (!next) return;
          setStatusLine(next);
          if (index === MATCHMAKING_STATUSES.length - 1) {
            setMatchmakingFound(true);
            playOpponentFound();
          }
        }, atMs),
      );
    };

    if (reduceMotion) {
      queueStatus(MATCHMAKING_STATUSES.length - 1, 180);
    } else {
      // Cycle neutral statuses across the search window, then impact + handoff.
      queueStatus(1, Math.round(searchMs * 0.18));
      queueStatus(2, Math.round(searchMs * 0.38));
      queueStatus(3, Math.round(searchMs * 0.58));
      queueStatus(4, Math.round(searchMs * 0.78));
    }

    timers.push(
      window.setTimeout(() => {
        if (cancelled || matchmakingAdvanceLockRef.current) return;
        matchmakingAdvanceLockRef.current = true;
        onSetPhase('intro');
      }, searchMs),
    );

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [phase, onSetPhase, playMatchmaking, playOpponentFound, reduceMotion, resume]);

  // Intro: show both lineups briefly, then resolve once and enter battle
  // Comment retained for match flow: preview duration is intentionally 4s (reduced-motion: 500ms).
  useEffect(() => {
    if (phase !== 'intro') return;
    let cancelled = false;
    const introMs = reduceMotion ? 500 : 4000;
    resume();
    playOpponentReveal();
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (!match.result && !resolveRequestedRef.current) {
        resolveRequestedRef.current = true;
        onResolveMatch();
      }
      onSetPhase('battle');
    }, introMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    phase,
    match.result,
    onResolveMatch,
    onSetPhase,
    playOpponentReveal,
    reduceMotion,
    resume,
  ]);

  // If battle phase but no result yet, request resolve
  useEffect(() => {
    if (phase !== 'battle' || match.result || resolveRequestedRef.current) return;
    resolveRequestedRef.current = true;
    onResolveMatch();
  }, [phase, match.result, onResolveMatch]);

  const finishToResult = useCallback(() => {
    if (!match.result) {
      onSetPhase('result');
      setResultReady(true);
      return;
    }

    const sweep =
      Boolean(match.result.sweep) ||
      (match.result.won &&
        match.result.userSurviving === 5 &&
        match.result.opponentSurviving === 0);
    setIsSweep(sweep);

    if (!trophyLockRef.current) {
      trophyLockRef.current = true;
      if (!match.trophiesApplied) onMarkTrophiesApplied();
    }
    onSetPhase('result');
    setResultReady(true);
  }, [match.result, match.trophiesApplied, onMarkTrophiesApplied, onSetPhase]);

  const applyRoundKnockout = useCallback((slot: Position, userWon: boolean) => {
    if (userWon) {
      setOppAlive((value) => Math.max(0, value - 1));
      setKnockedOpp((current) => new Set(current).add(slot));
      setPulseWinner({ side: 'user', slot });
    } else {
      setUserAlive((value) => Math.max(0, value - 1));
      setKnockedUser((current) => new Set(current).add(slot));
      setPulseWinner({ side: 'opp', slot });
    }
    playBattleCounter();
    queue(() => setPulseWinner(null), 650);
  }, [playBattleCounter, queue]);

  // Battle sequence — uses locked slotResults only
  useEffect(() => {
    if (phase !== 'battle' || !match.result?.slotResults?.length) return;
    if (battleStartedRef.current) return;
    battleStartedRef.current = true;
    skipRef.current = false;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    const results = match.result.slotResults;
    let cancelled = false;

    const runRound = (index: number) => {
      if (cancelled || skipRef.current) return;
      if (index >= results.length) {
        queue(() => {
          if (!cancelled) finishToResult();
        }, scale(500));
        return;
      }

      const round = results[index]!;
      setRoundIndex(index);
      setBattleAnim('present');
      playBattleRoundAppear();

      queue(() => {
        if (cancelled || skipRef.current) return;
        setBattleAnim('charge');
        playBattleCharge();
      }, scale(850));

      queue(() => {
        if (cancelled || skipRef.current) return;
        setBattleAnim('lunge');
        playBattleLunge();
      }, scale(850 + 550));

      queue(() => {
        if (cancelled || skipRef.current) return;
        setBattleAnim('impact');
        playBattleSlap();
      }, scale(850 + 550 + 280));

      queue(() => {
        if (cancelled || skipRef.current) return;
        setBattleAnim('knockout');
        playBattleKnockout();
        applyRoundKnockout(round.slot, round.userWon);
        if (round.userWon) playBattleRoundWin();
        else playBattleRoundLoss();
      }, scale(850 + 550 + 280 + 220));

      queue(() => {
        if (cancelled || skipRef.current) return;
        setBattleAnim('tally');
      }, scale(850 + 550 + 280 + 220 + 350));

      queue(() => {
        if (cancelled || skipRef.current) return;
        setBattleAnim('idle');
        runRound(index + 1);
      }, scale(850 + 550 + 280 + 220 + 350 + 280));
    };

    runRound(0);

    return () => {
      cancelled = true;
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [
    phase,
    match.result,
    applyRoundKnockout,
    finishToResult,
    playBattleCharge,
    playBattleKnockout,
    playBattleLunge,
    playBattleRoundAppear,
    playBattleRoundLoss,
    playBattleRoundWin,
    playBattleSlap,
    queue,
    scale,
  ]);

  // Skip to predetermined result
  useEffect(() => {
    if (pace !== 'skip' || phase !== 'battle' || !match.result) return;
    skipRef.current = true;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    const knockedU = new Set<Position>();
    const knockedO = new Set<Position>();
    let u = 5;
    let o = 5;
    for (const round of match.result.slotResults) {
      if (round.userWon) {
        o -= 1;
        knockedO.add(round.slot);
      } else {
        u -= 1;
        knockedU.add(round.slot);
      }
    }
    setUserAlive(u);
    setOppAlive(o);
    setKnockedUser(knockedU);
    setKnockedOpp(knockedO);
    setRoundIndex(4);
    setBattleAnim('idle');
    finishToResult();
  }, [pace, phase, match.result, finishToResult]);

  useEffect(() => {
    if (phase !== 'result' || !resultReady || !match.result || resultSoundPlayedRef.current) return;
    resultSoundPlayedRef.current = true;

    if (!match.result.won) {
      playDefeat();
      return;
    }

    playVictory();
    if (isSweep) {
      queue(() => playPerfectSweep(), reduceMotion ? 220 : 720);
    }
  }, [
    phase,
    resultReady,
    match.result,
    isSweep,
    reduceMotion,
    playVictory,
    playPerfectSweep,
    playDefeat,
    queue,
  ]);

  const won = match.result?.won ?? false;
  const currentSlot = LINEUP_POSITIONS[Math.min(roundIndex, 4)]!;
  const userFighter = userLineup.find((entry) => entry.slot === currentSlot)?.player;
  const oppFighter = opponent.find((entry) => entry.slot === currentSlot)?.player;
  const roundResult = match.result?.slotResults[roundIndex] ?? null;
  const userWonRound = roundResult?.userWon ?? true;
  const showOutcome =
    battleAnim === 'impact' || battleAnim === 'knockout' || battleAnim === 'tally';

  let userCardAnim: BattleAnim = 'present';
  let oppCardAnim: BattleAnim = 'present';
  if (battleAnim === 'idle' || battleAnim === 'present') {
    userCardAnim = battleAnim;
    oppCardAnim = battleAnim;
  } else if (!showOutcome) {
    if (userWonRound) {
      userCardAnim = battleAnim;
      oppCardAnim = 'present';
    } else {
      oppCardAnim = battleAnim;
      userCardAnim = 'present';
    }
  } else if (userWonRound) {
    userCardAnim = battleAnim === 'tally' ? 'tally' : 'impact';
    oppCardAnim = 'knockout';
  } else {
    oppCardAnim = battleAnim === 'tally' ? 'tally' : 'impact';
    userCardAnim = 'knockout';
  }

  const handlePlayAgain = useCallback(() => {
    resume();
    playTap();
    onPlayAgain();
  }, [onPlayAgain, playTap, resume]);

  const handleSimulateSeason = useCallback(() => {
    resume();
    playTap();
    onSimulateSeason?.();
  }, [onSimulateSeason, playTap, resume]);

  return (
    <div className={`tradeup-shell tradeup-shell--game h2h-shell${battleAnim === 'impact' ? ' h2h-shell--shake' : ''}`}>
      <GameBackground />

      <div className="lineup-game-frame h2h-frame">
        <header className="h2h-header">
          <button type="button" className="tu-back" onClick={onExit}>
            ← Home
          </button>
          <p className="h2h-header__title">Head to Head</p>
          <span className="h2h-header__spacer" aria-hidden />
        </header>

        <main className="h2h-main">
          {phase === 'matchmaking' ? (
            <section
              className={`h2h-matchmaking${matchmakingFound ? ' is-found' : ''}`}
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="h2h-matchmaking__pulse" aria-hidden />
              <div className="h2h-matchmaking__scan" aria-hidden />

              <div className="h2h-matchmaking__stage" aria-hidden>
                <div className="h2h-matchmaking__silhouettes">
                  {LINEUP_POSITIONS.map((slot) => (
                    <span key={slot} className={`h2h-matchmaking__sil h2h-matchmaking__sil--${slot.toLowerCase()}`} />
                  ))}
                </div>
                <svg className="h2h-matchmaking__links" viewBox="0 0 320 72" preserveAspectRatio="none">
                  <path d="M32 58 C70 18, 110 18, 160 36" />
                  <path d="M96 58 C120 22, 150 22, 160 36" />
                  <path d="M160 58 L160 36" />
                  <path d="M224 58 C200 22, 170 22, 160 36" />
                  <path d="M288 58 C250 18, 210 18, 160 36" />
                </svg>
                <div className="h2h-matchmaking__radar">
                  <span />
                  <span />
                  <span />
                  <i className="h2h-matchmaking__radar-core" />
                </div>
              </div>

              <p className="h2h-matchmaking__eyebrow">Head to Head</p>
              <h1 className="h2h-matchmaking__title">{statusLine}</h1>
              <div className="h2h-matchmaking__search-pulse" aria-hidden>
                <span />
              </div>
            </section>
          ) : null}

          {phase === 'intro' || phase === 'battle' || phase === 'result' ? (
            <div className="h2h-scoreboard" aria-live="polite">
              <div className="h2h-scoreboard__side">
                <span>YOUR CARDS</span>
                <strong>{userAlive}</strong>
                <div className="h2h-pips" aria-hidden>
                  {LINEUP_POSITIONS.map((slot) => (
                    <span
                      key={`u-${slot}`}
                      className={`h2h-pip${knockedUser.has(slot) ? ' h2h-pip--out' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="h2h-scoreboard__vs">VS</div>
              <div className="h2h-scoreboard__side h2h-scoreboard__side--opp">
                <span>OPPONENT CARDS</span>
                <strong>{oppAlive}</strong>
                <div className="h2h-pips" aria-hidden>
                  {LINEUP_POSITIONS.map((slot) => (
                    <span
                      key={`o-${slot}`}
                      className={`h2h-pip${knockedOpp.has(slot) ? ' h2h-pip--out' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {phase === 'intro' ? (
            <section className="h2h-intro" aria-live="polite">
              <p className="h2h-intro__eyebrow">Opponent Found</p>
              <p className="h2h-intro__label">Compare lineups</p>
              <div className="h2h-board h2h-board--intro">
                <div className="h2h-side h2h-side--you">
                  <p className="h2h-side__label">Your Five</p>
                  <div className="h2h-mini-row h2h-mini-row--preview">
                    {userLineup.map(({ slot, player }) => (
                      <MiniCard key={slot} slot={slot} player={player} size="preview" />
                    ))}
                  </div>
                </div>
                <div className="h2h-vs h2h-vs--intro" aria-hidden>
                  VS
                </div>
                <div className="h2h-side h2h-side--opp">
                  <p className="h2h-side__label">Opponent</p>
                  <div className="h2h-mini-row h2h-mini-row--preview">
                    {opponent.map(({ slot, player }) => (
                      <MiniCard key={slot} slot={slot} player={player} size="preview" />
                    ))}
                  </div>
                </div>
              </div>
              <div
                className={`h2h-intro__timer${reduceMotion ? ' is-instant' : ''}`}
                aria-hidden
              >
                <span />
              </div>
            </section>
          ) : null}

          {phase === 'battle' && userFighter && oppFighter ? (
            <section className="h2h-battle" aria-live="polite">
              <p className="h2h-battle__round">
                ROUND {roundIndex + 1} OF 5 — {POSITION_LABELS[currentSlot].toUpperCase()}S
              </p>
              <div className="h2h-battle__arena">
                <BattleCard
                  side="user"
                  slot={currentSlot}
                  player={userFighter}
                  anim={userCardAnim}
                  isWinner={showOutcome ? userWonRound : null}
                />
                <div className="h2h-battle__vs" aria-hidden>
                  VS
                </div>
                <BattleCard
                  side="opp"
                  slot={currentSlot}
                  player={oppFighter}
                  anim={oppCardAnim}
                  isWinner={showOutcome ? !userWonRound : null}
                />
              </div>

              <div className="h2h-lineup-status" aria-label="Lineup status">
                <div className="h2h-lineup-status__row">
                  <p className="h2h-lineup-status__label">YOUR TEAM</p>
                  <div className="h2h-status-row">
                    {userLineup.map(({ slot, player }) => (
                      <LineupStatusTile
                        key={`status-u-${slot}`}
                        slot={slot}
                        player={player}
                        knocked={knockedUser.has(slot)}
                        winPulse={
                          pulseWinner?.side === 'user' && pulseWinner.slot === slot
                        }
                        isActive={slot === currentSlot}
                      />
                    ))}
                  </div>
                </div>
                <div className="h2h-lineup-status__row">
                  <p className="h2h-lineup-status__label">OPPONENT</p>
                  <div className="h2h-status-row">
                    {opponent.map(({ slot, player }) => (
                      <LineupStatusTile
                        key={`status-o-${slot}`}
                        slot={slot}
                        player={player}
                        knocked={knockedOpp.has(slot)}
                        winPulse={
                          pulseWinner?.side === 'opp' && pulseWinner.slot === slot
                        }
                        isActive={slot === currentSlot}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {roundIndex >= 1 ? (
                <div className="h2h-battle__controls">
                  <button
                    type="button"
                    className="h2h-btn h2h-btn--ghost"
                    onClick={() => setPace('fast')}
                    disabled={pace !== 'normal'}
                  >
                    Speed Up
                  </button>
                  <button
                    type="button"
                    className="h2h-btn h2h-btn--ghost"
                    onClick={() => setPace('skip')}
                  >
                    Skip to Result
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {phase === 'result' && resultReady && match.result ? (
            <section
              className={`h2h-result${won ? ' h2h-result--win' : ' h2h-result--loss'}${
                won && isSweep ? ' h2h-result--sweep' : ''
              }`}
            >
              <motion.div
                className="h2h-result__headline"
                initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="h2h-result__outcome">
                  <span className="h2h-result__outcome-shine" aria-hidden />
                  {won ? (isSweep ? 'PERFECT SWEEP' : 'VICTORY') : 'DEFEAT'}
                </p>
                {won && isSweep ? (
                  <p className="h2h-result__sweep-sub">All five of your cards survived</p>
                ) : null}
                <p className="h2h-result__score" aria-label="Cards remaining">
                  <strong>{match.result.userSurviving ?? match.result.playerScore}</strong>
                  <span>–</span>
                  <strong>{match.result.opponentSurviving ?? match.result.opponentScore}</strong>
                </p>
                <p className="h2h-result__season-cue">
                  Next: simulate your 82-game regular season
                </p>
              </motion.div>

              <div className="h2h-survivors" aria-label="Surviving cards">
                <div>
                  <p className="h2h-side__label">Your survivors</p>
                  <div className="h2h-mini-row">
                    {userLineup.map(({ slot, player }) => (
                      <MiniCard
                        key={slot}
                        slot={slot}
                        player={player}
                        dimmed={Boolean(match.result?.slotResults.find((r) => r.slot === slot && !r.userWon))}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="h2h-side__label">Opponent survivors</p>
                  <div className="h2h-mini-row">
                    {opponent.map(({ slot, player }) => (
                      <MiniCard
                        key={slot}
                        slot={slot}
                        player={player}
                        dimmed={Boolean(match.result?.slotResults.find((r) => r.slot === slot && r.userWon))}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {showMatchupReview ? (
                <ul className="h2h-matchup-list">
                  {match.result.slotResults.map((round) => (
                    <li key={round.slot}>
                      <span>{POSITION_LABELS[round.slot]}</span>
                      <strong>{round.userWon ? 'YOU' : 'OPP'}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="h2h-result__actions">
                {onSimulateSeason ? (
                  <button
                    type="button"
                    className="h2h-btn h2h-btn--primary"
                    onClick={handleSimulateSeason}
                  >
                    Simulate Season
                  </button>
                ) : null}
                <button type="button" className="h2h-btn h2h-btn--ghost" onClick={handlePlayAgain}>
                  Play Again
                </button>
                <button
                  type="button"
                  className="h2h-btn h2h-btn--ghost"
                  onClick={() => setShowMatchupReview((value) => !value)}
                >
                  {showMatchupReview ? 'Hide Matchup' : 'View Matchup'}
                </button>
                <button type="button" className="h2h-btn h2h-btn--ghost" onClick={onExit}>
                  Home
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
