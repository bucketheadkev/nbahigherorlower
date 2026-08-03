'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BILLION_GOAL,
  buildEraRoster,
  formatDollarsExact,
  getDollarValue,
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
import { hapticSlotConfirm } from '@/lib/tradeup/haptics';
import { playGameSound, playSlotPlaceSound } from '@/lib/tradeup/gameAudio';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { GameBackground } from './game/GameBackground';
import { TicketDispenser } from './TicketDispenser';
import { ValueRevealMachine } from './ValueRevealMachine';
import { PlayerCardVisual } from './PlayerCardVisual';
import { TradeUpLogo } from './TradeUpLogo';

interface BillionTradeEngineProps {
  onExit: () => void;
  onPlayAgain?: () => void;
  onWin?: () => void;
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

export function BillionTradeEngine({ onExit, onPlayAgain, onWin }: BillionTradeEngineProps) {
  const reduceMotion = getPrefersReducedMotion();
  const { resume, playTap, playReject, playVictory, playDefeat, playUiBack } =
    useSound();

  const [slots, setSlots] = useState<RosterSlots>(EMPTY_ROSTER);
  const [phase, setPhase] = useState<Phase>('draft');
  const [spunTeam, setSpunTeam] = useState<TeamInfo | null>(null);
  const [spunEra, setSpunEra] = useState<DecadeEra | null>(null);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [offers, setOffers] = useState<EraOfferPlayer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [movingFrom, setMovingFrom] = useState<Position | null>(null);
  /** One team reroll + one era reroll per printed ticket (restored each new pick). */
  const [teamRerolls, setTeamRerolls] = useState(1);
  const [eraRerolls, setEraRerolls] = useState(1);
  const [status, setStatus] = useState<string | null>(
    'Print a ticket to land a team and era.',
  );
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [worldRank, setWorldRank] = useState(0);
  const filled = useMemo(() => rosterList(slots), [slots]);
  const teamValue = useMemo(() => sumTeamValue(filled), [filled]);
  const readyToDraft = Boolean(spunTeam && spunEra) && !ticketPrinting;
  const lockedPair = useMemo<SpinPair | null>(
    () => (spunTeam && spunEra ? { team: spunTeam, era: spunEra } : null),
    [spunTeam, spunEra],
  );
  const selectedOffer = offers.find((p) => p.id === selectedOfferId) ?? null;
  const movingPlayer = movingFrom ? slots[movingFrom] : null;
  const openSlots = LINEUP_POSITIONS.filter((pos) => !slots[pos]).length;
  const rosteredIds = useMemo(
    () => new Set(filled.map((p) => p.id)),
    [filled],
  );
  const rosteredNames = useMemo(
    () => new Set(filled.map((p) => normalizePlayerName(p.name))),
    [filled],
  );

  const handleTicketPrint = useCallback(() => {
    if (phase !== 'draft') return;
    resume();
    playTap();
    setTicketPrinting(true);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setSpunTeam(null);
    setSpunEra(null);
    setStatus('Printing ticket…');
  }, [phase, playTap, resume]);

  const handleTicketResult = useCallback((pair: SpinPair) => {
    setSpunTeam(pair.team);
    setSpunEra(pair.era);
    setTicketPrinting(false);
    setStatus(
      `${pair.team.fullName} · ${pair.era} — pick a player below, then assign on Your five.`,
    );
  }, []);

  const handleTicketReroll = useCallback((kind: 'team' | 'era') => {
    if (phase !== 'draft' || ticketPrinting) return;
    if (kind === 'team' && teamRerolls <= 0) return;
    if (kind === 'era' && eraRerolls <= 0) return;
    resume();
    playTap();
    if (kind === 'team') setTeamRerolls(0);
    else setEraRerolls(0);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setTicketPrinting(true);
    setStatus(kind === 'team' ? 'Rerolling team…' : 'Rerolling era…');
  }, [phase, ticketPrinting, playTap, teamRerolls, eraRerolls, resume]);

  // Load the full team×era board once per spin. Do NOT rebuild on lineup
  // changes — that used to reshuffle a 12-player sample and "spawn" stars mid-pick.
  useEffect(() => {
    if (!spunTeam || !spunEra || ticketPrinting) return;
    try {
      const next = buildEraRoster(spunTeam, spunEra).filter(
        (p) => !rosteredNames.has(normalizePlayerName(p.name)),
      );
      setOffers(next);
      if (next.length === 0) {
        console.warn(
          `[BillionTradeEngine] No offers for ${spunTeam.id} · ${spunEra}`,
        );
        setStatus(
          `${spunTeam.fullName} · ${spunEra} — no available players. Print again.`,
        );
        return;
      }
      setStatus(
        `${spunTeam.fullName} · ${spunEra} — pick a player below, then assign on Your five.`,
      );
    } catch (err) {
      console.warn('[BillionTradeEngine] Failed to load era roster', err);
      setOffers([]);
      setStatus('Could not load that roster. Print again.');
    }
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

  const resetTableForNextPick = useCallback(() => {
    setSpunTeam(null);
    setSpunEra(null);
    setTicketPrinting(false);
    setOffers([]);
    setSelectedOfferId(null);
    setMovingFrom(null);
    // Rerolls are once per run — do not refresh between tickets.
    setStatus('Print a ticket to land a team and era.');
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
        playVictory();
        onWin?.();
        setStatus(`Dynasty complete · ${formatDollarsExact(value)}`);
      } else {
        playDefeat();
        setStatus(`Board full at ${formatDollarsExact(value)} — short of $1B.`);
      }

      return { personalBest: best, isNewPersonalBest: isNewBest, worldRank: rank };
    },
    [onWin, playDefeat, playVictory],
  );

  const handleRevealComplete = useCallback(
    (payload: { teamValue: number }) => {
      return finishRun(slots, payload.teamValue);
    },
    [finishRun, slots],
  );

  const handleSelectOffer = useCallback(
    (player: EraOfferPlayer) => {
      if (phase !== 'draft' || !readyToDraft) return;
      resume();
      playTap();
      setMovingFrom(null);
      setSelectedOfferId((id) => (id === player.id ? null : player.id));
      const alts = formatEligiblePositions(player);
      setStatus(`Selected ${player.name} (${alts}) — tap an open matching circle below.`);
    },
    [phase, playTap, readyToDraft, resume],
  );

  const handleSlotClick = useCallback(
    (slot: Position) => {
      if (phase !== 'draft') return;
      resume();
      playTap();

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
        playSlotPlaceSound();
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

      const valued: ValuedPlayer = {
        ...selectedOffer,
        dollarValue: getDollarValue(selectedOffer),
      };
      const nextSlots: RosterSlots = { ...slots, [slot]: valued };
      const full = LINEUP_POSITIONS.every((pos) => nextSlots[pos]);
      setSlots(nextSlots);
      setSelectedOfferId(null);
      setMovingFrom(null);
      playSlotPlaceSound();
      hapticSlotConfirm();

      if (full) {
        playGameSound('lineup_complete');
        setStatus('Lineup complete — opening the Assay Vault…');
        setPhase('transition');
        window.setTimeout(
          () => setPhase('reveal'),
          reduceMotion ? 220 : 680,
        );
        return;
      }

      setStatus(`${valued.name} locked at ${POSITION_LABELS[slot]}. Print again.`);
      window.setTimeout(() => resetTableForNextPick(), reduceMotion ? 180 : 520);
    },
    [
      movingFrom,
      movingPlayer,
      phase,
      playReject,
      playTap,
      reduceMotion,
      resetTableForNextPick,
      resume,
      selectedOffer,
      slots,
    ],
  );

  const showDraft = phase === 'draft';
  const showTransition = phase === 'transition';
  const showReveal = phase === 'reveal';

  return (
    <div
      className={`tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820${
        showDraft ? ' billion-shell--picking' : ''
      }${showTransition ? ' billion-shell--vault-transition' : ''
      }${showReveal ? ' billion-shell--vault' : ''}`}
    >
      <GameBackground />

      <header className="billion-top">
        <button
          type="button"
          className="tu-back"
          onClick={() => {
            resume();
            playUiBack();
            onExit();
          }}
        >
          ← Home
        </button>
        <TradeUpLogo size="xs" />
        <span className="billion-draft-meta">
          {openSlots === 0 ? '5/5' : `${5 - openSlots}/5`}
        </span>
      </header>

      {showTransition ? (
        <div className="value-vault-transition" aria-live="polite">
          <div className="value-vault-transition__beam" aria-hidden />
          <p className="value-vault-transition__eyebrow">Lineup locked</p>
          <h2 className="value-vault-transition__title">Assay Vault</h2>
          <p className="value-vault-transition__sub">Calibrating valuation chamber…</p>
        </div>
      ) : null}

      {showReveal ? (
        <ValueRevealMachine
          roster={rosterInSlotOrder(slots)}
          reduceMotion={reduceMotion}
          personalBest={personalBest}
          isNewPersonalBest={isNewPersonalBest}
          worldRank={worldRank}
          onComplete={handleRevealComplete}
          onExit={onExit}
          onPlayAgain={onPlayAgain ?? onExit}
        />
      ) : null}

      {showDraft ? (
        <div className="billion-draft-layout billion-draft-layout--no-value">
          <main className="billion-main billion-main--draft">
            <TicketDispenser
              locked={lockedPair}
              printing={ticketPrinting}
              canRerollTeam={teamRerolls > 0}
              canRerollEra={eraRerolls > 0}
              reduceMotion={reduceMotion}
              onPrint={handleTicketPrint}
              onResult={handleTicketResult}
              onReroll={handleTicketReroll}
            />

            {status && readyToDraft ? <p className="billion-status">{status}</p> : null}

            {readyToDraft && availableOffers.length > 0 ? (
              <section
                className="billion-offers billion-offers--blind billion-offers--draft-focus"
                aria-label="Available players"
              >
                <p className="billion-offers__hint">
                  {selectedOffer
                    ? `Tap an open ${formatEligiblePositions(selectedOffer)} circle below.`
                    : movingPlayer
                      ? `Moving ${movingPlayer.name} — tap an open eligible circle.`
                      : 'Pick a player, then tap an open circle on Your five.'}
                </p>
                <div className="billion-offers__list">
                  {availableOffers.map((player) => {
                    const selected = selectedOfferId === player.id;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        className={`billion-offer${selected ? ' is-selected' : ''}`}
                        onClick={() => handleSelectOffer(player)}
                      >
                        <div className="billion-offer__card">
                          <PlayerCardVisual player={player} variant="face" size="md" />
                        </div>
                        <div className="billion-offer__meta">
                          <strong className="billion-offer__name">{player.name}</strong>
                          <span className="billion-offer__pos">
                            {formatEligiblePositions(player)}
                          </span>
                          <span className="billion-offer__stats">
                            {player.eraStats.ppg.toFixed(1)} PPG ·{' '}
                            {player.eraStats.rpg.toFixed(1)} RPG ·{' '}
                            {player.eraStats.apg.toFixed(1)} APG
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </main>

          <aside className="billion-court is-docked" aria-label="Your five">
            <div className="billion-court-dock" aria-label="Your five dock">
              {LINEUP_POSITIONS.map((slot) => {
                const player = slots[slot];
                const offerCanDrop =
                  Boolean(selectedOffer) &&
                  !player &&
                  playerFitsSlot(selectedOffer!, slot);
                const moveCanDrop =
                  Boolean(movingPlayer && movingFrom) &&
                  !player &&
                  canMoveToSlot(movingPlayer!, movingFrom!, slot);
                const canDrop = offerCanDrop || moveCanDrop;
                const isMovingSource = movingFrom === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`billion-court-dock__item${
                      player ? ' is-filled' : ''
                    }${canDrop ? ' is-target' : ''}${
                      isMovingSource ? ' is-moving' : ''
                    }`}
                    onClick={() => handleSlotClick(slot)}
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
    </div>
  );
}
