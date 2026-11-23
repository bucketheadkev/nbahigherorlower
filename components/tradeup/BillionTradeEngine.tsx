'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BILLION_GOAL,
  buildEraRoster,
  eraShortLabel,
  formatDollarsExact,
  getDollarValue,
  getDollarValueForSlot,
  listValidSpinPairs,
  sumTeamValue,
  type DecadeEra,
  type EraOfferPlayer,
  type SpinPair,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import {
  canMoveToSlot,
  formatEligiblePositions,
  getEligiblePositions,
  playerFitsSlot,
} from '@/lib/tradeup/alternatePositions';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { Position, TeamInfo } from '@/lib/tradeup/types';
import { saveBillionRun } from '@/lib/tradeup/billionRuns';
import {
  notifyAchievementsUnlocked,
  processClassicRunChallenges,
} from '@/lib/tradeup/challenges';
import {
  getBestRosterValue,
  saveBestRosterValue,
  saveBestWorldRank,
} from '@/lib/tradeup/storage';
import {
  getWorldRank,
} from '@/lib/tradeup/worldLeaderboard';
import { submitVerifiedClassicLineup } from '@/lib/account/leaderboardCloud';
import { isDynastyPreview, previewRecordRun } from '@/lib/account/dynastyPreview';
import { payLocalRollover } from '@/lib/tradeup/rollover';
import { runBonusFacts } from '@/lib/tradeup/runBonuses';
import { settleLocalRunBonus } from '@/lib/tradeup/runBonusLocal';
import { settleRunBonus } from '@/lib/account/runBonusCloud';
import {
  awardClassicRunXp,
  COINS_PERK_COST,
  COINS_REROLL_COST,
  getXpCoins,
  MAX_REROLLS_PER_RUN,
  spendXpCoins,
} from '@/lib/tradeup/xp';
import { useXpProfile } from '@/hooks/useXpProfile';
import { holdInterruptions } from '@/lib/tradeup/interruptions';
import {
  MAX_PERK_USES,
  PERK_DEFS,
  canAffordPerk,
  purchasePerkActivation,
  type PerkId,
} from '@/lib/tradeup/perks';
import { getPerkStock } from '@/lib/tradeup/perkInventory';
import { ClassicPerksBar } from './perks/ClassicPerksBar';
import { ConfirmSpendSheet } from './ConfirmSpendSheet';
import { ClassicTriviaSheet } from './trivia/ClassicTriviaSheet';
import {
  decideTriviaGate,
  lockSettledTriviaTotal,
  type TriviaEligibility,
} from '@/lib/tradeup/trivia/triviaGate';
import { useRunBonus } from '@/hooks/useRunBonus';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { contrastOnPrimary, getTeamColors, teamGlowColor, teamRingColor } from '@/lib/tradeup/teamColors';
import { hapticSelection, hapticSlam, hapticSlotConfirm, hapticTap } from '@/lib/tradeup/haptics';
import { measureDraftSlam } from '@/lib/tradeup/draftSlamRects';
import { playPlaceClickSound, playSpinClickSound, preloadGameAudio, startWheelSpinSound, stopWheelSpinSound, unlockGameAudio, WHEEL_SPIN_DURATION_MS } from '@/lib/tradeup/gameAudio';
import { useSound } from '@/hooks/useSound';
import { useLocale } from '@/hooks/useLocale';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { GameBackground } from './game/GameBackground';
import { BallionTicketMachine } from './BallionTicketMachine';
import { RunBonusCard } from './run/RunBonusCard';
import { CircuitRunCard } from './circuit/CircuitRunCard';
import type { CircuitRunConfig } from '@/lib/account/circuitCloud';
import type { RunEarningsData, RunBonusOutcome } from './run/RunEarnings';
import { preloadClassicArena } from '@/lib/tradeup/classicArenaAssets';
import { ClassicRunResults } from './run/ClassicRunResults';
import { DraftPlayerSlamFly, type DraftSlamPayload } from './DraftPlayerSlamFly';
import { FranchisePickScreen } from './FranchisePickScreen';
import { ClassicRosterReveal } from './ClassicRosterReveal';
import { HeadToHeadShowdown } from './HeadToHeadShowdown';
import { resolveRerollPair, type TicketRerollKind } from '@/lib/tradeup/rerollPair';
import type { H2HOpponent } from '@/lib/tradeup/h2hOpponents';
import { serializeMatchLineup } from '@/lib/multiplayer/match';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';
import {
  playerToH2HPick,
  syncedPicksToSlots,
  type SyncedH2HPick,
} from '@/lib/tradeup/h2hDraftBridge';
import { CircleName, DraftHubCards } from './DraftHubCards';
import { DraftSheet } from './draft/DraftSheet';
import { ArenaPicker } from './draft/ArenaPicker';

/**
 * Experimental: replace classic five position rows with half-court roster.
 * Set to false (or say "revert") to restore the prior board.
 */
const EXPERIMENTAL_DRAFT_HUB_CARDS = true;
/** Bolt, soft fill, then fade. Class drops only after opacity is already 0. */
const COURT_COLOR_WASH_MS = 1080;

interface BillionTradeEngineProps {
  onExit: () => void;
  onPlayAgain?: () => void;
  onWin?: () => void;
  /**
   * Default billion run. `h2h` = local AI showdown. `online` = private 1V1.
   * `franchise` = Franchise Ownership lineup (needs `franchise`).
   */
  challengeMode?: 'billion' | 'h2h' | 'online' | 'franchise';
  /** Franchise drafts: server-rolled spins, no rerolls, no Classic rewards or run records. */
  franchise?: FranchiseDraftOptions | null;
  h2hOpponent?: H2HOpponent | null;
  h2hPlayerName?: string | null;
  /** Online 1V1: opponent display + live progress 0–5. */
  onlineOpponentName?: string | null;
  onlineOpponentProgress?: number;
  onOnlineProgress?: (filledCount: number) => void;
  onOnlineComplete?: (payload: {
    lineup: ReturnType<typeof serializeMatchLineup>;
    totalValue: number;
  }) => void;
  /** Online 1V1: hydrate from server + sync each lock/move. */
  syncedPicks?: SyncedH2HPick[];
  onPickLock?: (
    position: H2HPosition,
    selection: H2HPickSelection,
    rawValue: number,
  ) => Promise<void>;
  onPickMove?: (
    from: H2HPosition,
    to: H2HPosition,
    selection: H2HPickSelection,
    rawValue: number,
  ) => Promise<void>;
  /** Online 1V1: stay on draft dock after 5/5; parent runs reveal when both ready. */
  deferOnlineReveal?: boolean;
  onlineDraftError?: string | null;
  /** The Circuit: this Classic run is the player's official league entry. */
  circuit?: CircuitRunConfig | null;
}

export interface FranchiseDraftOptions {
  /** A spin the server already rolled (the draft was left and resumed). */
  pendingSpin: SpinPair | null;
  resolveRoll: () => Promise<SpinPair | null>;
  exitLabel: string;
  goal: string;
  /** Replaces the dock once all five are seated: value, earnings, and the lock button. */
  review: ReactNode;
}

type RosterSlots = Record<Position, ValuedPlayer | null>;
type Phase = 'draft' | 'transition' | 'reveal' | 'won' | 'lost';

const EMPTY_ROSTER: RosterSlots = {
  PG: null,
  SG: null,
  SF: null,
  PF: null,
  C: null,
};

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const first = parts[0]![0] ?? '';
  const last = parts[parts.length - 1]![0] ?? '';
  return `${first}${last}`.toUpperCase();
}

function rosterList(slots: RosterSlots): ValuedPlayer[] {
  return LINEUP_POSITIONS.map((pos) => slots[pos]).filter(
    (p): p is ValuedPlayer => Boolean(p),
  );
}

function rosterInSlotOrder(slots: RosterSlots): ValuedPlayer[] {
  return LINEUP_POSITIONS.map((pos) => slots[pos]).filter(
    (p): p is ValuedPlayer => Boolean(p),
  );
}

