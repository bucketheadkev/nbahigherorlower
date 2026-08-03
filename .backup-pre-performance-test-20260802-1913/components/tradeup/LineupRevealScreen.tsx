'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import type { useLineupSession } from '@/hooks/useLineupSession';
import { REROLL_COST, KEEP_BONUS, formatRoundCredits } from '@/lib/tradeup/lineupBudget';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { AnimatePresence } from 'framer-motion';
import { GameBackground } from './game/GameBackground';
import { TradeUpLogo } from './TradeUpLogo';
import { LineupRevealCard } from './LineupRevealCard';
import { GmTradeChat } from './GmTradeChat';
import { PackOpenCeremony, type PackCeremonyPhase } from './PackOpenCeremony';
import { StartingFiveLockIn } from './StartingFiveLockIn';
import type { UserTeamIdentity } from '@/lib/tradeup/userTeam';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';

const REVEAL_MS = 300;
const FLIP_SOUND_MS = 40;
const LAND_SOUND_MS = 210;
const S_TIER_ACCENT_MS = 240;
const FLIP_ALL_STAGGER_MS = 48;
const LOCK_IN_DELAY_MS = 220;
const LOCK_IN_DELAY_REDUCED_MS = 80;
const DEAL_GAP_MS = 320;
const DEAL_GAP_REDUCED_MS = 90;
const PACK_OPEN_MS = 520;
const PACK_OPEN_REDUCED_MS = 120;

type LineupSessionApi = ReturnType<typeof useLineupSession>;

interface LineupRevealScreenProps {
  session: LineupSessionApi;
  onExit: () => void;
  onLineupComplete: (team: UserTeamIdentity) => void;
}

