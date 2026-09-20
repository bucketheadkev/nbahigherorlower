'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildEraRoster,
  getDollarValueForSlot,
  type DecadeEra,
  type EraOfferPlayer,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import {
  formatEligiblePositions,
  playerFitsSlot,
  canMoveToSlot,
  getEligiblePositions,
} from '@/lib/tradeup/alternatePositions';
import { TEAMS } from '@/lib/tradeup/teams';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { useSound } from '@/hooks/useSound';
import { hapticSlam, hapticTap, hapticSlotConfirm } from '@/lib/tradeup/haptics';
import { schedulePlayerSlotSound } from '@/lib/tradeup/h2hEmojiSound';
import { measureDraftSlam } from '@/lib/tradeup/draftSlamRects';
import type { TeamInfo } from '@/lib/tradeup/types';
import type { Position } from '@/lib/tradeup/types';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { startWheelSpinSound, stopWheelSpinSound, WHEEL_SPIN_DURATION_MS } from '@/lib/tradeup/gameAudio';
import { BallionTicketMachine, type TicketRerollKind } from '../BallionTicketMachine';
import { DraftPlayerSlamFly, type DraftSlamPayload } from '../DraftPlayerSlamFly';
import { FranchisePickScreen } from '../FranchisePickScreen';
import { GameBackground } from '../game/GameBackground';

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function sortOffersBestFirst(players: EraOfferPlayer[]): EraOfferPlayer[] {
  return [...players].sort(
    (a, b) => b.dollarValue - a.dollarValue || a.id.localeCompare(b.id),
  );
}

function picksToSlots(
  picks: Array<{ position: H2HPosition; selection: H2HPickSelection }>,
): Partial<Record<H2HPosition, H2HPickSelection>> {
  const map: Partial<Record<H2HPosition, H2HPickSelection>> = {};
  for (const pick of picks) {
    map[pick.position] = pick.selection;
  }
  return map;
}

function pickAsPlayer(pick: H2HPickSelection) {
  const primary = (pick.primarySlot ?? pick.position) as Position;
  return {
    id: pick.playerId,
    name: pick.name,
    teamId: pick.teamId,
    primaryPosition: primary,
    position: primary,
    dollarValue: pick.baseDollarValue ?? pick.dollarValue,
  } as EraOfferPlayer;
}

function valueForSlot(pick: H2HPickSelection, slot: H2HPosition): number {
  return Math.round(getDollarValueForSlot(pickAsPlayer(pick), slot));
}

interface H2HPositionPickerProps {
  myPicks: Array<{ position: H2HPosition; selection: H2HPickSelection; raw_value: number }>;
  opponentPickCount: number;
  /** All five slots filled — rearrange only, no new picks. */
  lineupLocked?: boolean;
  busy?: boolean;
  error?: string | null;
  onLock: (position: H2HPosition, selection: H2HPickSelection, rawValue: number) => Promise<void>;
  onMove: (
    from: H2HPosition,
    to: H2HPosition,
    selection: H2HPickSelection,
    rawValue: number,
  ) => Promise<void>;
  onExit: () => void;
}

