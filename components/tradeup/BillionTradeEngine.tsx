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
  saveBestFourPlayerSum,
  saveBestRosterValue,
  saveBestWorldRank,
} from '@/lib/tradeup/storage';
import {
  getWorldRank,
  sumTopPlayerValues,
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
import { BallionTicketMachine } from './BallionTicketMachine';
import { DraftPlayerSlamFly, type DraftSlamPayload } from './DraftPlayerSlamFly';
import { FranchisePickScreen } from './FranchisePickScreen';
import { ValueRevealMachine } from './ValueRevealMachine';
import { HeadToHeadShowdown } from './HeadToHeadShowdown';
import { RewardedAdButton } from './RewardedAdButton';
import { REWARDED_ADS_UI_ENABLED } from '@/lib/tradeup/ads/adConfig';
import type { TicketRerollKind } from './BallionTicketMachine';
import type { H2HOpponent } from '@/lib/tradeup/h2hOpponents';
import { serializeMatchLineup } from '@/lib/multiplayer/match';

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
}: BillionTradeEngineProps) {
  const isH2H = challengeMode === 'h2h' && Boolean(h2hOpponent);
  const isOnline = challengeMode === 'online';
  const playerHandle = (h2hPlayerName ?? 'YOU').trim() || 'YOU';
  const oppLabel = (onlineOpponentName ?? 'OPPONENT').trim() || 'OPPONENT';
  const oppProgress = Math.max(0, Math.min(5, Math.round(onlineOpponentProgress)));
  const reduceMotion = getPrefersReducedMotion();
  const { resume, playReject, playVictory, playDefeat, playUiBack } =
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
  const pendingAssignRef = useRef<{
    slot: Position;
    valued: ValuedPlayer & { era?: DecadeEra };
  } | null>(null);
  /** One team reroll + one era reroll per printed ticket (restored each new pick). */
  const [teamRerolls, setTeamRerolls] = useState(1);
  const [eraRerolls, setEraRerolls] = useState(1);
  const [boothReroll, setBoothReroll] = useState<TicketRerollKind | null>(null);
  const [rerollFrom, setRerollFrom] = useState<SpinPair | null>(null);
  const [status, setStatus] = useState<string | null>(
    'Tap ROLL to land a team and era.',
  );
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [worldRank, setWorldRank] = useState(0);
  const evalStartedRef = useRef(false);
  const resetTimerRef = useRef(0);
  const transitionTimerRef = useRef(0);

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
    setSpunTeam(pair.team);
    setSpunEra(pair.era);
    setTicketPrinting(false);
    setRerollFrom(null);
    setStatus(
      `${pair.team.fullName} · ${pair.era} — pick a player, then tap an open circle.`,
    );
  }, []);

  const handleTicketReroll = useCallback((kind: TicketRerollKind) => {
    if (phase !== 'draft' || ticketPrinting || evalStartedRef.current) return;
    if (kind === 'team' && teamRerolls <= 0) return;
    if (kind === 'era' && eraRerolls <= 0) return;
    if (!spunTeam || !spunEra) return;
    resume();
    if (kind === 'team') setTeamRerolls(0);
    else setEraRerolls(0);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setRerollFrom({ team: spunTeam, era: spunEra });
    // Clear only the axis being rerolled — the other stays visible/static.
    if (kind === 'team') setSpunTeam(null);
    else setSpunEra(null);
    setTicketPrinting(true);
    setBoothReroll(kind);
    setStatus(kind === 'team' ? 'Rerolling team…' : 'Rerolling era…');
  }, [phase, ticketPrinting, teamRerolls, eraRerolls, resume, spunTeam, spunEra]);

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
    setSpunTeam(null);
    setSpunEra(null);
    setTicketPrinting(false);
    setOffers([]);
    setSelectedOfferId(null);
    setMovingFrom(null);
    // Rerolls are once per run — do not refresh between tickets.
    setStatus('Tap ROLL for your next team and era.');
  }, []);

  const finishRun = useCallback(
    (nextSlots: RosterSlots, value: number) => {
      const lineup = rosterInSlotOrder(nextSlots);
      const { best, isNewBest } = saveBestRosterValue(value);
      setPersonalBest(best);
      setIsNewPersonalBest(isNewBest);

      const fourSum = sumTopPlayerValues(
        lineup.map((p) => getDollarValue(p)),
        4,
      );
      saveBestFourPlayerSum(fourSum);

      const rank = getWorldRank(value);
      setWorldRank(rank);
      saveBestWorldRank(rank);

      if (value >= BILLION_GOAL) {
        if (!isH2H && !isOnline) {
          saveBillionRun(lineup, value);
        }
        playVictory();
        onWin?.();
        setStatus(`Dynasty complete · ${formatDollarsExact(value)}`);
      } else {
        playDefeat();
        setStatus(`Board full at ${formatDollarsExact(value)} — short of $1B.`);
      }

      return { personalBest: best, isNewPersonalBest: isNewBest, worldRank: rank };
    },
    [isH2H, isOnline, onWin, playDefeat, playVictory],
  );

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
      resume();
      hapticSelection();
      setMovingFrom(null);
      setSelectedOfferId((id) => (id === player.id ? null : player.id));
      const alts = formatEligiblePositions(player);
      setStatus(`Selected ${player.name} (${alts}) — tap an open matching circle below.`);
    },
    [phase, readyToDraft, resume],
  );

  const handleSlotClick = useCallback(
    (slot: Position) => {
      if (phase !== 'draft' || evalStartedRef.current || slamPayload) return;
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
        const nextSlots: RosterSlots = {
          ...slots,
          [movingFrom]: null,
          [slot]: movingPlayer,
        };
        setSlots(nextSlots);
        setMovingFrom(null);
        hapticSlotConfirm();
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

      const commitOffer = (targetSlot: Position, player: ValuedPlayer & { era?: DecadeEra }) => {
        const nextSlots: RosterSlots = { ...slots, [targetSlot]: player };
        const full = LINEUP_POSITIONS.every((pos) => nextSlots[pos]);
        setSlots(nextSlots);
        setSelectedOfferId(null);
        setMovingFrom(null);
        setJustFilledSlot(targetSlot);
        window.setTimeout(() => {
          setJustFilledSlot((current) => (current === targetSlot ? null : current));
        }, 360);

        if (full) {
          if (evalStartedRef.current) return;
          evalStartedRef.current = true;
          setStatus(
            isH2H
              ? 'Lineup complete — value showdown…'
              : isOnline
                ? 'Lineup complete — reading values…'
                : 'Lineup complete — reading values…',
          );
          setSelectedOfferId(null);
          setMovingFrom(null);
          setSpunTeam(null);
          setSpunEra(null);
          setOffers([]);
          setPhase('reveal');
          return;
        }

        setStatus(`${player.name} locked at ${POSITION_LABELS[targetSlot]}.`);
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = window.setTimeout(
          () => resetTableForNextPick(),
          reduceMotion ? 40 : 220,
        );
      };

      const colors = getTeamColors(selectedOffer.teamId);
      const ink = contrastOnPrimary(colors.primary);

      if (reduceMotion) {
        hapticSlam();
        commitOffer(slot, valued);
        return;
      }

      const points = measureDraftSlam(selectedOffer.id, slot);
      if (!points) {
        hapticSlam();
        commitOffer(slot, valued);
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
      movingFrom,
      movingPlayer,
      phase,
      playReject,
      reduceMotion,
      resetTableForNextPick,
      resume,
      selectedOffer,
      slamPayload,
      slots,
      spunEra,
      isH2H,
      isOnline,
    ],
  );

  const handleSlamImpact = useCallback(() => {
    const pending = pendingAssignRef.current;
    if (!pending) return;
    const nextSlots: RosterSlots = { ...slots, [pending.slot]: pending.valued };
    const full = LINEUP_POSITIONS.every((pos) => nextSlots[pos]);
    setSlots(nextSlots);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setJustFilledSlot(pending.slot);
    window.setTimeout(() => {
      setJustFilledSlot((current) => (current === pending.slot ? null : current));
    }, 360);
    pendingAssignRef.current = null;

    if (full) {
      if (evalStartedRef.current) return;
      evalStartedRef.current = true;
      setStatus(
        isH2H
          ? 'Lineup complete — value showdown…'
          : isOnline
            ? 'Lineup complete — reading values…'
            : 'Lineup complete — reading values…',
      );
      setSpunTeam(null);
      setSpunEra(null);
      setOffers([]);
      setPhase('reveal');
      return;
    }

    setStatus(`${pending.valued.name} locked at ${POSITION_LABELS[pending.slot]}.`);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(
      () => resetTableForNextPick(),
      reduceMotion ? 40 : 220,
    );
  }, [isH2H, isOnline, reduceMotion, resetTableForNextPick, slots]);

  const handleSlamComplete = useCallback(() => {
    setSlamPayload(null);
    setSlamSlot(null);
  }, []);

  const showDraft = phase === 'draft';
  const showReveal = phase === 'reveal';
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
          <div className="billion-h2h-bar billion-h2h-bar--online" aria-label="Match progress">
            <span className="billion-h2h-bar__you">
              YOU {filledCount}/5
            </span>
            <em>VS</em>
            <span className="billion-h2h-bar__opp">
              {oppLabel} {oppProgress}/5
            </span>
          </div>
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

      {showReveal && !isH2H ? (
        <ValueRevealMachine
          roster={rosterInSlotOrder(slots)}
          reduceMotion={reduceMotion}
          autoStart
          onComplete={handleRevealComplete}
          onExit={onExit}
          onPlayAgain={isOnline ? onExit : onPlayAgain ?? onExit}
        />
      ) : null}

      {showDraft ? (
        <div className="billion-draft-layout billion-draft-layout--no-value billion-draft-layout--vertical-booth">
          <main className="billion-main billion-main--draft">
            {!readyToDraft ? (
              <div className={`billion-booth-stage${ticketPrinting ? ' is-printing' : ''}`}>
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
                  showGoal={!isH2H && !isOnline}
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
                  hint={
                    selectedOffer
                      ? `Tap an open ${formatEligiblePositions(selectedOffer)} circle below.`
                      : movingPlayer
                        ? `Moving ${movingPlayer.name} — tap an open eligible circle.`
                        : 'Pick a player, then tap an open circle on Your five.'
                  }
                  onSelect={handleSelectOffer}
                  onReroll={handleTicketReroll}
                />

                {REWARDED_ADS_UI_ENABLED ? (
                  <div className="draft-rewarded-row">
                    {teamRerolls <= 0 ? (
                      <RewardedAdButton
                        placement="extra_team_reroll"
                        label="Watch ad · +1 Team Reroll"
                        onRewarded={() => setTeamRerolls(1)}
                      />
                    ) : null}
                    {eraRerolls <= 0 ? (
                      <RewardedAdButton
                        placement="extra_era_reroll"
                        label="Watch ad · +1 Era Reroll"
                        onRewarded={() => setEraRerolls(1)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </main>

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
                              backgroundColor: getTeamColors(player.teamId).primary,
                              color: contrastOnPrimary(
                                getTeamColors(player.teamId).primary,
                              ),
                              borderColor: getTeamColors(player.teamId).primary,
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
        </div>
      ) : null}
      <DraftPlayerSlamFly
        payload={slamPayload}
        onImpact={handleSlamImpact}
        onComplete={handleSlamComplete}
      />
    </div>
  );
}