export function LineupRevealScreen({
  session,
  onExit,
  onLineupComplete,
}: LineupRevealScreenProps) {
  const {
    slots,
    currentPosition,
    currentOffers,
    currentFreePlayer,
    marketOpen,
    roundCredits,
    creditsSpent,
    allFinalized,
    runCompleted,
    revealCard,
    keepFreePlayer,
    lockInAndBattle,
    openMarket,
    closeMarket,
    purchaseMarketPlayer,
    rerollOffers,
    canReroll,
    getOfferAffordability,
  } = session;

  const [revealingSlots, setRevealingSlots] = useState<Set<Position>>(() => new Set());
  const [flipAllRunning, setFlipAllRunning] = useState(false);
  const [flipAllDismissed, setFlipAllDismissed] = useState(false);
  const flipAllLockRef = useRef(false);
  const [creditPulse, setCreditPulse] = useState<'spend' | 'reroll' | 'keep' | null>(null);
  const [displayedCredits, setDisplayedCredits] = useState(roundCredits);
  const [keepRewardToast, setKeepRewardToast] = useState<string | null>(null);
  const [floatingBonus, setFloatingBonus] = useState(false);
  const [budgetMessage, setBudgetMessage] = useState<string | null>(null);
  const [rerolling, setRerolling] = useState(false);
  const [lockInActive, setLockInActive] = useState(false);
  const [lockingSlot, setLockingSlot] = useState<Position | null>(null);
  const [tradeStampSlot, setTradeStampSlot] = useState<Position | null>(null);
  const [creditFlies, setCreditFlies] = useState<
    Array<{ id: number; x: number; y: number; tx: number; ty: number }>
  >([]);
  const [packPhase, setPackPhase] = useState<PackCeremonyPhase>(() =>
    slots.some(({ state }) => state.revealed || state.finalized) ? 'open' : 'closed',
  );
  const [landedCount, setLandedCount] = useState(() =>
    slots.some(({ state }) => state.revealed || state.finalized) ? LINEUP_POSITIONS.length : 0,
  );
  const slotNodeRefs = useRef<Record<Position, HTMLElement | null>>({
    PG: null,
    SG: null,
    SF: null,
    PF: null,
    C: null,
  });
  const dealTimersRef = useRef<number[]>([]);
  const actionLockRef = useRef(false);
  const keepSoundLockRef = useRef(false);
  const lockBattleLockRef = useRef(false);
  const completionStartedRef = useRef(false);
  const onLineupCompleteRef = useRef(onLineupComplete);
  const revealTimersRef = useRef<number[]>([]);
  const completionTimersRef = useRef<number[]>([]);
  const creditAnimRef = useRef<number | null>(null);
  const rewardToastTimerRef = useRef<number | null>(null);
  const creditsCounterRef = useRef<HTMLDivElement>(null);
  const creditFlyIdRef = useRef(0);
  const {
    playTap,
    playUiBack,
    playCardLift,
    playCardFlip,
    playCardLand,
    playRevealImpact,
    playKeep,
    playTradeOpen,
    playTradeComplete,
    playMarketReroll,
    playLineupComplete,
    playCreditSpend,
    playUnlock,
    resume,
  } = useSound();

  const packBusy = packPhase !== 'open';
  const dealOrder = LINEUP_POSITIONS;

  const runLocked = runCompleted || allFinalized;
  const currentSlot = slots.find((slot) => slot.slot === currentPosition) ?? null;
  const showDecision =
    Boolean(currentPosition) &&
    Boolean(currentSlot?.state.revealed) &&
    !currentSlot?.state.finalized &&
    Boolean(currentPosition && !revealingSlots.has(currentPosition)) &&
    !runLocked &&
    !packBusy;
  const showMarket = showDecision && marketOpen;
  const unrevealedSlots = slots.filter(({ state }) => !state.revealed && !state.finalized);
  const allRevealed = slots.length === 5 && slots.every(({ state }) => state.revealed);
  const canLockInBattle =
    allRevealed && !runLocked && !flipAllRunning && revealingSlots.size === 0 && !packBusy;
  const showFlipAll =
    !packBusy &&
    !flipAllDismissed &&
    !runLocked &&
    !flipAllRunning &&
    unrevealedSlots.length > 0;

  const clearDealTimers = useCallback(() => {
    dealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    dealTimersRef.current = [];
  }, []);

  const handlePackOpen = useCallback(() => {
    if (packPhase !== 'closed') return;
    resume();
    playTap();
    playUnlock();
    clearDealTimers();
    setPackPhase('opening');

    const reduceMotion = getPrefersReducedMotion();
    const openDelay = reduceMotion ? PACK_OPEN_REDUCED_MS : PACK_OPEN_MS;
    const gap = reduceMotion ? DEAL_GAP_REDUCED_MS : DEAL_GAP_MS;
    const flightMs = reduceMotion ? 90 : 420;

    const openTimer = window.setTimeout(() => {
      setPackPhase('dealing');
      setLandedCount(0);

      dealOrder.forEach((_, index) => {
        const startAt = gap * index + (reduceMotion ? 40 : 160);
        const landAt = startAt + flightMs;

        const startTimer = window.setTimeout(() => {
          playCardLift();
        }, startAt);
        dealTimersRef.current.push(startTimer);

        const landTimer = window.setTimeout(() => {
          playCardLand();
          setLandedCount(index + 1);
          if (index === dealOrder.length - 1) {
            const done = window.setTimeout(
              () => setPackPhase('open'),
              reduceMotion ? 60 : 320,
            );
            dealTimersRef.current.push(done);
          }
        }, landAt);
        dealTimersRef.current.push(landTimer);
      });
    }, openDelay);
    dealTimersRef.current.push(openTimer);
  }, [
    clearDealTimers,
    dealOrder,
    packPhase,
    playCardLand,
    playCardLift,
    playTap,
    playUnlock,
    resume,
  ]);

  useEffect(() => () => clearDealTimers(), [clearDealTimers]);

  useEffect(() => {
    if (allRevealed) setFlipAllDismissed(true);
  }, [allRevealed]);

  useEffect(() => {
    onLineupCompleteRef.current = onLineupComplete;
  }, [onLineupComplete]);

  useEffect(
    () => () => {
      revealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      completionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      if (creditAnimRef.current != null) window.cancelAnimationFrame(creditAnimRef.current);
      if (rewardToastTimerRef.current != null) window.clearTimeout(rewardToastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    // Keep display in sync for spends/rerolls; Keep bonus animates separately.
    if (creditPulse === 'keep') return;
    setDisplayedCredits(roundCredits);
  }, [roundCredits, creditPulse]);

  useEffect(() => {
    if (!runLocked || completionStartedRef.current) return;
    if (slots.some((slot) => !slot.player || !slot.state.finalized)) return;

    completionStartedRef.current = true;
    const reduceMotion = getPrefersReducedMotion();

    // Show the starting-five confirmation and wait for Go — never auto-advance.
    const showTimer = window.setTimeout(() => {
      playLineupComplete();
      setLockInActive(true);
    }, reduceMotion ? LOCK_IN_DELAY_REDUCED_MS : LOCK_IN_DELAY_MS);

    completionTimersRef.current.push(showTimer);
  }, [playLineupComplete, runLocked, slots]);

  const handleConfirmGo = useCallback((team: UserTeamIdentity) => {
    onLineupCompleteRef.current(team);
  }, []);

  const queueTimer = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    revealTimersRef.current.push(timer);
  }, []);

  const handleReveal = useCallback(
    (pos: Position) => {
      const slot = slots.find((candidate) => candidate.slot === pos);
      if (flipAllRunning || runLocked || !slot || slot.state.revealed || revealingSlots.has(pos)) return;

      const reduceMotion = getPrefersReducedMotion();
      resume();
      playCardLift();
      setRevealingSlots((current) => new Set(current).add(pos));
      revealCard(pos);
      if (!(slot.isFreePlayerSTier || slot.isHiddenSTier)) {
        playRevealImpact('standard');
      }

      if (reduceMotion) {
        queueTimer(playCardLand, 100);
        if (slot.isFreePlayerSTier || slot.isHiddenSTier) {
          queueTimer(() => playRevealImpact('elite'), 140);
        }
        queueTimer(() => {
          setRevealingSlots((current) => {
            const next = new Set(current);
            next.delete(pos);
            return next;
          });
        }, 260);
        return;
      }

      queueTimer(playCardFlip, FLIP_SOUND_MS);
      queueTimer(playCardLand, LAND_SOUND_MS);
      if (slot.isFreePlayerSTier || slot.isHiddenSTier) {
        queueTimer(() => playRevealImpact('elite'), S_TIER_ACCENT_MS);
      }
      queueTimer(() => {
        setRevealingSlots((current) => {
          const next = new Set(current);
          next.delete(pos);
          return next;
        });
      }, REVEAL_MS);
    },
    [
      flipAllRunning,
      playCardFlip,
      playCardLand,
      playCardLift,
      playRevealImpact,
      queueTimer,
      revealCard,
      revealingSlots,
      resume,
      runLocked,
      slots,
    ],
  );

  const handleFlipAll = useCallback(() => {
    if (flipAllLockRef.current || flipAllRunning || flipAllDismissed || runLocked) return;
    if (unrevealedSlots.length === 0) {
      setFlipAllDismissed(true);
      return;
    }

    // Accept click immediately — hide button and lock against re-entry.
    flipAllLockRef.current = true;
    setFlipAllDismissed(true);
    setFlipAllRunning(true);
    resume();
    playTap();

    const targets = unrevealedSlots.map(({ slot, isFreePlayerSTier, isHiddenSTier }) => ({
      slot,
      isFreePlayerSTier,
      isHiddenSTier,
    }));
    const reduceMotion = getPrefersReducedMotion();
    const stagger = reduceMotion ? 28 : FLIP_ALL_STAGGER_MS;
    const duration = reduceMotion ? 120 : REVEAL_MS;

    targets.forEach(({ slot, isFreePlayerSTier, isHiddenSTier }, index) => {
      const start = index * stagger;
      queueTimer(() => {
        setRevealingSlots((current) => new Set(current).add(slot));
        revealCard(slot);
        playCardLift();
        if (!(isFreePlayerSTier || isHiddenSTier)) {
          playRevealImpact('standard');
        }
        queueTimer(playCardFlip, reduceMotion ? 40 : FLIP_SOUND_MS);
        queueTimer(playCardLand, reduceMotion ? 120 : LAND_SOUND_MS);
        if (isFreePlayerSTier || isHiddenSTier) {
          queueTimer(() => playRevealImpact('elite'), reduceMotion ? 160 : S_TIER_ACCENT_MS);
        }
      }, start);
      queueTimer(() => {
        setRevealingSlots((current) => {
          const next = new Set(current);
          next.delete(slot);
          return next;
        });
      }, start + duration);
    });

    queueTimer(() => {
      setFlipAllRunning(false);
      flipAllLockRef.current = false;
    }, (targets.length - 1) * stagger + duration + 60);
  }, [
    flipAllDismissed,
    flipAllRunning,
    playCardFlip,
    playCardLand,
    playCardLift,
    playRevealImpact,
    playTap,
    queueTimer,
    revealCard,
    resume,
    runLocked,
    unrevealedSlots,
  ]);

  const flashCredits = useCallback((kind: 'spend' | 'reroll' | 'keep') => {
    setCreditPulse(kind);
    window.setTimeout(() => setCreditPulse(null), kind === 'keep' ? 900 : 520);
  }, []);

  const animateCreditGain = useCallback((from: number, to: number) => {
    if (creditAnimRef.current != null) window.cancelAnimationFrame(creditAnimRef.current);
    const reduceMotion = getPrefersReducedMotion();
    if (reduceMotion || to <= from) {
      setDisplayedCredits(to);
      return;
    }

    const start = performance.now();
    const duration = 480;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplayedCredits(Math.round(from + (to - from) * eased));
      if (t < 1) {
        creditAnimRef.current = window.requestAnimationFrame(tick);
      } else {
        creditAnimRef.current = null;
        setDisplayedCredits(to);
      }
    };
    creditAnimRef.current = window.requestAnimationFrame(tick);
  }, []);

  const showKeepReward = useCallback(() => {
    setKeepRewardToast('FREE PLAYER KEPT · +100 CREDITS');
    setFloatingBonus(true);
    if (rewardToastTimerRef.current != null) window.clearTimeout(rewardToastTimerRef.current);
    rewardToastTimerRef.current = window.setTimeout(() => {
      setKeepRewardToast(null);
      setFloatingBonus(false);
      rewardToastTimerRef.current = null;
    }, 1400);
  }, []);

  const launchCreditFly = useCallback((origin?: HTMLElement | null) => {
    const reduceMotion = getPrefersReducedMotion();
    if (reduceMotion) return;
    const target = creditsCounterRef.current?.getBoundingClientRect();
    if (!target) return;
    const from = origin?.getBoundingClientRect();
    const startX = from ? from.left + from.width / 2 : target.left + target.width / 2;
    const startY = from ? from.top + from.height / 2 : target.top + target.height + 40;
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    const id = ++creditFlyIdRef.current;
    setCreditFlies((current) => [
      ...current,
      { id, x: startX, y: startY, tx: endX, ty: endY },
    ]);
    window.setTimeout(() => {
      setCreditFlies((current) => current.filter((fly) => fly.id !== id));
    }, 720);
  }, []);

  const handleKeep = useCallback((pos: Position, origin?: HTMLElement | null) => {
    if (actionLockRef.current || runLocked || rerolling || keepSoundLockRef.current) return;
    actionLockRef.current = true;
    keepSoundLockRef.current = true;
    const creditsBefore = roundCredits;
    // Set keep pulse before state commit so the display sync effect does not jump.
    setCreditPulse('keep');
    setLockingSlot(pos);
    const result = keepFreePlayer(pos);
    if (!result.ok) {
      setCreditPulse(null);
      setLockingSlot(null);
      actionLockRef.current = false;
      keepSoundLockRef.current = false;
      setBudgetMessage('Could not keep that player right now.');
      return;
    }
    resume();
    const awardedBonus = Boolean(result.keepBonusAwarded && (result.creditsAdded ?? 0) > 0);
    // Premium Keep SFX only — never sell-credits.wav / playAccept fanfare.
    playKeep(awardedBonus);
    setBudgetMessage(null);

    if (awardedBonus) {
      launchCreditFly(origin);
      window.setTimeout(() => setCreditPulse(null), 900);
      showKeepReward();
      animateCreditGain(creditsBefore, creditsBefore + (result.creditsAdded ?? KEEP_BONUS));
    } else {
      setCreditPulse(null);
      setDisplayedCredits(creditsBefore);
    }

    window.setTimeout(() => {
      setLockingSlot(null);
      actionLockRef.current = false;
      keepSoundLockRef.current = false;
    }, 360);
  }, [
    animateCreditGain,
    keepFreePlayer,
    launchCreditFly,
    playKeep,
    rerolling,
    resume,
    roundCredits,
    runLocked,
    showKeepReward,
  ]);

  const handleTradeUp = useCallback((pos: Position) => {
    if (actionLockRef.current || runLocked || rerolling) return;
    const result = openMarket(pos);
    if (!result.ok) {
      setBudgetMessage('Trade Up is unavailable right now.');
      return;
    }
    resume();
    playTradeOpen();
    setBudgetMessage(null);
  }, [openMarket, playTradeOpen, rerolling, resume, runLocked]);

  const handleCloseTradeUp = useCallback((pos: Position) => {
    if (runLocked || rerolling) return;
    const result = closeMarket(pos);
    if (!result.ok) return;
    resume();
    playUiBack();
    setBudgetMessage(null);
  }, [closeMarket, playUiBack, rerolling, resume, runLocked]);

  const handlePurchase = useCallback(
    (player: TradePlayer) => {
      if (actionLockRef.current || runLocked || rerolling || !currentPosition) return;
      actionLockRef.current = true;
      const result = purchaseMarketPlayer(currentPosition, player.id);
      if (!result.ok) {
        actionLockRef.current = false;
        if (result.reason === 'credits') {
          setBudgetMessage('Not enough round credits for that player.');
        } else {
          setBudgetMessage('That player is unavailable right now.');
        }
        return;
      }

      resume();
      playTradeComplete();
      playCreditSpend();
      flashCredits('spend');
      setBudgetMessage(null);
      if (currentPosition) {
        setTradeStampSlot(currentPosition);
        setLockingSlot(currentPosition);
        window.setTimeout(() => {
          setTradeStampSlot(null);
          setLockingSlot(null);
        }, 700);
      }
      window.setTimeout(() => {
        actionLockRef.current = false;
      }, 300);
    },
    [currentPosition, flashCredits, playCreditSpend, playTradeComplete, purchaseMarketPlayer, rerolling, resume, runLocked],
  );

  const handleReroll = useCallback(() => {
    if (rerolling || runLocked || !canReroll) {
      if (!canReroll) {
        setBudgetMessage(`You need ${REROLL_COST} round credits to reroll.`);
      }
      return;
    }

    setRerolling(true);
    const result = rerollOffers();
    if (!result.ok) {
      setRerolling(false);
      if (result.reason === 'credits') {
        setBudgetMessage(`You need ${REROLL_COST} round credits to reroll.`);
      }
      return;
    }

    resume();
    playMarketReroll();
    playCreditSpend();
    flashCredits('reroll');
    setBudgetMessage(null);
    window.setTimeout(() => setRerolling(false), 520);
  }, [canReroll, flashCredits, playCreditSpend, playMarketReroll, rerollOffers, resume, runLocked, rerolling]);

  const handleLockInBattle = useCallback(() => {
    if (!canLockInBattle || lockBattleLockRef.current || actionLockRef.current) return;
    lockBattleLockRef.current = true;
    actionLockRef.current = true;
    const creditsBefore = roundCredits;
    const result = lockInAndBattle();
    if (!result.ok) {
      lockBattleLockRef.current = false;
      actionLockRef.current = false;
      if (result.reason === 'unrevealed') {
        setBudgetMessage('Reveal all five cards to battle');
      } else {
        setBudgetMessage('Could not lock in the lineup right now.');
      }
      return;
    }

    resume();
    playTap();
    const bonus = result.creditsAdded ?? 0;
    if (bonus > 0) {
      setCreditPulse('keep');
      animateCreditGain(creditsBefore, creditsBefore + bonus);
      setKeepRewardToast(`LOCKED IN · +${bonus} CREDITS`);
      window.setTimeout(() => {
        setCreditPulse(null);
        setKeepRewardToast(null);
      }, 1400);
      playKeep(true);
    } else {
      playKeep(false);
    }
    setBudgetMessage(null);
  }, [
    animateCreditGain,
    canLockInBattle,
    lockInAndBattle,
    playKeep,
    playTap,
    resume,
    roundCredits,
  ]);

  const finalizedLineup = useMemo(
    () =>
      slots.flatMap(({ slot, state, player }) =>
        state.finalized && player ? [{ slot, player }] : [],
      ),
    [slots],
  );

  const hint = packBusy
    ? packPhase === 'closed'
      ? 'Open your starter pack'
      : 'Dealing your starting five…'
    : runLocked
    ? 'Starting five locked in'
    : marketOpen
      ? 'Chat with a GM — sign a name or hang up'
      : allRevealed
        ? 'Trade Up any position, or Lock In & Battle'
        : 'Flip all five cards, then Keep, Trade Up, or Lock In & Battle';

  return (
    <div className={`tradeup-shell tradeup-shell--game${packBusy ? ' is-pack-ceremony' : ''}`}>
      <GameBackground />

      <PackOpenCeremony
        phase={packPhase}
        dealOrder={[...dealOrder]}
        landedCount={landedCount}
        slotRefs={slotNodeRefs}
        onOpen={handlePackOpen}
        onExit={onExit}
      />

      <div className="lineup-game-frame">
        <header className="lineup-reveal__header">
          <button type="button" className="tu-back" onClick={onExit}>
            ← Home
          </button>
          <div className="lineup-reveal__brand">
            <TradeUpLogo size="xs" />
            <p className="lineup-reveal__title">Starting Lineup</p>
          </div>
          <span className="lineup-header-rank__spacer" aria-hidden />
        </header>

        <main
          className={`lineup-reveal lineup-reveal--draft${
            revealingSlots.size > 0 ? ' lineup-reveal--focused' : ''
          }${showMarket ? ' lineup-reveal--market' : ''}${
            lockInActive ? ' lineup-reveal--locking' : ''
          }${packBusy ? ' lineup-reveal--packing' : ''}`}
        >
          <div className="lineup-draft-bar">
            <div
              ref={creditsCounterRef}
              className={`lineup-budget${creditPulse ? ` lineup-budget--${creditPulse}` : ''}`}
              aria-live="polite"
            >
              <span className="lineup-budget__label">Credits</span>
              <div className="lineup-budget__value-wrap">
                <strong className="lineup-budget__value">
                  {formatRoundCredits(displayedCredits)}
                </strong>
                {floatingBonus ? (
                  <span className="lineup-budget__float" aria-hidden>
                    +{KEEP_BONUS}
                  </span>
                ) : null}
              </div>
              <span className="lineup-budget__spent">{formatRoundCredits(creditsSpent)} spent</span>
              {keepRewardToast ? (
                <p className="lineup-budget__reward" role="status">
                  {keepRewardToast}
                </p>
              ) : null}
            </div>
          </div>

          <p className="lineup-reveal__hint">{hint}</p>

          <div
            className={`lineup-reveal__grid${revealingSlots.size > 0 ? ' lineup-reveal__grid--revealing' : ''}`}
            role="list"
          >
            {slots.map(({ slot, state, player, isFreePlayerSTier, isHiddenSTier }, index) => {
              const dealt = landedCount > index || packPhase === 'open';
              return (
              <div
                key={`${session.session?.lineupId ?? 'lineup'}-${slot}`}
                ref={(node) => {
                  slotNodeRefs.current[slot] = node;
                }}
                className={`lineup-formation__slot lineup-formation__slot--${slot.toLowerCase()}${
                  dealt ? ' is-dealt' : ' is-undealt'
                }`}
                role="listitem"
              >
                <LineupRevealCard
                  slot={slot}
                  player={player}
                  isFreePlayerSTier={isFreePlayerSTier}
                  isHiddenSTier={isHiddenSTier}
                  suppressHiddenJiggle={flipAllRunning || packBusy}
                  revealed={state.revealed}
                  finalized={state.finalized}
                  revealing={revealingSlots.has(slot)}
                  muted={
                    revealingSlots.size > 0 && !revealingSlots.has(slot)
                  }
                  flipDisabled={
                    packBusy ||
                    runLocked ||
                    flipAllRunning ||
                    revealingSlots.has(slot) ||
                    state.revealed
                  }
                  marketOpen={state.marketOpen}
                  purchasePrice={state.purchasePrice}
                  locking={lockingSlot === slot}
                  tradeStamped={tradeStampSlot === slot}
                  onReveal={handleReveal}
                  onKeep={(origin) => handleKeep(slot, origin)}
                  onViewMarket={() => handleTradeUp(slot)}
                  onCloseMarket={() => handleCloseTradeUp(slot)}
                />
              </div>
            );
            })}
          </div>

          {showFlipAll ? (
            <div className="lineup-flip-all-wrap">
              <button
                type="button"
                className="lineup-flip-all"
                onClick={handleFlipAll}
              >
                Flip All
              </button>
            </div>
          ) : null}

        <AnimatePresence>
          {showMarket && currentPosition ? (
            <GmTradeChat
              key={`gm-${currentPosition}-${currentOffers.map((p) => p.id).join('-')}`}
              position={currentPosition}
              offers={currentOffers}
              freePlayer={currentFreePlayer}
              roundCredits={roundCredits}
              rerollCost={REROLL_COST}
              canReroll={canReroll}
              rerolling={rerolling}
              budgetMessage={budgetMessage}
              getAffordable={getOfferAffordability}
              onClose={() => handleCloseTradeUp(currentPosition)}
              onReroll={handleReroll}
              onSign={handlePurchase}
            />
          ) : null}
        </AnimatePresence>

        {runLocked ? (
          <section className="lineup-draft-summary" aria-live="polite">
            <p>
              Spent <strong>{formatRoundCredits(creditsSpent)}</strong> · Remaining{' '}
              <strong>{formatRoundCredits(roundCredits)}</strong>
            </p>
          </section>
        ) : null}
      </main>

      <div className="lineup-lock-battle">
        <button
          type="button"
          className={`tu-btn tu-btn--primary lineup-lock-battle__btn${
            canLockInBattle ? ' is-ready' : ''
          }`}
          disabled={!canLockInBattle}
          onClick={handleLockInBattle}
        >
          LOCK IN & BATTLE
        </button>
        {!allRevealed ? (
          <p className="lineup-lock-battle__hint">Reveal all five cards to battle</p>
        ) : runLocked ? (
          <p className="lineup-lock-battle__hint">Lineup locked — finding opponent</p>
        ) : (
          <p className="lineup-lock-battle__hint lineup-lock-battle__hint--desktop">
            Keeps remaining free players (+{KEEP_BONUS} each) and starts the match
          </p>
        )}
      </div>

      {lockInActive ? (
        <StartingFiveLockIn players={finalizedLineup} onGo={handleConfirmGo} />
      ) : null}
      </div>

      {creditFlies.map((fly) => (
        <span
          key={fly.id}
          className="credit-fly"
          aria-hidden
          style={
            {
              '--fly-x': `${fly.x}px`,
              '--fly-y': `${fly.y}px`,
              '--fly-tx': `${fly.tx}px`,
              '--fly-ty': `${fly.ty}px`,
            } as CSSProperties
          }
        >
          +{KEEP_BONUS}
        </span>
      ))}
    </div>
  );
}
