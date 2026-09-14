'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BILLION_GOAL,
  buildEraRoster,
  formatDollarsExact,
  getDollarValue,
  getDollarValueForSlot,
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
  getAchievementSummary,
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
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { hapticSelection, hapticSlam, hapticSlotConfirm, hapticTap } from '@/lib/tradeup/haptics';
import { schedulePlayerSlotSound } from '@/lib/tradeup/h2hEmojiSound';
import { measureDraftSlam } from '@/lib/tradeup/draftSlamRects';
import { preloadGameAudio } from '@/lib/tradeup/gameAudio';
import { useSound } from '@/hooks/useSound';
import { useLocale } from '@/hooks/useLocale';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { GameBackground } from './game/GameBackground';
import { formatMillionLabel, ValueFlipCard } from './ValueFlipCard';
import { BallionTicketMachine } from './BallionTicketMachine';
import { DraftPlayerSlamFly, type DraftSlamPayload } from './DraftPlayerSlamFly';
import { FranchisePickScreen } from './FranchisePickScreen';
import { ClassicRosterReveal } from './ClassicRosterReveal';
import { ChallengeCompleteToast } from './ChallengeCompleteToast';
import { HeadToHeadShowdown } from './HeadToHeadShowdown';
import type { TicketRerollKind } from './BallionTicketMachine';
import type { H2HOpponent } from '@/lib/tradeup/h2hOpponents';
import { serializeMatchLineup } from '@/lib/multiplayer/match';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';
import {
  playerToH2HPick,
  syncedPicksToSlots,
  type SyncedH2HPick,
} from '@/lib/tradeup/h2hDraftBridge';