/** Solo-style H2H draft — spin, pick any player, assign via bottom circles. */
export function H2HPositionPicker({
  myPicks,
  opponentPickCount,
  lineupLocked = false,
  busy = false,
  error = null,
  onLock,
  onMove,
  onExit,
}: H2HPositionPickerProps) {
  const reduceMotion = getPrefersReducedMotion();
  const { resume, playReject } = useSound();
  const [spunTeam, setSpunTeam] = useState<TeamInfo | null>(null);
  const [spunEra, setSpunEra] = useState<DecadeEra | null>(null);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [offers, setOffers] = useState<EraOfferPlayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teamRerolls, setTeamRerolls] = useState(1);
  const [eraRerolls, setEraRerolls] = useState(1);
  const [boothReroll, setBoothReroll] = useState<TicketRerollKind | null>(null);
  const [rerollFrom, setRerollFrom] = useState<SpinPair | null>(null);
  const [status, setStatus] = useState('Tap ROLL for team and era.');
  const [localError, setLocalError] = useState<string | null>(null);
  const [lockingSlot, setLockingSlot] = useState<H2HPosition | null>(null);
  const [slamPayload, setSlamPayload] = useState<DraftSlamPayload | null>(null);
  const [slamSlot, setSlamSlot] = useState<H2HPosition | null>(null);
  const [justFilledSlot, setJustFilledSlot] = useState<H2HPosition | null>(null);
  const [movingFrom, setMovingFrom] = useState<H2HPosition | null>(null);
  /** Sync move source immediately — React state can lag one frame behind taps. */
  const movingFromRef = useRef<H2HPosition | null>(null);
  const [localSlots, setLocalSlots] = useState<Partial<Record<H2HPosition, H2HPickSelection>>>(
    () => picksToSlots(myPicks),
  );
  const localSlotsRef = useRef(localSlots);
  localSlotsRef.current = localSlots;
  const moveInFlightRef = useRef(false);
  /** Blocks myPicks sync until server reflects a completed move. */
  const pendingMoveRef = useRef<{ from: H2HPosition; to: H2HPosition } | null>(null);
  const lockingSlotRef = useRef<H2HPosition | null>(null);
  lockingSlotRef.current = lockingSlot;
  const slamPayloadRef = useRef(slamPayload);
  slamPayloadRef.current = slamPayload;
  const pendingPickRef = useRef<{
    slot: H2HPosition;
    selection: H2HPickSelection;
    raw: number;
  } | null>(null);
  const lockQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSlotTapRef = useRef<{ slot: H2HPosition; at: number } | null>(null);

  const clearMoveMode = useCallback(() => {
    movingFromRef.current = null;
    setMovingFrom(null);
  }, []);

  const startMoveMode = useCallback((slot: H2HPosition) => {
    movingFromRef.current = slot;
    setMovingFrom(slot);
  }, []);

  useEffect(() => {
    return () => {
      stopWheelSpinSound();
    };
  }, []);

  useEffect(() => {
    const pending = pendingMoveRef.current;
    if (pending) {
      const atDest = myPicks.some((pick) => pick.position === pending.to);
      const atSource = myPicks.some((pick) => pick.position === pending.from);
      if (atDest && !atSource) {
        pendingMoveRef.current = null;
        moveInFlightRef.current = false;
        setLocalSlots(picksToSlots(myPicks));
        return;
      }
      // Keep optimistic layout until the server reflects the move.
      return;
    }

    if (
      lockingSlotRef.current ||
      movingFromRef.current ||
      slamPayloadRef.current
    ) {
      return;
    }
    setLocalSlots(picksToSlots(myPicks));
  }, [myPicks]);

  const rosteredNames = useMemo(
    () =>
      new Set(
        LINEUP_POSITIONS.map((pos) => localSlots[pos]?.name)
          .filter(Boolean)
          .map((n) => normalizeName(n!)),
      ),
    [localSlots],
  );

  const openPositions = useMemo(
    () => LINEUP_POSITIONS.filter((pos) => !localSlots[pos]) as H2HPosition[],
    [localSlots],
  );

  const readyToDraft = Boolean(spunTeam && spunEra) && !ticketPrinting;
  const lockedPair: SpinPair | null =
    spunTeam && spunEra ? { team: spunTeam, era: spunEra } : null;
  const selected = offers.find((p) => p.id === selectedId) ?? null;
  const movingPlayer = movingFrom ? localSlots[movingFrom] ?? null : null;
  const picksFilled = LINEUP_POSITIONS.filter((pos) => localSlots[pos]).length;

  // Build the board once per spin — never rebuild on slot/filter changes (avoids shuffle jitter).
  useEffect(() => {
    if (!spunTeam || !spunEra || ticketPrinting) return;
    let cancelled = false;
    const team = spunTeam;
    const era = spunEra;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      const next = sortOffersBestFirst(buildEraRoster(team, era));
      setOffers(next);
      setStatus(`${team.fullName} · ${era} — pick a player, tap an open circle.`);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [spunEra, spunTeam, ticketPrinting]);

  const resetTableForNextPick = useCallback(() => {
    clearMoveMode();
    setSpunTeam(null);
    setSpunEra(null);
    setTicketPrinting(false);
    setOffers([]);
    setSelectedId(null);
    setStatus('Tap ROLL for your next team and era.');
  }, [clearMoveMode]);

  const handlePrint = useCallback(() => {
    if (lockingSlot) return;
    clearMoveMode();
    resume();
    setTicketPrinting(true);
    setSelectedId(null);
    setOffers([]);
    setSpunTeam(null);
    setSpunEra(null);
    setStatus('Rolling…');
  }, [clearMoveMode, lockingSlot, resume]);

  const handleResult = useCallback((pair: SpinPair) => {
    setSpunTeam(pair.team);
    setSpunEra(pair.era);
    setTicketPrinting(false);
    setRerollFrom(null);
    setStatus(`${pair.team.fullName} · ${pair.era} — pick a player, tap an open circle.`);
  }, []);

  const handleReroll = useCallback(
    (kind: TicketRerollKind) => {
      if (ticketPrinting || !spunTeam || !spunEra || lockingSlot) return;
      if (kind === 'team' && teamRerolls <= 0) return;
      if (kind === 'era' && eraRerolls <= 0) return;
      resume();
      if (!reduceMotion) startWheelSpinSound(WHEEL_SPIN_DURATION_MS);
      if (kind === 'team') setTeamRerolls(0);
      else setEraRerolls(0);
      setSelectedId(null);
      setOffers([]);
      setRerollFrom({ team: spunTeam, era: spunEra });
      if (kind === 'team') setSpunTeam(null);
      else setSpunEra(null);
      setTicketPrinting(true);
      setBoothReroll(kind);
      setStatus(kind === 'team' ? 'Rerolling team…' : 'Rerolling era…');
    },
    [eraRerolls, lockingSlot, reduceMotion, resume, spunEra, spunTeam, teamRerolls, ticketPrinting],
  );

  const handleSelect = useCallback(
    (player: EraOfferPlayer) => {
      if (!readyToDraft || lockingSlot || slamPayload) return;
      resume();
      hapticTap();
      clearMoveMode();
      setSelectedId((id) => (id === player.id ? null : player.id));
      setLocalError(null);
      setStatus(`Selected ${player.name} (${formatEligiblePositions(player)}) — tap an open circle.`);
    },
    [clearMoveMode, lockingSlot, readyToDraft, resume, slamPayload],
  );

  const persistPick = useCallback(
    (slot: H2HPosition, selection: H2HPickSelection, raw: number) => {
      const run = async () => {
        setLockingSlot(slot);
        setLocalError(null);
        try {
          await onLock(slot, selection, raw);
          resetTableForNextPick();
        } catch (err) {
          setLocalSlots((prev) => {
            const next = { ...prev };
            delete next[slot];
            return next;
          });
          const message =
            err instanceof Error && err.message.trim()
              ? err.message
              : 'Could not save that pick — tap the circle again.';
          setLocalError(message);
          setStatus('Pick failed to sync. Select the player and tap the circle again.');
        } finally {
          setLockingSlot(null);
        }
      };
      lockQueueRef.current = lockQueueRef.current.then(run, run);
      return lockQueueRef.current;
    },
    [onLock, resetTableForNextPick],
  );

  const persistMove = useCallback(
    (
      from: H2HPosition,
      to: H2HPosition,
      selection: H2HPickSelection,
      raw: number,
      revertPick: H2HPickSelection,
    ) => {
      const run = async () => {
        setLockingSlot(to);
        setLocalError(null);
        try {
          await onMove(from, to, selection, raw);
          pendingMoveRef.current = null;
          moveInFlightRef.current = false;
        } catch (err) {
          pendingMoveRef.current = null;
          moveInFlightRef.current = false;
          setLocalSlots((prev) => {
            const next = { ...prev };
            delete next[to];
            next[from] = revertPick;
            return next;
          });
          const message =
            err instanceof MultiplayerApiError
              ? err.message
              : err instanceof Error && err.message.trim()
                ? err.message
                : 'Could not move that player — try again.';
          setLocalError(message);
          setStatus('Move failed to sync. Tap the player and try again.');
        } finally {
          setLockingSlot(null);
        }
      };
      void run();
    },
    [onMove],
  );

  const finalizeMove = useCallback(
    (from: H2HPosition, to: H2HPosition, selection: H2HPickSelection, raw: number) => {
      const revertPick = localSlotsRef.current[from];
      if (!revertPick) {
        clearMoveMode();
        setStatus('Move cancelled — tap the player again.');
        return;
      }
      pendingMoveRef.current = { from, to };
      moveInFlightRef.current = true;
      setLockingSlot(to);
      setLocalSlots((prev) => {
        const next = { ...prev };
        delete next[from];
        next[to] = selection;
        return next;
      });
      clearMoveMode();
      setSelectedId(null);
      hapticSlotConfirm();
      setStatus(`${selection.name} moved to ${POSITION_LABELS[to]}.`);
      void persistMove(from, to, selection, raw, revertPick);
    },
    [persistMove, clearMoveMode],
  );
  const finalizePick = useCallback(
    (slot: H2HPosition, selection: H2HPickSelection, raw: number) => {
      setLocalSlots((prev) => ({ ...prev, [slot]: selection }));
      setJustFilledSlot(slot);
      window.setTimeout(() => {
        setJustFilledSlot((current) => (current === slot ? null : current));
      }, 360);
      void persistPick(slot, selection, raw);
    },
    [persistPick],
  );

  const handleSlamImpact = useCallback(() => {
    const pending = pendingPickRef.current;
    if (!pending) return;
    finalizePick(pending.slot, pending.selection, pending.raw);
    pendingPickRef.current = null;
  }, [finalizePick]);

  const handleSlamComplete = useCallback(() => {
    setSlamPayload(null);
    setSlamSlot(null);
  }, []);

  const handleSlotClick = useCallback(
    (slot: H2HPosition) => {
      if (lockingSlot) return;

      const slots = localSlotsRef.current;
      const occupantEarly = slots[slot];
      if (slamPayload && !movingFromRef.current && !occupantEarly) return;

      const activeMoveFrom = movingFromRef.current;
      const movingPick = activeMoveFrom ? slots[activeMoveFrom] : undefined;
      resume();
      hapticTap();

      const occupant = slots[slot];

      // Complete a move into an empty eligible slot.
      if (activeMoveFrom && movingPick) {
        if (activeMoveFrom === slot) {
          clearMoveMode();
          setStatus('Move cancelled.');
          return;
        }
        if (occupant) {
          playReject();
          setStatus('That slot is taken — tap an open circle.');
          return;
        }
        if (!canMoveToSlot(pickAsPlayer(movingPick), activeMoveFrom, slot)) {
          playReject();
          setStatus(
            `${movingPick.name} can play ${formatEligiblePositions(pickAsPlayer(movingPick))} only.`,
          );
          return;
        }
        const raw = valueForSlot(movingPick, slot);
        const moved: H2HPickSelection = {
          ...movingPick,
          position: slot,
          dollarValue: raw,
        };
        finalizeMove(activeMoveFrom, slot, moved, raw);
        return;
      }

      if (occupant) {
        const alts = getEligiblePositions(pickAsPlayer(occupant));
        const hasOpenAlt = alts.some((pos) => pos !== slot && !slots[pos as H2HPosition]);
        if (!hasOpenAlt) {
          playReject();
          setStatus(
            selected
              ? `${occupant.name} has no open alternate slots — cannot free ${slot}.`
              : alts.length <= 1
                ? `${occupant.name} is locked at ${slot} — no alternate slots open.`
                : `${occupant.name} has no open alternate slots right now.`,
          );
          return;
        }
        setSelectedId(null);
        startMoveMode(slot);
        setStatus(`Moving ${occupant.name} — tap an open ${formatEligiblePositions(pickAsPlayer(occupant))} circle.`);
        return;
      }

      if (activeMoveFrom) {
        clearMoveMode();
        setStatus('Move cancelled — tap the player again.');
        return;
      }

      if (!selected || !spunTeam || !spunEra) {
        if (picksFilled > 0) {
          setLocalError(null);
          setStatus('Tap a placed circle to move that player.');
          return;
        }
        setLocalError('Select a player from the list first.');
        setStatus('Select a player from the list first, then tap a circle.');
        return;
      }

      if (lineupLocked) {
        playReject();
        setStatus('Lineup full — tap a placed circle to move a player.');
        return;
      }

      if (!playerFitsSlot(selected, slot)) {
        playReject();
        setLocalError(`${selected.name} cannot play ${slot}.`);
        setStatus(`${selected.name} can play ${formatEligiblePositions(selected)} — not ${slot}.`);
        return;
      }

      setLocalError(null);

      const raw = Math.round(getDollarValueForSlot(selected, slot));
      const teamName = TEAMS.find((t) => t.id === selected.teamId)?.fullName ?? spunTeam.fullName;
      const selection: H2HPickSelection = {
        name: selected.name,
        position: slot,
        teamId: selected.teamId,
        teamName,
        era: spunEra,
        dollarValue: raw,
        playerId: selected.id,
        primarySlot: selected.primaryPosition,
        baseDollarValue: selected.dollarValue,
      };

      const colors = getTeamColors(selected.teamId);
      const ink = contrastOnPrimary(colors.primary);

      if (reduceMotion) {
        hapticSlam();
        finalizePick(slot, selection, raw);
        return;
      }

      const points = measureDraftSlam(selected.id, slot);
      if (!points) {
        hapticSlam();
        finalizePick(slot, selection, raw);
        return;
      }

      pendingPickRef.current = { slot, selection, raw };
      schedulePlayerSlotSound(400);
      setSlamSlot(slot);
      setSlamPayload({
        id: `${selected.id}-${slot}-${Date.now()}`,
        from: points.from,
        to: points.to,
        initials: playerInitials(selected.name),
        primary: colors.primary,
        ink,
      });
    },
    [
      clearMoveMode,
      finalizeMove,
      finalizePick,
      lockingSlot,
      playReject,
      reduceMotion,
      resume,
      selected,
      slamPayload,
      spunEra,
      spunTeam,
      startMoveMode,
      picksFilled,
      lineupLocked,
    ],
  );

  const handleSlotTap = useCallback(
    (slot: H2HPosition) => {
      const now = Date.now();
      const last = lastSlotTapRef.current;
      if (last && last.slot === slot && now - last.at < 320) return;
      lastSlotTapRef.current = { slot, at: now };
      handleSlotClick(slot);
    },
    [handleSlotClick],
  );

  const availableOffers = useMemo(
    () =>
      sortOffersBestFirst(
        offers.filter(
          (p) =>
            !rosteredNames.has(normalizeName(p.name)) &&
            openPositions.some((pos) => playerFitsSlot(p, pos)),
        ),
      ),
    [offers, openPositions, rosteredNames],
  );

  useEffect(() => {
    if (!readyToDraft || ticketPrinting) return;
    if (availableOffers.length === 0 && offers.length > 0) {
      setStatus('No eligible players for open circles. Reroll team or era.');
    }
  }, [availableOffers.length, offers.length, readyToDraft, ticketPrinting]);

  const bannerError = localError ?? error;

  return (
    <div className="tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820 billion-shell--neo billion-shell--picking billion-shell--h2h">
      <GameBackground />
      <header className="billion-top billion-top--spin billion-top--h2h">
        <button type="button" className="tu-back" onClick={onExit}>
          ← Leave
        </button>
        <div className="billion-h2h-bar" aria-label="Draft progress">
          <span className="billion-h2h-bar__you">{picksFilled}/5</span>
          <span className="billion-h2h-bar__opp">Opp {Math.min(5, opponentPickCount)}/5</span>
        </div>
      </header>

      <div className="billion-draft-layout billion-draft-layout--no-value billion-draft-layout--vertical-booth">
        <main className="billion-main billion-main--draft">
          {lineupLocked ? (
            <div className="billion-pick-stage h2h-rearrange-stage">
              <p className="h2h-rearrange-stage__title">Lineup locked</p>
              <p className="h2h-rearrange-stage__hint" role="status">
                Waiting for opponent ({Math.min(5, opponentPickCount)}/5). Tap a placed circle
                below to move a player.
              </p>
            </div>
          ) : !readyToDraft ? (
            <div className={`billion-booth-stage${ticketPrinting ? ' is-printing' : ''}`}>
              <BallionTicketMachine
                locked={lockedPair}
                printing={ticketPrinting}
                canRerollTeam={false}
                canRerollEra={false}
                reduceMotion={reduceMotion}
                autoReroll={boothReroll}
                rerollFrom={rerollFrom}
                holdTeam={spunTeam ?? rerollFrom?.team ?? null}
                holdEra={spunEra ?? rerollFrom?.era ?? null}
                showGoal={false}
                rollLocked={picksFilled >= 5 || lineupLocked}
                onAutoRerollConsumed={() => setBoothReroll(null)}
                onPrint={handlePrint}
                onResult={handleResult}
                onReroll={handleReroll}
              />
            </div>
          ) : spunTeam && spunEra ? (
            <div className="billion-pick-stage">
              <FranchisePickScreen
                team={spunTeam}
                era={spunEra}
                offers={availableOffers}
                openPositions={openPositions}
                selectedId={selectedId}
                canRerollTeam={teamRerolls > 0}
                canRerollEra={eraRerolls > 0}
                hint={
                  selected
                    ? `Tap an open ${formatEligiblePositions(selected)} circle below.`
                    : status
                }
                onSelect={handleSelect}
                onReroll={handleReroll}
              />
            </div>
          ) : null}
        </main>

        <aside
          className={`billion-court is-docked is-slots-only h2h-draft-dock${
            selected || movingFrom ? ' is-assigning' : ''
          }`}
          aria-label="Your five"
        >
          <p className="h2h-draft-dock__hint" role="status">
            {status}
          </p>
          <div className="billion-court-dock" aria-label="Your five dock">
            {LINEUP_POSITIONS.map((slot) => {
              const pick = localSlots[slot];
              const offerCanDrop =
                Boolean(selected) &&
                !pick &&
                !lockingSlot &&
                !slamPayload &&
                playerFitsSlot(selected, slot);
              const moveCanDrop =
                Boolean(movingFrom && movingPlayer) &&
                !pick &&
                !lockingSlot &&
                !slamPayload &&
                canMoveToSlot(pickAsPlayer(movingPlayer), movingFrom, slot);
              const canDrop = moveCanDrop || (offerCanDrop && !movingFrom);
              const isMovingSource = movingFrom === slot;
              const isLocking = lockingSlot === slot;
              const isSlamTarget = slamSlot === slot && !pick;
              const isJustFilled = justFilledSlot === slot && Boolean(pick);
              return (
                <button
                  key={slot}
                  type="button"
                  data-draft-slot={slot}
                  className={`billion-court-dock__item h2h-draft-dock__slot${
                    pick ? ' is-filled' : ''
                  }${canDrop ? ' is-target' : ''}${isMovingSource ? ' is-moving' : ''}${
                    isLocking ? ' is-locking' : ''
                  }${isSlamTarget ? ' is-slam-target' : ''}${
                    isJustFilled ? ' is-just-filled' : ''
                  }`}
                  onPointerDown={(e) => {
                    if (busy && !movingFromRef.current) return;
                    e.preventDefault();
                    handleSlotTap(slot);
                  }}
                  aria-label={
                    pick
                      ? `${POSITION_LABELS[slot]}: ${pick.name}`
                      : `Empty ${POSITION_LABELS[slot]}`
                  }
                >
                  <span
                    className="billion-court-dock__circle"
                    style={
                      pick
                        ? {
                            backgroundColor: getTeamColors(pick.teamId).primary,
                            color: contrastOnPrimary(getTeamColors(pick.teamId).primary),
                            borderColor: getTeamColors(pick.teamId).primary,
                          }
                        : undefined
                    }
                  >
                    {pick ? playerInitials(pick.name) : '·'}
                  </span>
                  <span className="billion-court-dock__pos" aria-hidden="true">
                    {slot}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
      {bannerError ? (
        <p className="h2h-match-banner-error" role="alert">
          {bannerError}
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