/** A stalled submit must not leave the results screen waiting forever. */
const SUBMIT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function newRunRef(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Re-priced from each seated slot so moved players match server verification. */
function pricedLineup(slots: RosterSlots): ValuedPlayer[] {
  return LINEUP_POSITIONS.map((pos) => {
    const player = slots[pos];
    return player ? { ...player, dollarValue: getDollarValueForSlot(player, pos) } : null;
  }).filter((p): p is ValuedPlayer => Boolean(p));
}

/** Same human across eras/franchises (LeBron LAL == LeBron MIA). */
function normalizePlayerName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function BillionTradeEngine({
  onExit,
  onPlayAgain,
  onWin,
  challengeMode = 'billion',
  h2hOpponent = null,
  h2hPlayerName = null,
  onlineOpponentName = null,
  onlineOpponentProgress = 0,
  onOnlineProgress,
  onOnlineComplete,
  syncedPicks = [],
  onPickLock,
  onPickMove,
  deferOnlineReveal = false,
  onlineDraftError = null,
  circuit = null,
  franchise = null,
}: BillionTradeEngineProps) {
  const isH2H = challengeMode === 'h2h' && Boolean(h2hOpponent);
  const isOnline = challengeMode === 'online';
  const isFranchise = challengeMode === 'franchise' && Boolean(franchise);
  /** Picks and moves are saved by the parent (1V1 room or Franchise cycle). */
  const isSynced = isOnline || isFranchise;
  /** Two seated players trade seats when each can play the other's spot (synced picks move one seat at a time). */
  const canSwapSeats = useCallback(
    (a: ValuedPlayer, aSlot: Position, b: ValuedPlayer, bSlot: Position) =>
      !isSynced && aSlot !== bSlot && playerFitsSlot(a, bSlot) && playerFitsSlot(b, aSlot),
    [isSynced],
  );
  /** A real Classic Run: Run Bonus, run records, achievements, Rollover. */
  const isClassicRun = !isH2H && !isSynced;
  useEffect(() => {
    if (isClassicRun) preloadClassicArena();
  }, [isClassicRun]);
  /** Classic Run draft chrome (vertical five + hub/pick) — also used for online 1v1. */
  const useClassicDraftChrome = !isH2H;
  const playerHandle = (h2hPlayerName ?? 'YOU').trim() || 'YOU';
  const oppLabel = (onlineOpponentName ?? 'OPPONENT').trim() || 'OPPONENT';
  const oppProgress = Math.max(0, Math.min(5, Math.round(onlineOpponentProgress)));
  const reduceMotion = getPrefersReducedMotion();
  const { resume, playReject, playUiBack } =
    useSound();
  const { t } = useLocale();

  const [slots, setSlots] = useState<RosterSlots>(EMPTY_ROSTER);
  const [phase, setPhase] = useState<Phase>('draft');
  const [spunTeam, setSpunTeam] = useState<TeamInfo | null>(() => franchise?.pendingSpin?.team ?? null);
  const [spunEra, setSpunEra] = useState<DecadeEra | null>(() => franchise?.pendingSpin?.era ?? null);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [offers, setOffers] = useState<EraOfferPlayer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [movingFrom, setMovingFrom] = useState<Position | null>(null);
  const [slamPayload, setSlamPayload] = useState<DraftSlamPayload | null>(null);
  const [slamSlot, setSlamSlot] = useState<Position | null>(null);
  const [justFilledSlot, setJustFilledSlot] = useState<Position | null>(null);
  /** Hub court tilts toward this seat on placement impact. */
  const [courtImpactSlot, setCourtImpactSlot] = useState<Position | null>(null);
  /** Team primary at impact — drives court color surge (not hardcoded). */
  const [courtImpactColor, setCourtImpactColor] = useState<string | null>(null);
  /** Hide seat chip while the premium fly disc is airborne. */
  const [concealSlot, setConcealSlot] = useState<Position | null>(null);
  /** Classic hub: run ANALYZING FIVE on the court before the value screen. */
  const [courtAnalyze, setCourtAnalyze] = useState(false);
  /** True after the hub-court siphon — ClassicRosterReveal starts at FINALIZING VALUE. */
  const [revealSkipAnalyze, setRevealSkipAnalyze] = useState(false);
  /** Classic: the arena lights go out between the fifth pick and the results. */
  const [arenaBlackout, setArenaBlackout] = useState(false);
  const pendingAssignRef = useRef<{
    slot: Position;
    valued: ValuedPlayer & { era?: DecadeEra };
  } | null>(null);
  /** Team/Era rerolls allowed (Classic). Cap is MAX_REROLLS_PER_RUN; first Team + first Era free. */
  const rerollsAllowed = !isFranchise && (!circuit || circuit.rerollsAllowed);
  const [rerollsUsedCount, setRerollsUsedCount] = useState(0);
  const [freeTeamLeft, setFreeTeamLeft] = useState(rerollsAllowed);
  const [freeEraLeft, setFreeEraLeft] = useState(rerollsAllowed);
  const [perkUses, setPerkUses] = useState(0);
  const [xrayActive, setXrayActive] = useState(false);
  const [doubleDraftLeft, setDoubleDraftLeft] = useState(0);
  const [swapMode, setSwapMode] = useState(false);
  const [triviaOpen, setTriviaOpen] = useState(false);
  const [triviaRunRef, setTriviaRunRef] = useState('');
  const pendingPlayAgainRef = useRef<(() => void) | null>(null);
  /** Settled celebration total — only source for Build Another → trivia eligibility. */
  const settledTeamValueRef = useRef(0);
  const evaluationSettledRef = useRef(false);
  const triviaEligibilityRef = useRef<TriviaEligibility>('pending');
  const triviaOpenedRef = useRef(false);
  const [spendConfirm, setSpendConfirm] = useState<null | {
    kind: 'perk' | 'reroll';
    perkId?: PerkId;
    rerollKind?: TicketRerollKind;
    title: string;
    copy: string;
  }>(null);
  const [boothReroll, setBoothReroll] = useState<TicketRerollKind | null>(null);
  const clearBoothReroll = useCallback(() => setBoothReroll(null), []);
  /** Reroll spinning inside the selection header — the other result stays put. */
  const [headerReroll, setHeaderReroll] = useState<TicketRerollKind | null>(null);
  const [rerollFrom, setRerollFrom] = useState<SpinPair | null>(null);
  /** Classic draft sheet: expanded (player list) vs collapsed (court). */
  const [sheetOpen, setSheetOpen] = useState(true);
  const sheetTimerRef = useRef(0);
  /** Remounts the spin booth so it returns to SPIN after each pick (it stays mounted behind the sheet). */
  const [boothKey, setBoothKey] = useState(0);
  /** Pick just placed: the sheet leaves at once while the heavier table reset waits a beat. */
  const [sheetDismissed, setSheetDismissed] = useState(false);
  /** A reroll is spinning on the booth reels; the sheet stays down until it lands. */
  const [boothRerolling, setBoothRerolling] = useState(false);
  /** UI mirror of interactionLockRef — disables pick/reroll during commit. */
  const [pickInteractionLocked, setPickInteractionLocked] = useState(false);
  const [status, setStatus] = useState<string | null>(
    'Tap ROLL to land a team and era.',
  );
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [worldRank, setWorldRank] = useState(0);
  const evalStartedRef = useRef(false);
  // Circuit entries submit under the server-issued attempt id.
  const runRefRef = useRef<string | null>(circuit?.attemptId ?? null);
  const runRecordedRef = useRef(false);
  const [runStarted, setRunStarted] = useState(false);
  /** This run's payouts and verification (recorded server-side; the results screen stays clean). */
  const [, setEarnings] = useState<RunEarningsData | null>(null);
  const { state: account } = useAccountAuth();

  /** This run's one optional objective (Classic runs only — never Cash Cups). */
  const runBonus = useRunBonus(
    isClassicRun && !circuit,
    account.status === 'loading' ? null : account.status === 'permanent',
  );
  const runBonusRef = useRef(runBonus);
  runBonusRef.current = runBonus;
  const teamRerollUsedRef = useRef(false);
  const eraRerollUsedRef = useRef(false);
  const rerollsUsedCountRef = useRef(0);
  const freeTeamLeftRef = useRef(rerollsAllowed);
  const freeEraLeftRef = useRef(rerollsAllowed);
  freeTeamLeftRef.current = freeTeamLeft;
  freeEraLeftRef.current = freeEraLeft;
  rerollsUsedCountRef.current = rerollsUsedCount;
  /** Blocks select/reroll/slot commits until placement finishes or table resets. */
  const interactionLockRef = useRef(false);
  /** Sync lock for Team/Era reroll taps — set before free/coin consume. */
  const rerollInFlightRef = useRef(false);
  /** Pre-validated pair for the in-flight reroll animation. */
  const [rerollTarget, setRerollTarget] = useState<SpinPair | null>(null);
  const lockInteractions = useCallback(() => {
    interactionLockRef.current = true;
    setPickInteractionLocked(true);
  }, []);
  const unlockInteractions = useCallback(() => {
    interactionLockRef.current = false;
    setPickInteractionLocked(false);
  }, []);
  const releaseRerollLock = useCallback(() => {
    rerollInFlightRef.current = false;
    setRerollTarget(null);
  }, []);
  const fourPlayerTotalBeforeFifthRef = useRef<number | null>(null);
  const resetTimerRef = useRef(0);
  const transitionTimerRef = useRef(0);
  const lockInFlightRef = useRef(false);
  const syncedSlotSetRef = useRef<Set<Position>>(new Set());
  /** Keep optimistic seat layout until the server reflects a completed move. */
  const pendingMoveRef = useRef<{ from: Position; to: Position } | null>(null);
  /** Optimistic locks awaiting server confirmation. */
  const pendingLockSlotsRef = useRef<Set<Position>>(new Set());

  useEffect(() => {
    if (!isSynced) return;
    if (slamPayload || movingFrom) return;

    const pendingMove = pendingMoveRef.current;
    if (pendingMove) {
      const atDest = syncedPicks.some((pick) => pick.position === pendingMove.to);
      const atSource = syncedPicks.some((pick) => pick.position === pendingMove.from);
      if (atDest && !atSource) {
        pendingMoveRef.current = null;
      } else if (syncedPicks.length > 0 || pendingMove) {
        // Hold optimistic seats until move is confirmed — avoids 1–2s snap-back lag.
        return;
      }
    }

    // Clear confirmed pending locks.
    if (pendingLockSlotsRef.current.size > 0) {
      for (const pos of [...pendingLockSlotsRef.current]) {
        if (syncedPicks.some((pick) => pick.position === pos)) {
          pendingLockSlotsRef.current.delete(pos);
        }
      }
      if (pendingLockSlotsRef.current.size > 0) {
        return;
      }
    }

    if (syncedPicks.length === 0) return;

    const fromServer = syncedPicksToSlots(syncedPicks);
    setSlots(() => {
      const next: RosterSlots = { ...EMPTY_ROSTER };
      for (const pos of LINEUP_POSITIONS) {
        next[pos] = fromServer[pos] ?? null;
      }
      return next;
    });
    syncedSlotSetRef.current = new Set(
      syncedPicks.map((pick) => pick.position as Position),
    );
  }, [isSynced, syncedPicks, slamPayload, movingFrom]);

  useEffect(() => {
    resume();
    preloadGameAudio();
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      if (sheetTimerRef.current) window.clearTimeout(sheetTimerRef.current);
      stopWheelSpinSound();
    };
  }, [resume]);
  const filled = useMemo(() => rosterList(slots), [slots]);
  const teamValue = useMemo(() => sumTeamValue(filled), [filled]);
  const filledCount = filled.length;
  const seatedValues = useMemo(
    () => pricedLineup(slots).map((p) => ({ playerId: p.id, value: p.dollarValue })),
    [slots],
  );
  useEffect(() => {
    if (!isOnline || !onOnlineProgress) return;
    onOnlineProgress(filledCount);
  }, [filledCount, isOnline, onOnlineProgress]);

  const readyToDraft = Boolean(spunTeam && spunEra) && !ticketPrinting && !boothRerolling;

  // Every landed spin opens the player list.
  useEffect(() => {
    if (readyToDraft) setSheetOpen(true);
  }, [readyToDraft]);

  // The booth keeps its landed reels until remounted: refresh it once the table clears
  // after a pick — never on its own landing.
  const boothHadPairRef = useRef(false);
  useEffect(() => {
    const hasPair = Boolean(spunTeam && spunEra);
    const had = boothHadPairRef.current;
    boothHadPairRef.current = hasPair;
    if (had && !hasPair && !ticketPrinting) setBoothKey((k) => k + 1);
  }, [spunTeam, spunEra, ticketPrinting]);
  const lockedPair = useMemo<SpinPair | null>(
    () => (spunTeam && spunEra ? { team: spunTeam, era: spunEra } : null),
    [spunTeam, spunEra],
  );
  const selectedOffer = offers.find((p) => p.id === selectedOfferId) ?? null;
  const movingPlayer = movingFrom ? slots[movingFrom] : null;
  const openSlots = LINEUP_POSITIONS.filter((pos) => !slots[pos]).length;
  const openPositions = useMemo(
    () => LINEUP_POSITIONS.filter((pos) => !slots[pos]),
    [slots],
  );
  const rosteredIds = useMemo(
    () => new Set(filled.map((p) => p.id)),
    [filled],
  );
  const rosteredNames = useMemo(
    () => new Set(filled.map((p) => normalizePlayerName(p.name))),
    [filled],
  );

  const handleTicketPrint = useCallback(() => {
    if (phase !== 'draft' || evalStartedRef.current) return;
    if (!runStarted && isClassicRun && !circuit) {
      setRunStarted(true);
      runRefRef.current ??= newRunRef();
    }
    resume();
    // Keep AudioContext warm on the Print gesture (shared Classic + 1V1 path).
    unlockGameAudio();
    setTicketPrinting(true);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setSpunTeam(null);
    setSpunEra(null);
    setStatus('Rolling…');
  }, [circuit, isClassicRun, phase, resume, runStarted]);

  const handleTicketResult = useCallback((pair: SpinPair) => {
    unlockInteractions();
    releaseRerollLock();
    setSpunTeam(pair.team);
    setSpunEra(pair.era);
    setTicketPrinting(false);
    setBoothRerolling(false);
    setRerollFrom(null);
    setHeaderReroll(null);
    setStatus(
      `${pair.team.fullName} · ${pair.era} — pick a player, then tap an open circle.`,
    );
  }, [releaseRerollLock, unlockInteractions]);

  const handleHeaderRerollSettled = useCallback((pair: SpinPair) => {
    setSpunTeam(pair.team);
    setSpunEra(pair.era);
    setHeaderReroll(null);
    setRerollFrom(null);
    unlockInteractions();
    releaseRerollLock();
    setStatus(
      `${pair.team.fullName} · ${pair.era} — pick a player, then tap an open circle.`,
    );
  }, [releaseRerollLock, unlockInteractions]);

  const { coins: liveCoins } = useXpProfile();
  const rerollsRemaining = Math.max(0, MAX_REROLLS_PER_RUN - rerollsUsedCount);
  const canPayReroll = liveCoins >= COINS_REROLL_COST || getXpCoins() >= COINS_REROLL_COST;
  const canRerollTeam =
    rerollsAllowed && rerollsRemaining > 0 && (freeTeamLeft || canPayReroll);
  const canRerollEra =
    rerollsAllowed && rerollsRemaining > 0 && (freeEraLeft || canPayReroll);

  const executeTicketReroll = useCallback((kind: TicketRerollKind) => {
    if (phase !== 'draft' || ticketPrinting || evalStartedRef.current) return;
    if (interactionLockRef.current || slamPayload || pendingAssignRef.current) return;
    // Synchronous gate — must beat a second tap before React re-renders.
    if (rerollInFlightRef.current) return;
    if (!rerollsAllowed) return;
    if (!spunTeam || !spunEra) {
      setStatus('Roll a team and era before rerolling.');
      return;
    }
    if (rerollsUsedCountRef.current >= MAX_REROLLS_PER_RUN) {
      setStatus(`No rerolls left (${MAX_REROLLS_PER_RUN} max this run).`);
      return;
    }

    rerollInFlightRef.current = true;

    const baseline: SpinPair = { team: spunTeam, era: spunEra };
    let next: SpinPair | null = null;
    try {
      next = resolveRerollPair(listValidSpinPairs(), baseline, kind);
    } catch (err) {
      console.warn('[BillionTradeEngine] reroll pair failed', err);
      next = null;
    }
    if (!next) {
      setStatus(
        kind === 'team'
          ? 'No other team available for this era.'
          : 'No other era available for this team.',
      );
      releaseRerollLock();
      return;
    }

    const free = kind === 'team' ? freeTeamLeftRef.current : freeEraLeftRef.current;
    if (!free) {
      if (!spendXpCoins(COINS_REROLL_COST, `reroll:${kind}`)) {
        setStatus(`Need ${COINS_REROLL_COST} coins to reroll.`);
        releaseRerollLock();
        return;
      }
    } else if (kind === 'team') {
      setFreeTeamLeft(false);
      freeTeamLeftRef.current = false;
    } else {
      setFreeEraLeft(false);
      freeEraLeftRef.current = false;
    }
    if (kind === 'team') teamRerollUsedRef.current = true;
    else eraRerollUsedRef.current = true;
    const nextUsed = rerollsUsedCountRef.current + 1;
    rerollsUsedCountRef.current = nextUsed;
    setRerollsUsedCount(nextUsed);
    setRerollTarget(next);
    resume();
    // Start in this tap. The header reel begins in an effect, after iPhone drops HTML play().
    playSpinClickSound();
    startWheelSpinSound(WHEEL_SPIN_DURATION_MS);
    lockInteractions();
    setSelectedOfferId(null);
    setMovingFrom(null);
    if (useClassicDraftChrome) {
      // The list slides away and the booth reels spin the reroll; the list returns on landing.
      setRerollFrom(baseline);
      setBoothRerolling(true);
      setBoothReroll(kind);
    } else {
      setHeaderReroll(kind);
    }
    const left = MAX_REROLLS_PER_RUN - nextUsed;
    setStatus(
      kind === 'team'
        ? `Rerolling team… (${left} reroll${left === 1 ? '' : 's'} left)`
        : `Rerolling era… (${left} reroll${left === 1 ? '' : 's'} left)`,
    );
  }, [
    phase,
    ticketPrinting,
    resume,
    spunTeam,
    spunEra,
    slamPayload,
    lockInteractions,
    releaseRerollLock,
    useClassicDraftChrome,
    rerollsAllowed,
  ]);

  const handleTicketReroll = useCallback(
    (kind: TicketRerollKind) => {
      const free = kind === 'team' ? freeTeamLeftRef.current : freeEraLeftRef.current;
      if (free) {
        executeTicketReroll(kind);
        return;
      }
      setSpendConfirm({
        kind: 'reroll',
        rerollKind: kind,
        title: kind === 'team' ? 'Reroll team?' : 'Reroll era?',
        copy: `Spend ${COINS_REROLL_COST} coins to reroll this ${kind}?`,
      });
    },
    [executeTicketReroll],
  );

  // Load era board AFTER spin completes — never during reel frames.
  useEffect(() => {
    if (!spunTeam || !spunEra || ticketPrinting) return;
    let cancelled = false;
    const team = spunTeam;
    const era = spunEra;
    const names = rosteredNames;

    const build = () => {
      if (cancelled) return;
      try {
        const next = buildEraRoster(team, era).filter(
          (p) => !names.has(normalizePlayerName(p.name)),
        );
        if (cancelled) return;
        setOffers(next);
        if (next.length === 0) {
          setStatus(
            `${team.fullName} · ${era} — no available players. Reroll or go back.`,
          );
          return;
        }
        setStatus(
          `${team.fullName} · ${era} — pick a player, then tap an open circle.`,
        );
      } catch (err) {
        console.warn('[BillionTradeEngine] Failed to load era roster', err);
        if (!cancelled) {
          setOffers([]);
          setStatus('Could not load that roster. Try a reroll.');
        }
      }
    };

    // Yield one frame so spin land paint lands first
    const t = window.setTimeout(build, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [spunTeam, spunEra, ticketPrinting, rosteredNames]);

  const availableOffers = useMemo(
    () =>
      offers.filter(
        (p) =>
          !rosteredIds.has(p.id) &&
          !rosteredNames.has(normalizePlayerName(p.name)),
      ),
    [offers, rosteredIds, rosteredNames],
  );

  // Drop selection if the chosen player can no longer fill any open slot.
  useEffect(() => {
    if (!selectedOfferId) return;
    const selected = offers.find((p) => p.id === selectedOfferId);
    if (!selected) return;
    const stillFits = openPositions.some((pos) => playerFitsSlot(selected, pos));
    if (!stillFits) setSelectedOfferId(null);
  }, [offers, openPositions, selectedOfferId]);

  const resetTableForNextPick = useCallback(() => {
    unlockInteractions();
    setSheetDismissed(false);
    setSpunTeam(null);
    setSpunEra(null);
    setTicketPrinting(false);
    setOffers([]);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setHeaderReroll(null);
    // Rerolls are once per run — do not refresh between tickets.
    setStatus('Tap SPIN for your next team and era.');
  }, [unlockInteractions]);

  const finishPickPlacement = useCallback(
    async (
      targetSlot: Position,
      player: ValuedPlayer & { era?: DecadeEra },
      opts?: { skipReset?: boolean },
    ) => {
      lockInteractions();
      const priorCount = rosterList(slots).length;
      if (priorCount === 4) {
        fourPlayerTotalBeforeFifthRef.current = rosterList(slots).reduce(
          (sum, p) => sum + getDollarValue(p),
          0,
        );
      }

      const nextSlots: RosterSlots = { ...slots, [targetSlot]: player };
      const full = LINEUP_POSITIONS.every((pos) => nextSlots[pos]);
      setSlots(nextSlots);
      setSelectedOfferId(null);
      setMovingFrom(null);
      setJustFilledSlot(targetSlot);
      window.setTimeout(() => {
        setJustFilledSlot((current) => (current === targetSlot ? null : current));
      }, 600);

      if (isSynced && onPickLock) {
        pendingLockSlotsRef.current.add(targetSlot);
        syncedSlotSetRef.current.add(targetSlot);
        const era = (player.era ?? spunEra ?? '2020s') as DecadeEra;
        const { selection, rawValue } = playerToH2HPick(
          player,
          targetSlot,
          era,
          spunTeam,
        );
        // Fire-and-forget so Classic seat-in is never blocked on the network.
        void onPickLock(targetSlot as H2HPosition, selection, rawValue).catch(() => {
          pendingLockSlotsRef.current.delete(targetSlot);
          syncedSlotSetRef.current.delete(targetSlot);
          setSlots((prev) => ({ ...prev, [targetSlot]: null }));
          setStatus('Pick failed to sync — tap the circle again.');
          unlockInteractions();
        });
      }

      if (full) {
        if (isSynced && deferOnlineReveal) {
          setStatus(isFranchise ? 'Lineup complete.' : 'Lineup locked — waiting for opponent…');
          resetTableForNextPick();
          return;
        }
        if (evalStartedRef.current) return;
        evalStartedRef.current = true;
        setStatus(
          isH2H
            ? 'Lineup complete — value showdown…'
            : 'Lineup complete — valuing your five…',
        );
        // Classic: return to hub court (same as after every pick), siphon there, then value.
        if (useClassicDraftChrome && !deferOnlineReveal) {
          if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
          setSpunTeam(null);
          setSpunEra(null);
          setOffers([]);
          setSelectedOfferId(null);
          setMovingFrom(null);
          if (isClassicRun) {
            // The fifth jersey lands, the arena lights go out, then the results light up.
            setSheetDismissed(true);
            resetTimerRef.current = window.setTimeout(() => {
              setArenaBlackout(true);
              resetTimerRef.current = window.setTimeout(() => setPhase('reveal'), reduceMotion ? 0 : 300);
            }, reduceMotion ? 0 : 320);
          } else if (EXPERIMENTAL_DRAFT_HUB_CARDS) {
            resetTimerRef.current = window.setTimeout(() => {
              setCourtAnalyze(true);
            }, reduceMotion ? 40 : 150);
          } else {
            resetTimerRef.current = window.setTimeout(() => {
              setPhase('reveal');
            }, reduceMotion ? 80 : 480);
          }
          return;
        }
        setSpunTeam(null);
        setSpunEra(null);
        setOffers([]);
        setPhase('reveal');
        return;
      }

      setStatus(`${player.name} locked at ${POSITION_LABELS[targetSlot]}.`);
      if (opts?.skipReset) return;

      // Double Draft: stay on the same team/era for the second pick.
      if (doubleDraftLeft > 1) {
        setDoubleDraftLeft((n) => Math.max(0, n - 1));
        setOffers((prev) => prev.filter((p) => p.id !== player.id));
        setSheetDismissed(false);
        setSheetOpen(true);
        unlockInteractions();
        setStatus('Double Draft — pick your second player from this roll.');
        return;
      }
      if (doubleDraftLeft === 1) {
        setDoubleDraftLeft(0);
      }

      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      // Classic: paint the filled jersey first; remount the booth once that frame is out.
      if (useClassicDraftChrome) setSheetDismissed(true);
      const resetMs = useClassicDraftChrome
        ? reduceMotion
          ? 0
          : 260
        : reduceMotion
          ? 40
          : 220;
      resetTimerRef.current = window.setTimeout(
        () => resetTableForNextPick(),
        resetMs,
      );
    },
    [
      deferOnlineReveal,
      doubleDraftLeft,
      isClassicRun,
      isFranchise,
      isH2H,
      isSynced,
      lockInteractions,
      onPickLock,
      reduceMotion,
      resetTableForNextPick,
      slots,
      spunEra,
      spunTeam,
      unlockInteractions,
      useClassicDraftChrome,
    ],
  );

  const runPayoutRef = useCallback(() => {
    runRefRef.current ??= newRunRef();
    return runRefRef.current;
  }, []);

  const rerollsUsed = () => rerollsUsedCountRef.current > 0;

  const applyPerk = useCallback(
    (id: PerkId) => {
      if (!isClassicRun || evalStartedRef.current || phase !== 'draft') return;
      if (perkUses >= MAX_PERK_USES) {
        setStatus(`Perk limit reached (${MAX_PERK_USES} per run).`);
        return;
      }
      if (id === 'xray' && xrayActive) return;
      if (id === 'double_draft' && doubleDraftLeft > 0) return;
      if (id === 'player_swap' && swapMode) return;
      if (!purchasePerkActivation(id)) {
        setStatus('Need 100 coins for that perk.');
        return;
      }
      setPerkUses((n) => n + 1);
      if (id === 'xray') {
        setXrayActive(true);
        setStatus('X-Ray Vision on — player values revealed for this run.');
      } else if (id === 'double_draft') {
        setDoubleDraftLeft(2);
        setStatus('Double Draft — pick two players from the same team/era.');
      } else {
        setSwapMode(true);
        setStatus('Player Swap — select a roster player, then an eligible offer to replace them.');
      }
    },
    [doubleDraftLeft, isClassicRun, perkUses, phase, swapMode, xrayActive],
  );

  const handleActivatePerk = useCallback(
    (id: PerkId) => {
      if (!isClassicRun || evalStartedRef.current || phase !== 'draft') return;
      if (perkUses >= MAX_PERK_USES) {
        setStatus(`Perk limit reached (${MAX_PERK_USES} per run).`);
        return;
      }
      if (id === 'xray' && xrayActive) return;
      if (id === 'double_draft' && doubleDraftLeft > 0) return;
      if (id === 'player_swap' && swapMode) return;
      const def = PERK_DEFS.find((p) => p.id === id);
      const stock = getPerkStock(id);
      const canPay = canAffordPerk(id);
      if (!canPay && stock <= 0) {
        setStatus('Need 100 coins for that perk.');
        return;
      }
      // Always confirm — never auto-fire inventory or coin spends.
      setSpendConfirm({
        kind: 'perk',
        perkId: id,
        title: `Use ${def?.title ?? 'perk'}?`,
        copy:
          stock > 0
            ? `Use 1 inventory charge? Each perk can only be used once this run.`
            : `Spend ${COINS_PERK_COST} coins? Each perk can only be used once this run.`,
      });
    },
    [doubleDraftLeft, isClassicRun, perkUses, phase, swapMode, xrayActive],
  );

  const markTriviaEvaluationSettled = useCallback((teamValue: number) => {
    const next = lockSettledTriviaTotal(
      {
        evaluationSettled: evaluationSettledRef.current,
        settledTotal: settledTeamValueRef.current,
        eligibility: triviaEligibilityRef.current,
      },
      teamValue,
    );
    if (!next.lockedNow) return;
    evaluationSettledRef.current = true;
    settledTeamValueRef.current = next.settledTotal;
    triviaEligibilityRef.current = next.eligibility;
  }, []);

  const requestPlayAgain = useCallback(() => {
    const again = onPlayAgain ?? onExit;
    // Classic: gate Trivia only on the locked settled evaluation total — never a live re-sum.
    const runRef = isClassicRun ? runPayoutRef() : runRefRef.current;
    const decision = decideTriviaGate({
      isClassicRun,
      evaluationSettled: evaluationSettledRef.current,
      settledTotal: settledTeamValueRef.current,
      eligibility: triviaEligibilityRef.current,
      runRef,
      triviaOpened: triviaOpenedRef.current,
      triviaOpen,
    });
    if (decision.action === 'wait' || decision.action === 'ignore') return;
    if (decision.action === 'open') {
      triviaOpenedRef.current = true;
      pendingPlayAgainRef.current = again;
      setTriviaRunRef(decision.runRef);
      setTriviaOpen(true);
      return;
    }
    again();
  }, [isClassicRun, onExit, onPlayAgain, runPayoutRef, triviaOpen]);

  const finishTrivia = useCallback(() => {
    if (!triviaOpen) return;
    setTriviaOpen(false);
    const again = pendingPlayAgainRef.current ?? onPlayAgain ?? onExit;
    pendingPlayAgainRef.current = null;
    // Defer remount so the trivia portal can unmount cleanly first.
    window.setTimeout(() => again(), 0);
  }, [onExit, onPlayAgain, triviaOpen]);

  /** Leave results without Trivia (still starts a new run). */
  const skipTriviaAndReplay = useCallback(() => {
    if (triviaOpen || triviaOpenedRef.current) return;
    triviaOpenedRef.current = true;
    const again = onPlayAgain ?? onExit;
    again();
  }, [onExit, onPlayAgain, triviaOpen]);

  // Keep hub overlays (XP, etc.) from covering trivia while it's open over results.
  useEffect(() => {
    if (!triviaOpen) return;
    return holdInterruptions();
  }, [triviaOpen]);

  /**
   * Once per Classic run: Rollover (guests are paid here; the server pays signed-in runs when the
   * run is recorded), the Run Bonus verdict for guests, and the earnings panel.
   */
  const recordClassicRun = useCallback(
    (total: number, achievementIds: string[], finalSlots: RosterSlots) => {
      if (!isClassicRun || runRecordedRef.current) return;
      runRecordedRef.current = true;
      const runRef = runPayoutRef();
      const local = account.status !== 'permanent';
      if (local) payLocalRollover(runRef, total);
      const bonus = circuit ? null : runBonusRef.current;
      let runBonusOutcome: RunBonusOutcome = { status: 'none', bonusId: null, payout: 0 };
      if (bonus?.mode === 'local') {
        const seats = LINEUP_POSITIONS.flatMap((pos) => {
          const player = finalSlots[pos];
          return player
            ? [{ playerId: player.id, slot: pos, primary: player.primaryPosition, value: getDollarValueForSlot(player, pos) }]
            : [];
        });
        const verdict = settleLocalRunBonus(runBonusFacts(seats, rerollsUsed()));
        runBonusOutcome = verdict
          ? { status: verdict.completed ? 'completed' : 'missed', bonusId: verdict.bonusId, payout: verdict.payout }
          : runBonusOutcome;
      } else if (bonus) {
        runBonusOutcome = { status: 'pending', bonusId: bonus.bonusId, payout: 0 };
      }
      setEarnings({
        runRef,
        runValue: total,
        achievementIds,
        submit: 'pending',
        local,
        runBonus: runBonusOutcome,
        circuit: circuit ? { name: circuit.name } : null,
      });
      // XP / coins credit here (idempotent on runRef). Level-up UI waits for hub return.
      awardClassicRunXp(runRef, total);
      // Offline Dynasty preview records the run here (the server records real accounts' runs).
      if (isDynastyPreview()) {
        const ids = LINEUP_POSITIONS.flatMap((pos) => (finalSlots[pos] ? [finalSlots[pos]!.id] : []));
        if (ids.length === 5) previewRecordRun(runRef, ids, total);
      }
    },
    [account.status, circuit, isClassicRun, runPayoutRef],
  );

  const finishRun = useCallback(
    (nextSlots: RosterSlots, value: number) => {
      const lineup = pricedLineup(nextSlots);
      const seatTotal = lineup.reduce((sum, player) => sum + player.dollarValue, 0);
      const total = seatTotal > 0 ? seatTotal : value;

      const { best, isNewBest } = saveBestRosterValue(total);
      setPersonalBest(best);
      setIsNewPersonalBest(isNewBest);

      const rank = getWorldRank(total);
      setWorldRank(rank);
      saveBestWorldRank(rank);

      if (isClassicRun) {
        recordClassicRun(total, [], nextSlots);
        const runRef = runPayoutRef();
        // Server verifies lineup + computes value. Never blocks Classic UX.
        void withTimeout(submitVerifiedClassicLineup(lineup, runRef), SUBMIT_TIMEOUT_MS, {
          ok: false as const,
          message: 'timeout',
        }).then((result) => {
          const skipped = !result.ok && 'skipped' in result && Boolean(result.skipped);
          setEarnings((current) =>
            current
              ? {
                  ...current,
                  submit: result.ok ? 'ok' : skipped ? 'skipped' : 'failed',
                  verifiedValue: result.ok ? result.verifiedValue : null,
                }
              : current,
          );
          if (!circuit && runBonusRef.current?.mode === 'server') {
            const verdict = result.ok ? settleRunBonus(runRef, rerollsUsed()) : Promise.resolve(null);
            void verdict.then((res) =>
              setEarnings((current) => {
                if (!current) return current;
                const a = res && res.ok ? res.assignment : null;
                const mine = a && a.clientRunId === runRef && a.status !== 'open';
                return {
                  ...current,
                  runBonus: mine
                    ? { status: a!.status as 'completed' | 'missed', bonusId: a!.bonusId, payout: a!.payout }
                    : { ...current.runBonus, status: 'error' },
                };
              }),
            );
          }
          if (!result.ok && !skipped) {
            console.error('[classic] leaderboard submit did not land', result);
          }
        });
      }

      if (total >= BILLION_GOAL) {
        if (isClassicRun) {
          saveBillionRun(lineup, total);
        }
        // Result SFX is owned by the reveal UI (results_celebration).
        onWin?.();
        setStatus(`Dynasty complete · ${formatDollarsExact(total)}`);
      } else {
        setStatus(`Board full at ${formatDollarsExact(total)} — short of ${formatDollarsExact(BILLION_GOAL)}.`);
      }

      return { personalBest: best, isNewPersonalBest: isNewBest, worldRank: rank };
    },
    [circuit, isClassicRun, onWin, recordClassicRun, runPayoutRef],
  );

  const handleCourtAnalyzeComplete = useCallback(() => {
    setCourtAnalyze(false);
    setRevealSkipAnalyze(true);
    setPhase('reveal');
  }, []);

  const handleTotalSettled = useCallback(
    (payload: { teamValue: number }) => {
      if (!isClassicRun) return;
      // Lock settled total for Trivia as soon as evaluation finishes counting.
      markTriviaEvaluationSettled(payload.teamValue);
      const lineup = rosterInSlotOrder(slots);
      const previousBest = getBestRosterValue();
      const unlocked = processClassicRunChallenges(
        {
          teamValue: payload.teamValue,
          players: lineup,
          teamRerollUsed: teamRerollUsedRef.current,
          eraRerollUsed: eraRerollUsedRef.current,
          fourPlayerTotalBeforeFifth: fourPlayerTotalBeforeFifthRef.current,
        },
        previousBest,
      );
      // Their Cash is celebrated by the earnings summary back on the home screen.
      if (unlocked.length > 0) notifyAchievementsUnlocked();
      const seatTotal = pricedLineup(slots).reduce((sum, player) => sum + player.dollarValue, 0);
      recordClassicRun(seatTotal > 0 ? seatTotal : payload.teamValue, unlocked, slots);
    },
    [isClassicRun, markTriviaEvaluationSettled, recordClassicRun, slots],
  );

  const handleRevealComplete = useCallback(
    (payload: { teamValue: number }) => {
      // Duplicate completion callbacks keep the first locked settled total.
      markTriviaEvaluationSettled(payload.teamValue);
      finishRun(slots, payload.teamValue);
      // Do NOT signal XP here — XpRewardHost would cover Build Another / Share (same z-index).
      // Pending XP plays when the player returns to hub (armWithoutSignal).
      if (isOnline && onOnlineComplete) {
        const lineup = serializeMatchLineup(rosterInSlotOrder(slots));
        onOnlineComplete({
          lineup,
          totalValue: Math.round(payload.teamValue),
        });
      }
    },
    [finishRun, isOnline, markTriviaEvaluationSettled, onOnlineComplete, slots],
  );

  const handleSelectOffer = useCallback(
    (player: EraOfferPlayer) => {
      if (phase !== 'draft' || !readyToDraft || evalStartedRef.current) return;
      if (
        interactionLockRef.current ||
        slamPayload ||
        pendingAssignRef.current ||
        ticketPrinting
      ) {
        return;
      }
      resume();
      hapticSelection();
      playPlaceClickSound();
      setMovingFrom(null);
      const selecting = selectedOfferId !== player.id;
      setSelectedOfferId(selecting ? player.id : null);
      const alts = formatEligiblePositions(player);
      setStatus(`Selected ${player.name} (${alts}) — tap an open matching jersey.`);
      if (selecting && useClassicDraftChrome) {
        // Reveal the court in the same frame; the check mark shows while the sheet slides down.
        if (sheetTimerRef.current) window.clearTimeout(sheetTimerRef.current);
        setSheetOpen(false);
      }
    },
    [phase, readyToDraft, resume, selectedOfferId, slamPayload, ticketPrinting, useClassicDraftChrome],
  );

  const handleSlotClick = useCallback(
    (slot: Position) => {
      if (phase !== 'draft' || evalStartedRef.current || slamPayload) return;
      if (interactionLockRef.current || pendingAssignRef.current) return;
      resume();
      hapticTap();

      const occupant = slots[slot];

      // Move an already-locked versatile player into an empty eligible slot.
      if (movingFrom && movingPlayer) {
        if (movingFrom === slot) {
          setMovingFrom(null);
          setStatus('Move cancelled.');
          return;
        }
        if (occupant) {
          if (!canSwapSeats(movingPlayer, movingFrom, occupant, slot)) {
            playReject();
            setStatus(
              `${movingPlayer.name} and ${occupant.name} can't trade ${movingFrom} and ${slot}.`,
            );
            return;
          }
          const fromSlot = movingFrom;
          setSlots({
            ...slots,
            [fromSlot]: { ...occupant, dollarValue: getDollarValueForSlot(occupant, fromSlot) },
            [slot]: { ...movingPlayer, dollarValue: getDollarValueForSlot(movingPlayer, slot) },
          });
          setMovingFrom(null);
          hapticSlotConfirm();
          playPlaceClickSound();
          setStatus(`${movingPlayer.name} and ${occupant.name} swapped ${fromSlot} and ${slot}.`);
          return;
        }
        if (!canMoveToSlot(movingPlayer, movingFrom, slot)) {
          playReject();
          setStatus(
            `${movingPlayer.name} can play ${formatEligiblePositions(movingPlayer)} only.`,
          );
          return;
        }
        lockInteractions();
        const reseated: ValuedPlayer = {
          ...movingPlayer,
          dollarValue: getDollarValueForSlot(movingPlayer, slot),
        };
        const nextSlots: RosterSlots = {
          ...slots,
          [movingFrom]: null,
          [slot]: reseated,
        };
        setSlots(nextSlots);
        const moveFrom = movingFrom;
        setMovingFrom(null);
        hapticSlotConfirm();
        playPlaceClickSound();
        if (isSynced && onPickMove && syncedSlotSetRef.current.has(moveFrom)) {
          const era = (spunEra ?? '2020s') as DecadeEra;
          const { selection, rawValue } = playerToH2HPick(
            reseated,
            slot,
            era,
            spunTeam,
          );
          pendingMoveRef.current = { from: moveFrom, to: slot };
          syncedSlotSetRef.current.delete(moveFrom);
          syncedSlotSetRef.current.add(slot);
          void onPickMove(
            moveFrom as H2HPosition,
            slot as H2HPosition,
            selection,
            rawValue,
          ).catch(() => {
            // Revert optimistic seat if sync fails.
            pendingMoveRef.current = null;
            setSlots((prev) => ({
              ...prev,
              [slot]: null,
              [moveFrom]: movingPlayer,
            }));
            syncedSlotSetRef.current.delete(slot);
            syncedSlotSetRef.current.add(moveFrom);
            setStatus('Move failed to sync — tap the player and try again.');
          });
        }
        unlockInteractions();
        if (selectedOffer) {
          setStatus(
            `${movingPlayer.name} moved to ${POSITION_LABELS[slot]}. Now place ${selectedOffer.name}.`,
          );
        } else {
          setStatus(`${movingPlayer.name} moved to ${POSITION_LABELS[slot]}.`);
        }
        return;
      }

      // Tap a placed player to move them (also works while an offer is selected,
      // so you can free their circle for the highlighted available player).
      if (occupant) {
        if (!selectedOffer || movingFrom) {
          /* handled above when movingFrom; when no offer, start a move below */
        }
        if (!movingFrom) {
          const alts = getEligiblePositions(occupant);
          const hasOpenAlt = alts.some((pos) => pos !== slot && !slots[pos]);
          const hasSwap = LINEUP_POSITIONS.some((pos) => {
            const other = slots[pos];
            return Boolean(other) && canSwapSeats(occupant, slot, other!, pos);
          });
          if (!hasOpenAlt && !hasSwap) {
            // Without a pick in hand this tap just flips the jersey — not a mistake.
            if (selectedOffer) playReject();
            setStatus(
              selectedOffer
                ? `${occupant.name} has no open alternate slots — cannot free ${POSITION_LABELS[slot]}.`
                : alts.length <= 1
                  ? `${occupant.name} is locked at ${slot} — no alternate slots open.`
                  : `${occupant.name} has no open alternate slots right now.`,
            );
            return;
          }
          if (!selectedOffer) setSelectedOfferId(null);
          setMovingFrom(slot);
          setStatus(
            selectedOffer
              ? `Moving ${occupant.name} to free ${POSITION_LABELS[slot]} for ${selectedOffer.name} — tap an open eligible circle.`
              : `Moving ${occupant.name} (${formatEligiblePositions(occupant)}) — tap an open eligible circle.`,
          );
          return;
        }
      }

      if (!selectedOffer) {
        setStatus('Select a player from the list first.');
        return;
      }

      if (occupant) {
        if (swapMode && playerFitsSlot(selectedOffer, slot)) {
          const valued: ValuedPlayer & { era?: DecadeEra } = {
            ...selectedOffer,
            dollarValue: getDollarValueForSlot(selectedOffer, slot),
            ...(spunEra ? { era: spunEra } : {}),
          };
          lockInteractions();
          playPlaceClickSound();
          hapticSlam();
          setSwapMode(false);
          setSlots((prev) => ({ ...prev, [slot]: valued }));
          setSelectedOfferId(null);
          setOffers((prev) => prev.filter((p) => p.id !== selectedOffer.id));
          unlockInteractions();
          setStatus(`${selectedOffer.name} swapped into ${POSITION_LABELS[slot]}.`);
          return;
        }
        playReject();
        setStatus('That slot is locked — you cannot replace a placed player.');
        return;
      }

      if (!playerFitsSlot(selectedOffer, slot)) {
        playReject();
        setStatus(
          `${selectedOffer.name} can play ${formatEligiblePositions(selectedOffer)} — not ${slot}.`,
        );
        return;
      }

      const valued: ValuedPlayer & { era?: DecadeEra } = {
        ...selectedOffer,
        dollarValue: getDollarValueForSlot(selectedOffer, slot),
        ...(spunEra ? { era: spunEra } : {}),
      };

      const colors = getTeamColors(selectedOffer.teamId);
      const ink = contrastOnPrimary(colors.primary);

      // Lock immediately so fast re-taps cannot select/reroll mid-place.
      lockInteractions();
      playPlaceClickSound();

      // Classic court: the jersey itself pulses, shakes and fades into the team colors.
      if (useClassicDraftChrome && EXPERIMENTAL_DRAFT_HUB_CARDS) {
        hapticSlam();
        void finishPickPlacement(slot, valued);
        return;
      }

      if (useClassicDraftChrome) {
        hapticSlam();
        void finishPickPlacement(slot, valued);
        return;
      }

      if (reduceMotion) {
        hapticSlam();
        void finishPickPlacement(slot, valued);
        return;
      }

      const points = measureDraftSlam(selectedOffer.id, slot);
      if (!points) {
        hapticSlam();
        void finishPickPlacement(slot, valued);
        return;
      }

      pendingAssignRef.current = { slot, valued };
      setSlamSlot(slot);
      setSlamPayload({
        id: `${selectedOffer.id}-${slot}-${Date.now()}`,
        from: points.from,
        to: points.to,
        initials: playerInitials(selectedOffer.name),
        primary: colors.primary,
        ink,
      });
    },
    [
      canSwapSeats,
      finishPickPlacement,
      lockInteractions,
      movingFrom,
      movingPlayer,
      onPickMove,
      phase,
      playReject,
      reduceMotion,
      resume,
      selectedOffer,
      slamPayload,
      slots,
      spunEra,
      spunTeam,
      swapMode,
      unlockInteractions,
      useClassicDraftChrome,
      isH2H,
      isSynced,
    ],
  );

  const handleSlamImpact = useCallback(() => {
    const pending = pendingAssignRef.current;
    if (!pending) return;
    pendingAssignRef.current = null;
    setConcealSlot(null);
    const teamPrimary =
      slamPayload?.primary ?? getTeamColors(pending.valued.teamId).primary;
    setCourtImpactSlot(pending.slot);
    setCourtImpactColor(teamPrimary);
    window.setTimeout(() => {
      setCourtImpactSlot((current) =>
        current === pending.slot ? null : current,
      );
      setCourtImpactColor(null);
    }, COURT_COLOR_WASH_MS);
    void finishPickPlacement(pending.slot, pending.valued, {
      skipReset: Boolean(slamPayload?.premium),
    });
  }, [finishPickPlacement, slamPayload?.premium, slamPayload?.primary]);

  const handleSlamComplete = useCallback(() => {
    const wasPremium = Boolean(slamPayload?.premium);
    setSlamPayload(null);
    setSlamSlot(null);
    setConcealSlot(null);
    if (wasPremium && !evalStartedRef.current) {
      resetTableForNextPick();
    }
  }, [resetTableForNextPick, slamPayload?.premium]);

  const showDraft = phase === 'draft';
  /** Classic draft in the full-screen arena (Jumbotron, court, SPIN). 1v1 keeps its own board. */
  const arenaDraft = isClassicRun && showDraft;
  const showReveal = phase === 'reveal';
  const lineupLocked = isSynced && deferOnlineReveal && filledCount >= 5;
  /** Once five are seated, Franchise shows its own roster preview in place of the court. */
  const showHubCourt = useClassicDraftChrome ? !lineupLocked : !readyToDraft && !lineupLocked;
  /** Who is being placed right now: a moving seated player wins over the list pick. */
  const placingPlayer = movingFrom && movingPlayer ? movingPlayer : selectedOffer;
  const courtTargets =
    placingPlayer && !courtAnalyze
      ? (Object.fromEntries(
          LINEUP_POSITIONS.map((slot) => {
            if (evalStartedRef.current || slamPayload) return [slot, false];
            const occupant = slots[slot];
            if (movingFrom && movingPlayer) {
              return [
                slot,
                occupant
                  ? canSwapSeats(movingPlayer, movingFrom, occupant, slot)
                  : canMoveToSlot(movingPlayer, movingFrom, slot),
              ];
            }
            return [slot, !occupant && playerFitsSlot(selectedOffer!, slot)];
          }),
        ) as Partial<Record<Position, boolean>>)
      : undefined;
  const pickHint = selectedOffer
    ? `Tap an open ${formatEligiblePositions(selectedOffer)} jersey.`
    : movingPlayer
      ? `Moving ${movingPlayer.name} — tap an open eligible jersey.`
      : 'Pick a player, then tap an open jersey.';
  const playerTeamValue = teamValue;

  return (
    <div
      className={`tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820 billion-shell--neo${
        showDraft ? ' billion-shell--picking' : ''
      }${showReveal ? ' billion-shell--vault' : ''}${
        courtAnalyze ? ' is-court-collapsing' : ''
      }${
        isH2H || isOnline ? ' billion-shell--h2h' : ''
      }${arenaDraft ? ' billion-shell--arena' : ''}${showReveal && isClassicRun ? ' billion-shell--results' : ''}`}
    >
      <GameBackground />
      {arenaDraft ? <div className="cj-arena" aria-hidden /> : null}

      <header className={`billion-top billion-top--spin${isH2H || isOnline ? ' billion-top--h2h' : ''}`}>
        <button
          type="button"
          className="tu-back"
          aria-label={arenaDraft ? t('game.home').replace(/^←\s*/, '') : undefined}
          onClick={() => {
            resume();
            playUiBack();
            onExit();
          }}
        >
          {arenaDraft ? (
            <>
              <svg className="cj-back__arrow" viewBox="0 0 24 24" aria-hidden>
                <path d="M20 12H5.5M11.5 5 4.5 12l7 7" />
              </svg>
              BACK
            </>
          ) : (
            (franchise?.exitLabel ?? t('game.home'))
          )}
        </button>
        {isOnline ? (
          <span className="billion-draft-meta billion-draft-meta--h2h-spacer" aria-hidden="true" />
        ) : isH2H && h2hOpponent ? (
          <div className="billion-h2h-bar" aria-label="Matchup">
            <span className="billion-h2h-bar__you">YOU</span>
            <em>VS</em>
            <span className="billion-h2h-bar__opp">OPPONENT</span>
          </div>
        ) : (
          <span
            className={`billion-draft-meta${
              openSlots < 5 ? ' is-progress' : ''
            }${openSlots === 0 ? ' is-complete' : ''}`}
          >
            {openSlots === 0 ? '5/5' : `${5 - openSlots}/5`}
          </span>
        )}
      </header>

      {showReveal && isH2H && h2hOpponent ? (
        <HeadToHeadShowdown
          playerName={playerHandle}
          playerValue={playerTeamValue}
          opponent={h2hOpponent}
          reduceMotion={reduceMotion}
          onFindNewOpponent={onPlayAgain ?? onExit}
          onExit={onExit}
        />
      ) : null}

      {arenaBlackout && !showReveal && typeof document !== 'undefined'
        ? createPortal(<div className="cr-blackout" aria-hidden />, document.body)
        : null}

      {showReveal && isClassicRun ? (
        <ClassicRunResults
          roster={LINEUP_POSITIONS.flatMap((pos) => {
            const player = slots[pos];
            return player ? [{ ...player, seatedSlot: pos }] : [];
          })}
          reduceMotion={reduceMotion}
          onTotalSettled={handleTotalSettled}
          onComplete={handleRevealComplete}
          onPlayAgain={requestPlayAgain}
          onSkipTrivia={skipTriviaAndReplay}
          onExit={onExit}
        />
      ) : showReveal && !isH2H && !(isSynced && deferOnlineReveal) ? (
        <ClassicRosterReveal
          roster={LINEUP_POSITIONS.flatMap((pos) => {
            const player = slots[pos];
            return player ? [{ ...player, seatedSlot: pos }] : [];
          })}
          reduceMotion={reduceMotion}
          skipAnalyze={revealSkipAnalyze}
          fromCourtBeam={revealSkipAnalyze}
          onComplete={handleRevealComplete}
          onTotalSettled={handleTotalSettled}
          onPlayAgain={requestPlayAgain}
        />
      ) : null}

      <ClassicTriviaSheet open={triviaOpen} runRef={triviaRunRef} onDone={finishTrivia} />

      {showDraft ? (
        <div
          className={`billion-draft-layout billion-draft-layout--no-value billion-draft-layout--vertical-booth${
            useClassicDraftChrome && showHubCourt
              ? ' billion-draft-layout--classic-hub'
              : ''
          }`}
        >
          <main className="billion-main billion-main--draft">
            {isOnline ? (
              <div
                className="billion-h2h-bar billion-h2h-bar--online billion-h2h-bar--draft"
                aria-label="Match progress"
              >
                <span className="billion-h2h-bar__you">YOU {filledCount}/5</span>
                <em>VS</em>
                <span className="billion-h2h-bar__opp">
                  {oppLabel} {oppProgress}/5
                </span>
              </div>
            ) : null}
            {lineupLocked && isFranchise ? (
              <div className="billion-booth-stage billion-booth-stage--review">{franchise!.review}</div>
            ) : lineupLocked ? (
              <div className="h2h-rearrange-stage">
                <p className="h2h-rearrange-stage__title">Lineup locked</p>
                <p className="h2h-rearrange-stage__hint" role="status">
                  Waiting for opponent ({oppProgress}/5)…
                </p>
              </div>
            ) : useClassicDraftChrome || !readyToDraft ? (
              <div
                className={`billion-booth-stage${ticketPrinting ? ' is-printing' : ''}`}
              >
                <BallionTicketMachine
                  key={boothKey}
                  locked={lockedPair}
                  printing={ticketPrinting}
                  canRerollTeam={false}
                  canRerollEra={false}
                  reduceMotion={reduceMotion}
                  selectedPlayerName={null}
                  autoReroll={boothReroll}
                  rerollFrom={rerollFrom}
                  rerollTarget={rerollTarget}
                  holdTeam={spunTeam ?? rerollFrom?.team ?? null}
                  holdEra={spunEra ?? rerollFrom?.era ?? null}
                  showGoal={isClassicRun}
                  goalCopy={
                    isOnline
                      ? t('game.h2hGoal', { name: oppLabel })
                      : isFranchise
                        ? franchise!.goal
                        : null
                  }
                  rollLocked={filledCount >= 5 || courtAnalyze || readyToDraft}
                  resolveRoll={franchise?.resolveRoll}
                  onAutoRerollConsumed={clearBoothReroll}
                  onPrint={handleTicketPrint}
                  onResult={handleTicketResult}
                  onReroll={handleTicketReroll}
                  variant={arenaDraft ? 'arena' : 'board'}
                />
                {circuit ? (
                  <CircuitRunCard name={circuit.name} rerollsAllowed={circuit.rerollsAllowed} />
                ) : isClassicRun && !arenaDraft ? (
                  <RunBonusCard bonus={runBonus} seated={seatedValues} reduceMotion={reduceMotion} />
                ) : null}
              </div>
            ) : spunTeam && spunEra ? (
              <div className="billion-pick-stage">
                {isClassicRun ? (
                  <ClassicPerksBar
                    activationsUsed={perkUses}
                    active={{
                      xray: xrayActive,
                      double_draft: doubleDraftLeft > 0,
                      player_swap: swapMode,
                    }}
                    disabled={pickInteractionLocked || Boolean(slamPayload)}
                    onActivate={handleActivatePerk}
                  />
                ) : null}
                <FranchisePickScreen
                  team={spunTeam}
                  era={spunEra}
                  offers={availableOffers}
                  openPositions={openPositions}
                  selectedId={selectedOfferId}
                  canRerollTeam={canRerollTeam && !evalStartedRef.current}
                  canRerollEra={canRerollEra && !evalStartedRef.current}
                  teamRerollLabel={
                    freeTeamLeft ? `${rerollsRemaining} left · free` : `${rerollsRemaining} left · ${COINS_REROLL_COST}`
                  }
                  eraRerollLabel={
                    freeEraLeft ? `${rerollsRemaining} left · free` : `${rerollsRemaining} left · ${COINS_REROLL_COST}`
                  }
                  showValues={xrayActive}
                  rerollsOff={!rerollsAllowed}
                  interactionLocked={pickInteractionLocked || Boolean(slamPayload)}
                  rerolling={headerReroll}
                  rerollTarget={rerollTarget}
                  reduceMotion={reduceMotion}
                  hint={pickHint}
                  onSelect={handleSelectOffer}
                  onReroll={handleTicketReroll}
                  onRerollSettled={handleHeaderRerollSettled}
                />
              </div>
            ) : null}
          </main>

          {showHubCourt ? (
            EXPERIMENTAL_DRAFT_HUB_CARDS ? (
              <DraftHubCards
                slots={slots}
                justFilledSlot={justFilledSlot}
                movingSlot={movingFrom}
                impactSlot={courtImpactSlot}
                impactColor={courtImpactColor}
                concealSlot={concealSlot}
                analyzing={courtAnalyze}
                reduceMotion={reduceMotion}
                onAnalyzeComplete={handleCourtAnalyzeComplete}
                onSlotPress={!courtAnalyze ? handleSlotClick : undefined}
                targetSlots={courtTargets}
                primarySlot={placingPlayer?.primaryPosition ?? null}
                targetColor={placingPlayer ? teamGlowColor(placingPlayer.teamId) : null}
                targetPrimary={placingPlayer ? getTeamColors(placingPlayer.teamId).primary : null}
                variant={arenaDraft ? 'arena' : 'court'}
              />
            ) : (
              <aside className="classic-lineup-board" aria-label="Your five">
                {LINEUP_POSITIONS.map((slot) => {
                  const player = slots[slot];
                  const colors = player
                    ? getTeamColors(player.teamId)
                    : null;
                  const ink = colors
                    ? contrastOnPrimary(colors.primary)
                    : undefined;
                  return (
                    <div
                      key={slot}
                      className={`classic-lineup-row${player ? ' is-filled' : ''}${
                        justFilledSlot === slot ? ' is-just-filled is-seating-in' : ''
                      }`}
                      style={
                        player && colors
                          ? {
                              backgroundColor: colors.primary,
                              color: ink,
                              borderColor: colors.primary,
                            }
                          : undefined
                      }
                      aria-label={
                        player
                          ? `${POSITION_LABELS[slot]}: ${player.name}`
                          : `Empty ${POSITION_LABELS[slot]}`
                      }
                    >
                      <span className="classic-lineup-row__pos">{slot}</span>
                      <span className="classic-lineup-row__rule" aria-hidden />
                      <span className="classic-lineup-row__name">
                        {player ? player.name : '—'}
                      </span>
                    </div>
                  );
                })}
              </aside>
            )
          ) : readyToDraft && !lineupLocked ? (
            <aside
              className={`billion-court is-docked is-slots-only${
                selectedOffer || movingFrom ? ' is-assigning' : ''
              }`}
              aria-label="Your five"
            >
              <div
                className="billion-court-dock"
                aria-label="Your five dock"
                style={
                  (selectedOffer?.teamId ?? movingPlayer?.teamId)
                    ? ({
                        '--dock-team': getTeamColors(
                          (selectedOffer?.teamId ?? movingPlayer?.teamId) as string,
                        ).primary,
                        '--dock-ring': teamRingColor((selectedOffer?.teamId ?? movingPlayer?.teamId) as string),
                      } as CSSProperties)
                    : undefined
                }
              >
                {LINEUP_POSITIONS.map((slot) => {
                  const player = slots[slot];
                  const offerCanDrop =
                    Boolean(selectedOffer) &&
                    !player &&
                    !evalStartedRef.current &&
                    !slamPayload &&
                    playerFitsSlot(selectedOffer!, slot);
                  const moveCanDrop =
                    Boolean(movingPlayer && movingFrom) &&
                    !player &&
                    !evalStartedRef.current &&
                    !slamPayload &&
                    canMoveToSlot(movingPlayer!, movingFrom!, slot);
                  const canDrop = offerCanDrop || moveCanDrop;
                  const isPrimary =
                    canDrop && slot === (selectedOffer ?? movingPlayer)?.primaryPosition;
                  const choosing = Boolean(selectedOffer || (movingPlayer && movingFrom));
                  const isUnavailable = choosing && !player && !canDrop;
                  const isMovingSource = movingFrom === slot;
                  const isSlamTarget = slamSlot === slot && !player;
                  const isJustFilled = justFilledSlot === slot && Boolean(player);
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-draft-slot={slot}
                      className={`billion-court-dock__item${
                        player ? ' is-filled' : ''
                      }${canDrop ? ' is-target' : ''}${isPrimary ? ' is-primary' : ''}${
                        isUnavailable ? ' is-unavailable' : ''
                      }${
                        isMovingSource ? ' is-moving' : ''
                      }${isSlamTarget ? ' is-slam-target' : ''}${
                        isJustFilled ? ' is-just-filled' : ''
                      }`}
                      disabled={evalStartedRef.current}
                      onClick={() => handleSlotClick(slot)}
                      aria-label={
                        player
                          ? `${POSITION_LABELS[slot]}: ${player.name}`
                          : `Empty ${POSITION_LABELS[slot]}`
                      }
                    >
                      <span
                        className={`billion-court-dock__circle${
                          player && isMovingSource ? ' is-named' : ''
                        }`}
                        style={
                          player
                            ? {
                                backgroundColor: getTeamColors(player.teamId)
                                  .primary,
                                color: contrastOnPrimary(
                                  getTeamColors(player.teamId).primary,
                                ),
                                borderColor: getTeamColors(player.teamId)
                                  .primary,
                              }
                            : undefined
                        }
                      >
                        {player && isMovingSource ? (
                          <>
                            <span className="draft-hub-court__face draft-hub-court__face--front">
                              {playerInitials(player.name)}
                            </span>
                            <span className="draft-hub-court__face draft-hub-court__face--back">
                              <CircleName
                                pos={slot}
                                first={player.name.trim().split(/\s+/)[0] ?? player.name}
                                last={player.name.trim().split(/\s+/).slice(1).join(' ')}
                              />
                            </span>
                          </>
                        ) : player ? (
                          playerInitials(player.name)
                        ) : (
                          slot
                        )}
                      </span>
                      <span className="billion-court-dock__pos" aria-hidden="true">
                        {slot}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null}
          {useClassicDraftChrome && !lineupLocked ? (
            <DraftSheet
              present={readyToDraft && Boolean(spunTeam && spunEra) && !courtAnalyze && !sheetDismissed}
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              anchorSelectors={['.cj__anchor', '.billion-booth-stage .ter__goal-block', '.billion-h2h-bar--draft', '.billion-top']}
              label="Player selection"
              cue={
                isClassicRun ? (
                  <>
                    <svg className="draft-sheet__cue-icon" viewBox="0 0 24 24" aria-hidden>
                      <path d="M6 9.5l6 6 6-6" />
                    </svg>
                    Drag down to see your court
                  </>
                ) : undefined
              }
              peek={
                isClassicRun ? (
                  <span className={`draft-sheet-peek draft-sheet-peek--arena${selectedOffer ? ' has-pick' : ''}`}>
                    {selectedOffer ? (
                      <span
                        className="draft-sheet-peek__chip"
                        style={{
                          background: getTeamColors(selectedOffer.teamId).primary,
                          color: contrastOnPrimary(getTeamColors(selectedOffer.teamId).primary),
                        }}
                      >
                        {playerInitials(selectedOffer.name)}
                      </span>
                    ) : null}
                    <span className="draft-sheet-peek__copy">
                      <strong>{selectedOffer ? selectedOffer.name : 'Pick a player'}</strong>
                      <em>
                        {selectedOffer
                          ? `Tap a glowing ${formatEligiblePositions(selectedOffer)} jersey`
                          : 'Tap here or swipe up for the list'}
                      </em>
                    </span>
                    <span className="draft-sheet-peek__open" aria-hidden>
                      <svg viewBox="0 0 24 24">
                        <path d="M6 14.5l6-6 6 6" />
                      </svg>
                      LIST
                    </span>
                  </span>
                ) : selectedOffer ? (
                  <span className="draft-sheet-peek">
                    <span
                      className="draft-sheet-peek__chip"
                      style={{
                        background: getTeamColors(selectedOffer.teamId).primary,
                        color: contrastOnPrimary(getTeamColors(selectedOffer.teamId).primary),
                      }}
                    >
                      {playerInitials(selectedOffer.name)}
                    </span>
                    <span className="draft-sheet-peek__copy">
                      <strong>{selectedOffer.name}</strong>
                      <em>Tap a glowing {formatEligiblePositions(selectedOffer)} jersey</em>
                    </span>
                  </span>
                ) : spunTeam && spunEra ? (
                  <span className="draft-sheet-peek">
                    <span className="draft-sheet-peek__copy">
                      <strong>
                        {spunTeam.name} · {eraShortLabel(spunEra)}
                      </strong>
                      <em>Swipe up to pick a player</em>
                    </span>
                  </span>
                ) : null
              }
            >
              {spunTeam && spunEra && isClassicRun ? (
                <div className="billion-pick-stage">
                  <ArenaPicker
                    team={spunTeam}
                    boardKey={`${spunTeam.id}:${spunEra}`}
                    offers={availableOffers}
                    openPositions={openPositions}
                    selectedId={selectedOfferId}
                    canRerollTeam={canRerollTeam && !evalStartedRef.current}
                    canRerollEra={canRerollEra && !evalStartedRef.current}
                    teamRerollLabel={
                      freeTeamLeft
                        ? `${rerollsRemaining} left · free`
                        : `${rerollsRemaining} left · ${COINS_REROLL_COST}`
                    }
                    eraRerollLabel={
                      freeEraLeft
                        ? `${rerollsRemaining} left · free`
                        : `${rerollsRemaining} left · ${COINS_REROLL_COST}`
                    }
                    showValues={xrayActive}
                    rerollsOff={!rerollsAllowed}
                    interactionLocked={pickInteractionLocked || Boolean(slamPayload)}
                    hint={pickHint}
                    belowRerolls={
                      <ClassicPerksBar
                        activationsUsed={perkUses}
                        active={{
                          xray: xrayActive,
                          double_draft: doubleDraftLeft > 0,
                          player_swap: swapMode,
                        }}
                        disabled={pickInteractionLocked || Boolean(slamPayload)}
                        onActivate={handleActivatePerk}
                      />
                    }
                    onSelect={handleSelectOffer}
                    onReroll={handleTicketReroll}
                  />
                </div>
              ) : spunTeam && spunEra ? (
                <div className="billion-pick-stage">
                  <FranchisePickScreen
                    team={spunTeam}
                    era={spunEra}
                    offers={availableOffers}
                    openPositions={openPositions}
                    selectedId={selectedOfferId}
                    canRerollTeam={canRerollTeam && !evalStartedRef.current}
                    canRerollEra={canRerollEra && !evalStartedRef.current}
                    teamRerollLabel={
                      freeTeamLeft
                        ? `${rerollsRemaining} left · free`
                        : `${rerollsRemaining} left · ${COINS_REROLL_COST}`
                    }
                    eraRerollLabel={
                      freeEraLeft
                        ? `${rerollsRemaining} left · free`
                        : `${rerollsRemaining} left · ${COINS_REROLL_COST}`
                    }
                    showValues={xrayActive}
                    rerollsOff={!rerollsAllowed}
                    interactionLocked={pickInteractionLocked || Boolean(slamPayload)}
                    rerolling={headerReroll}
                    rerollTarget={rerollTarget}
                    reduceMotion={reduceMotion}
                    skipArrival
                    hint={pickHint}
                    onSelect={handleSelectOffer}
                    onReroll={handleTicketReroll}
                    onRerollSettled={handleHeaderRerollSettled}
                  />
                </div>
              ) : null}
            </DraftSheet>
          ) : null}
        </div>
      ) : null}
      {onlineDraftError ? (
        <p className="h2h-match-banner-error" role="alert">
          {onlineDraftError}
        </p>
      ) : null}
      <DraftPlayerSlamFly
        payload={slamPayload}
        onImpact={handleSlamImpact}
        onComplete={handleSlamComplete}
      />
      <ConfirmSpendSheet
        open={spendConfirm != null}
        title={spendConfirm?.title ?? ''}
        copy={spendConfirm?.copy ?? ''}
        confirmLabel={spendConfirm?.kind === 'perk' ? 'Use' : 'Spend'}
        onCancel={() => setSpendConfirm(null)}
        onConfirm={() => {
          const pending = spendConfirm;
          setSpendConfirm(null);
          if (!pending) return;
          if (pending.kind === 'perk' && pending.perkId) applyPerk(pending.perkId);
          if (pending.kind === 'reroll' && pending.rerollKind) executeTicketReroll(pending.rerollKind);
        }}
      />
    </div>
  );
}