interface BillionTradeEngineProps {
  onExit: () => void;
  onPlayAgain?: () => void;
  onWin?: () => void;
  /** Default billion run. `h2h` = local AI showdown. `online` = private 1V1. */
  challengeMode?: 'billion' | 'h2h' | 'online';
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
}: BillionTradeEngineProps) {
  const isH2H = challengeMode === 'h2h' && Boolean(h2hOpponent);
  const isOnline = challengeMode === 'online';
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
  const [spunTeam, setSpunTeam] = useState<TeamInfo | null>(null);
  const [spunEra, setSpunEra] = useState<DecadeEra | null>(null);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [offers, setOffers] = useState<EraOfferPlayer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [movingFrom, setMovingFrom] = useState<Position | null>(null);
  const [slamPayload, setSlamPayload] = useState<DraftSlamPayload | null>(null);
  const [slamSlot, setSlamSlot] = useState<Position | null>(null);
  const [justFilledSlot, setJustFilledSlot] = useState<Position | null>(null);
  const [challengeAlertIds, setChallengeAlertIds] = useState<
    { id: string; completed: number; total: number }[]
  >([]);
  const challengeAlertTimerRef = useRef<number | null>(null);
  const pendingAssignRef = useRef<{
    slot: Position;
    valued: ValuedPlayer & { era?: DecadeEra };
  } | null>(null);
  /** One free team reroll + one free era reroll for the entire run (no ads). */
  const [teamRerolls, setTeamRerolls] = useState(1);
  const [eraRerolls, setEraRerolls] = useState(1);
  const [boothReroll, setBoothReroll] = useState<TicketRerollKind | null>(null);
  const [rerollFrom, setRerollFrom] = useState<SpinPair | null>(null);
  /** UI mirror of interactionLockRef — disables pick/reroll during commit. */
  const [pickInteractionLocked, setPickInteractionLocked] = useState(false);
  const [status, setStatus] = useState<string | null>(
    'Tap ROLL to land a team and era.',
  );
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [worldRank, setWorldRank] = useState(0);
  const evalStartedRef = useRef(false);
  const teamRerollUsedRef = useRef(false);
  const eraRerollUsedRef = useRef(false);
  /** Blocks select/reroll/slot commits until placement finishes or table resets. */
  const interactionLockRef = useRef(false);
  const lockInteractions = useCallback(() => {
    interactionLockRef.current = true;
    setPickInteractionLocked(true);
  }, []);
  const unlockInteractions = useCallback(() => {
    interactionLockRef.current = false;
    setPickInteractionLocked(false);
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
    return () => {
      if (challengeAlertTimerRef.current != null) {
        window.clearTimeout(challengeAlertTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
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
  }, [isOnline, syncedPicks, slamPayload, movingFrom]);

  useEffect(() => {
    resume();
    preloadGameAudio();
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [resume]);
  const filled = useMemo(() => rosterList(slots), [slots]);
  const teamValue = useMemo(() => sumTeamValue(filled), [filled]);
  const filledCount = filled.length;

  useEffect(() => {
    if (!isOnline || !onOnlineProgress) return;
    onOnlineProgress(filledCount);
  }, [filledCount, isOnline, onOnlineProgress]);

  const readyToDraft = Boolean(spunTeam && spunEra) && !ticketPrinting;
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
    resume();
    // Sound/haptic already fired in TicketDispenser on the same tap
    setTicketPrinting(true);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setSpunTeam(null);
    setSpunEra(null);
    setStatus('Rolling…');
  }, [phase, resume]);

  const handleTicketResult = useCallback((pair: SpinPair) => {
    unlockInteractions();
    setSpunTeam(pair.team);
    setSpunEra(pair.era);
    setTicketPrinting(false);
    setRerollFrom(null);
    setStatus(
      `${pair.team.fullName} · ${pair.era} — pick a player, then tap an open circle.`,
    );
  }, [unlockInteractions]);

  const handleTicketReroll = useCallback((kind: TicketRerollKind) => {
    if (phase !== 'draft' || ticketPrinting || evalStartedRef.current) return;
    if (interactionLockRef.current || slamPayload || pendingAssignRef.current) return;
    if (kind === 'team') {
      if (teamRerollUsedRef.current || teamRerolls <= 0) return;
      teamRerollUsedRef.current = true;
      setTeamRerolls(0);
    } else {
      if (eraRerollUsedRef.current || eraRerolls <= 0) return;
      eraRerollUsedRef.current = true;
      setEraRerolls(0);
    }
    if (!spunTeam || !spunEra) return;
    resume();
    lockInteractions();
    setSelectedOfferId(null);
    setMovingFrom(null);
    // Keep the last roster mounted until the next board is ready.
    setRerollFrom({ team: spunTeam, era: spunEra });
    // Clear only the axis being rerolled — the other stays visible/static.
    if (kind === 'team') setSpunTeam(null);
    else setSpunEra(null);
    setTicketPrinting(true);
    setBoothReroll(kind);
    setStatus(kind === 'team' ? 'Rerolling team…' : 'Rerolling era…');
  }, [phase, ticketPrinting, teamRerolls, eraRerolls, resume, spunTeam, spunEra, slamPayload, lockInteractions]);

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
    setSpunTeam(null);
    setSpunEra(null);
    setTicketPrinting(false);
    setOffers([]);
    setSelectedOfferId(null);
    setMovingFrom(null);
    // Rerolls are once per run — do not refresh between tickets.
    setStatus('Tap SPIN for your next team and era.');
  }, [unlockInteractions]);

  const finishPickPlacement = useCallback(
    async (targetSlot: Position, player: ValuedPlayer & { era?: DecadeEra }) => {
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
      }, useClassicDraftChrome ? 1250 : 360);

      if (isOnline && onPickLock) {
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
        if (isOnline && deferOnlineReveal) {
          setStatus('Lineup locked — waiting for opponent…');
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
        // Classic / online 1v1: keep pick UI briefly so the 5th lock can settle, then auto-reveal.
        if (useClassicDraftChrome && !deferOnlineReveal) {
          if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
          resetTimerRef.current = window.setTimeout(() => {
            setSpunTeam(null);
            setSpunEra(null);
            setOffers([]);
            setPhase('reveal');
          }, reduceMotion ? 80 : 480);
          return;
        }
        setSpunTeam(null);
        setSpunEra(null);
        setOffers([]);
        setPhase('reveal');
        return;
      }

      setStatus(`${player.name} locked at ${POSITION_LABELS[targetSlot]}.`);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      // Classic / online: return to hub immediately so the seat-in plays on the roster row.
      const resetMs = useClassicDraftChrome
        ? reduceMotion
          ? 0
          : 40
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
      isH2H,
      isOnline,
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

  const finishRun = useCallback(
    (nextSlots: RosterSlots, value: number) => {
      const lineup = rosterInSlotOrder(nextSlots);
      const { best, isNewBest } = saveBestRosterValue(value);
      setPersonalBest(best);
      setIsNewPersonalBest(isNewBest);

      const rank = getWorldRank(value);
      setWorldRank(rank);
      saveBestWorldRank(rank);

      if (value >= BILLION_GOAL) {
        if (!isH2H && !isOnline) {
          saveBillionRun(lineup, value);
        }
        // Result SFX is owned by the reveal UI (results_celebration).
        onWin?.();
        setStatus(`Dynasty complete · ${formatDollarsExact(value)}`);
      } else {
        setStatus(`Board full at ${formatDollarsExact(value)} — short of $1B.`);
      }

      return { personalBest: best, isNewPersonalBest: isNewBest, worldRank: rank };
    },
    [isH2H, isOnline, onWin],
  );

  const handleTotalSettled = useCallback(
    (payload: { teamValue: number }) => {
      if (isH2H || isOnline) return;
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
      if (unlocked.length > 0) {
        notifyAchievementsUnlocked();
        if (challengeAlertTimerRef.current != null) {
          window.clearTimeout(challengeAlertTimerRef.current);
        }
        // Brief beat after the number lands, then show unlocks one at a time.
        const summary = getAchievementSummary();
        const alreadyShown = summary.completed - unlocked.length;
        challengeAlertTimerRef.current = window.setTimeout(() => {
          challengeAlertTimerRef.current = null;
          setChallengeAlertIds((current) => {
            const seen = new Set(current.map((item) => item.id));
            const next = [...current];
            let step = alreadyShown;
            for (const id of unlocked) {
              if (seen.has(id)) continue;
              seen.add(id);
              step += 1;
              next.push({
                id,
                completed: step,
                total: summary.total,
              });
            }
            return next.length === current.length ? current : next;
          });
        }, 450);
      }
    },
    [isH2H, isOnline, slots],
  );

  const dismissChallengeAlert = useCallback(() => {
    setChallengeAlertIds((ids) => ids.slice(1));
  }, []);

  const handleRevealComplete = useCallback(
    (payload: { teamValue: number }) => {
      finishRun(slots, payload.teamValue);
      if (isOnline && onOnlineComplete) {
        const lineup = serializeMatchLineup(rosterInSlotOrder(slots));
        onOnlineComplete({
          lineup,
          totalValue: Math.round(payload.teamValue),
        });
      }
    },
    [finishRun, isOnline, onOnlineComplete, slots],
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
      setMovingFrom(null);
      setSelectedOfferId((id) => (id === player.id ? null : player.id));
      const alts = formatEligiblePositions(player);
      setStatus(`Selected ${player.name} (${alts}) — tap an open matching circle below.`);
    },
    [phase, readyToDraft, resume, slamPayload, ticketPrinting],
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
          playReject();
          setStatus('That slot is locked — you cannot replace a placed player.');
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
        const nextSlots: RosterSlots = {
          ...slots,
          [movingFrom]: null,
          [slot]: movingPlayer,
        };
        setSlots(nextSlots);
        const moveFrom = movingFrom;
        setMovingFrom(null);
        hapticSlotConfirm();
        if (isOnline && onPickMove && syncedSlotSetRef.current.has(moveFrom)) {
          const era = (spunEra ?? '2020s') as DecadeEra;
          const { selection, rawValue } = playerToH2HPick(
            movingPlayer,
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
          if (!hasOpenAlt) {
            playReject();
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

      // Classic + online 1v1: skip circle slam / grow — seat gently on the hub roster row.
      if (useClassicDraftChrome) {
        hapticSlam();
        schedulePlayerSlotSound(0);
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
      schedulePlayerSlotSound(400);
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
      unlockInteractions,
      useClassicDraftChrome,
      isH2H,
      isOnline,
    ],
  );

  const handleSlamImpact = useCallback(() => {
    const pending = pendingAssignRef.current;
    if (!pending) return;
    pendingAssignRef.current = null;
    void finishPickPlacement(pending.slot, pending.valued);
  }, [finishPickPlacement]);

  const handleSlamComplete = useCallback(() => {
    setSlamPayload(null);
    setSlamSlot(null);
  }, []);

  const showDraft = phase === 'draft';
  const showReveal = phase === 'reveal';
  const lineupLocked = isOnline && deferOnlineReveal && filledCount >= 5;
  const keepSeatedDock = filledCount > 0 || Boolean(rerollFrom);
  const showSeatedDock =
    !lineupLocked && (readyToDraft || (ticketPrinting && keepSeatedDock));
  const playerTeamValue = teamValue;

  return (
    <div
      className={`tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820 billion-shell--neo${
        showDraft ? ' billion-shell--picking' : ''
      }${showReveal ? ' billion-shell--vault' : ''}${
        isH2H || isOnline ? ' billion-shell--h2h' : ''
      }`}
    >
      <GameBackground />

      {challengeAlertIds[0] ? (
        <ChallengeCompleteToast
          key={challengeAlertIds[0].id}
          challengeId={challengeAlertIds[0].id}
          completed={challengeAlertIds[0].completed}
          total={challengeAlertIds[0].total}
          onDismiss={dismissChallengeAlert}
        />
      ) : null}

      <header className={`billion-top billion-top--spin${isH2H || isOnline ? ' billion-top--h2h' : ''}`}>
        <button
          type="button"
          className="tu-back"
          onClick={() => {
            resume();
            playUiBack();
            onExit();
          }}
        >
          {t('game.home')}
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

      {showReveal && !isH2H && !(isOnline && deferOnlineReveal) ? (
        <ClassicRosterReveal
          roster={LINEUP_POSITIONS.flatMap((pos) => {
            const player = slots[pos];
            return player ? [{ ...player, seatedSlot: pos }] : [];
          })}
          reduceMotion={reduceMotion}
          onComplete={handleRevealComplete}
          onTotalSettled={handleTotalSettled}
          onPlayAgain={onPlayAgain ?? onExit}
        />
      ) : null}

      {showDraft ? (
        <div
          className={`billion-draft-layout billion-draft-layout--no-value billion-draft-layout--vertical-booth${
            useClassicDraftChrome && !showSeatedDock && !lineupLocked
              ? ' billion-draft-layout--classic-hub'
              : ''
          }${
            useClassicDraftChrome && showSeatedDock && !lineupLocked
              ? ' billion-draft-layout--classic-pick'
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
            {lineupLocked ? (
              <div className="h2h-rearrange-stage">
                <p className="h2h-rearrange-stage__title">Lineup locked</p>
                <p className="h2h-rearrange-stage__hint" role="status">
                  Waiting for opponent ({oppProgress}/5)…
                </p>
              </div>
            ) : rerollFrom && ticketPrinting && rerollFrom.team && rerollFrom.era ? (
              <div className="billion-pick-stage is-holding-board">
                <div className="billion-reroll-sheet">
                  <BallionTicketMachine
                    locked={lockedPair}
                    printing={ticketPrinting}
                    canRerollTeam={false}
                    canRerollEra={false}
                    reduceMotion={reduceMotion}
                    selectedPlayerName={null}
                    autoReroll={boothReroll}
                    rerollFrom={rerollFrom}
                    holdTeam={spunTeam ?? rerollFrom.team}
                    holdEra={spunEra ?? rerollFrom.era}
                    showGoal={false}
                    goalCopy={null}
                    onAutoRerollConsumed={() => setBoothReroll(null)}
                    onPrint={handleTicketPrint}
                    onResult={handleTicketResult}
                    onReroll={handleTicketReroll}
                  />
                </div>
                <FranchisePickScreen
                  team={rerollFrom.team}
                  era={rerollFrom.era}
                  offers={availableOffers}
                  openPositions={openPositions}
                  selectedId={null}
                  canRerollTeam={false}
                  canRerollEra={false}
                  interactionLocked
                  hint="Spinning…"
                  onSelect={() => {}}
                  onReroll={handleTicketReroll}
                />
              </div>
            ) : !readyToDraft ? (
              <div
                className={`billion-booth-stage${ticketPrinting ? ' is-printing' : ''}`}
              >
                <BallionTicketMachine
                  locked={lockedPair}
                  printing={ticketPrinting}
                  canRerollTeam={false}
                  canRerollEra={false}
                  reduceMotion={reduceMotion}
                  selectedPlayerName={null}
                  autoReroll={boothReroll}
                  rerollFrom={rerollFrom}
                  holdTeam={spunTeam ?? rerollFrom?.team ?? null}
                  holdEra={spunEra ?? rerollFrom?.era ?? null}
                  showGoal={useClassicDraftChrome && !isOnline}
                  goalCopy={
                    isOnline
                      ? t('game.h2hGoal', { name: oppLabel })
                      : null
                  }
                  onAutoRerollConsumed={() => setBoothReroll(null)}
                  onPrint={handleTicketPrint}
                  onResult={handleTicketResult}
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
                  canRerollTeam={teamRerolls > 0 && !evalStartedRef.current}
                  canRerollEra={eraRerolls > 0 && !evalStartedRef.current}
                  interactionLocked={pickInteractionLocked || Boolean(slamPayload)}
                  hint={
                    selectedOffer
                      ? `Tap an open ${formatEligiblePositions(selectedOffer)} circle below.`
                      : movingPlayer
                        ? `Moving ${movingPlayer.name} — tap an open eligible circle.`
                        : 'Pick a player, then tap an open circle below.'
                  }
                  onSelect={handleSelectOffer}
                  onReroll={handleTicketReroll}
                />
              </div>
            ) : null}
          </main>

          {!showSeatedDock && !lineupLocked && !readyToDraft ? (
            <aside className="classic-lineup-board" aria-label="Your five">
              {LINEUP_POSITIONS.map((slot) => {
                const player = slots[slot];
                const colors = player
                  ? getTeamColors(player.teamId)
                  : null;
                const ink = colors
                  ? contrastOnPrimary(colors.primary)
                  : undefined;
                  const rowClass = `classic-lineup-row${player ? ' is-filled' : ''}${
                    justFilledSlot === slot ? ' is-just-filled is-seating-in' : ''
                  }`;
                  const rowStyle =
                    player && colors
                      ? {
                          backgroundColor: colors.primary,
                          color: ink,
                          borderColor: colors.primary,
                        }
                      : undefined;
                  const front = (
                    <>
                      <span className="classic-lineup-row__pos">{slot}</span>
                      <span className="classic-lineup-row__rule" aria-hidden />
                      <span className="classic-lineup-row__name">
                        {player ? player.name : '—'}
                      </span>
                    </>
                  );
                  if (!player) {
                    return (
                      <div
                        key={slot}
                        className={rowClass}
                        aria-label={`Empty ${POSITION_LABELS[slot]}`}
                      >
                        {front}
                      </div>
                    );
                  }
                  return (
                    <ValueFlipCard
                      key={slot}
                      className={rowClass}
                      style={rowStyle}
                      ariaLabel={`${POSITION_LABELS[slot]}: ${player.name}`}
                      valueLabel={formatMillionLabel(getDollarValue(player))}
                      front={front}
                    />
                  );
              })}
            </aside>
          ) : showSeatedDock ? (
            <aside
              className={`billion-court is-docked is-slots-only${
                selectedOffer || movingFrom ? ' is-assigning' : ''
              }`}
              aria-label="Your five"
            >
              <div className="billion-court-dock" aria-label="Your five dock">
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
                      }${canDrop ? ' is-target' : ''}${
                        isMovingSource ? ' is-moving' : ''
                      }${isSlamTarget ? ' is-slam-target' : ''}${
                        isJustFilled ? ' is-just-filled' : ''
                      }`}
                      disabled={evalStartedRef.current}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handleSlotClick(slot);
                      }}
                      aria-label={
                        player
                          ? `${POSITION_LABELS[slot]}: ${player.name}`
                          : `Empty ${POSITION_LABELS[slot]}`
                      }
                    >
                      <span
                        className="billion-court-dock__circle"
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
                        {player ? playerInitials(player.name) : '·'}
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
    </div>
  );
}
