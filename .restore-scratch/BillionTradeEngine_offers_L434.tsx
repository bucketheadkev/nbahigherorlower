'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BILLION_GOAL,
  ERAS,
  buildEraRoster,
  formatDollars,
  formatDollarsExact,
  getDollarValue,
  spinRandomEra,
  spinRandomTeam,
  sumTeamValue,
  type DecadeEra,
  type EraOfferPlayer,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import {
  canMoveToSlot,
  formatEligiblePositions,
  getEligiblePositions,
  playerFitsSlot,
} from '@/lib/tradeup/alternatePositions';
import { simulateLineupSeason, type SeasonRecord } from '@/lib/tradeup/lineupSeason';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { Position, TeamInfo } from '@/lib/tradeup/types';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { BillionResultScreen } from './BillionResultScreen';
import { GameBackground } from './game/GameBackground';
import { PlayerCardVisual } from './PlayerCardVisual';
import { TradeUpLogo } from './TradeUpLogo';

interface BillionTradeEngineProps {
  onExit: () => void;
  onWin?: () => void;
}

const EMPTY_SPIN = '-';

type RosterSlots = Record<Position, ValuedPlayer | null>;
type Phase = 'draft' | 'won' | 'lost';

const EMPTY_ROSTER: RosterSlots = {
  PG: null,
  SG: null,
  SF: null,
  PF: null,
  C: null,
};

/** 2–1–2 court chart order */
const FORMATION_LAYOUT: Position[][] = [
  ['SG', 'SF'],
  ['C'],
  ['PG', 'PF'],
];

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

export function BillionTradeEngine({ onExit, onWin }: BillionTradeEngineProps) {
  const reduceMotion = getPrefersReducedMotion();
  const { resume, playTap, playAccept, playReject, playVictory, playDefeat } = useSound();

  const [slots, setSlots] = useState<RosterSlots>(EMPTY_ROSTER);
  const [phase, setPhase] = useState<Phase>('draft');
  const [seasonRecord, setSeasonRecord] = useState<SeasonRecord | null>(null);
  const [spunTeam, setSpunTeam] = useState<TeamInfo | null>(null);
  const [spunEra, setSpunEra] = useState<DecadeEra | null>(null);
  const [spinningTeam, setSpinningTeam] = useState(false);
  const [spinningEra, setSpinningEra] = useState(false);
  const [displayTeam, setDisplayTeam] = useState(EMPTY_SPIN);
  const [displayEra, setDisplayEra] = useState(EMPTY_SPIN);
  const [offers, setOffers] = useState<EraOfferPlayer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [movingFrom, setMovingFrom] = useState<Position | null>(null);
  /** One each for the entire run — never refreshed after a pick. */
  const [teamRerolls, setTeamRerolls] = useState(1);
  const [eraRerolls, setEraRerolls] = useState(1);
  const [status, setStatus] = useState<string | null>(
    'Spin a team and era to start drafting.',
  );

  const teamSpinTimerRef = useRef<number | null>(null);
  const eraSpinTimerRef = useRef<number | null>(null);

  const filled = useMemo(() => rosterList(slots), [slots]);
  const teamValue = useMemo(() => sumTeamValue(filled), [filled]);
  const readyToDraft = Boolean(spunTeam && spunEra) && !spinningTeam && !spinningEra;
  const selectedOffer = offers.find((p) => p.id === selectedOfferId) ?? null;
  const movingPlayer = movingFrom ? slots[movingFrom] : null;
  const progress = Math.min(1, teamValue / BILLION_GOAL);
  const openSlots = LINEUP_POSITIONS.filter((pos) => !slots[pos]).length;
  const rosteredIds = useMemo(
    () => new Set(filled.map((p) => p.id)),
    [filled],
  );

  const clearTeamSpin = useCallback(() => {
    if (teamSpinTimerRef.current !== null) {
      window.clearInterval(teamSpinTimerRef.current);
      teamSpinTimerRef.current = null;
    }
  }, []);

  const clearEraSpin = useCallback(() => {
    if (eraSpinTimerRef.current !== null) {
      window.clearInterval(eraSpinTimerRef.current);
      eraSpinTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTeamSpin();
      clearEraSpin();
    };
  }, [clearEraSpin, clearTeamSpin]);

  const runTeamSpin = useCallback(() => {
    clearTeamSpin();
    setSpinningTeam(true);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setSpunTeam(null);
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      const sample = spinRandomTeam();
      setDisplayTeam(sample.fullName);
      if (ticks >= (reduceMotion ? 6 : 14)) {
        window.clearInterval(id);
        teamSpinTimerRef.current = null;
        const final = spinRandomTeam();
        setSpunTeam(final);
        setDisplayTeam(final.fullName);
        setSpinningTeam(false);
      }
    }, reduceMotion ? 50 : 70);
    teamSpinTimerRef.current = id;
  }, [clearTeamSpin, reduceMotion]);

  const runEraSpin = useCallback(() => {
    clearEraSpin();
    setSpinningEra(true);
    setSelectedOfferId(null);
    setMovingFrom(null);
    setOffers([]);
    setSpunEra(null);
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      setDisplayEra(ERAS[ticks % ERAS.length]!);
      if (ticks >= (reduceMotion ? 6 : 14)) {
        window.clearInterval(id);
        eraSpinTimerRef.current = null;
        const final = spinRandomEra();
        setSpunEra(final);
        setDisplayEra(final);
        setSpinningEra(false);
      }
    }, reduceMotion ? 50 : 70);
    eraSpinTimerRef.current = id;
  }, [clearEraSpin, reduceMotion]);

  const spinTeam = useCallback(() => {
    if (phase !== 'draft' || spinningTeam) return;
    resume();
    playTap();
    runTeamSpin();
  }, [phase, playTap, resume, runTeamSpin, spinningTeam]);

  const spinEra = useCallback(() => {
    if (phase !== 'draft' || spinningEra) return;
    resume();
    playTap();
    runEraSpin();
  }, [phase, playTap, resume, runEraSpin, spinningEra]);

  const rerollTeam = useCallback(() => {
    if (phase !== 'draft' || spinningTeam || teamRerolls <= 0 || !spunTeam) return;
    resume();
    playTap();
    setTeamRerolls(0);
    setStatus('Team re-roll used for this run.');
    runTeamSpin();
  }, [phase, playTap, resume, runTeamSpin, spinningTeam, spunTeam, teamRerolls]);

  const rerollEra = useCallback(() => {
    if (phase !== 'draft' || spinningEra || eraRerolls <= 0 || !spunEra) return;
    resume();
    playTap();
    setEraRerolls(0);
    setStatus('Era re-roll used for this run.');
    runEraSpin();
  }, [eraRerolls, phase, playTap, resume, runEraSpin, spinningEra, spunEra]);

  useEffect(() => {
    if (!spunTeam || !spunEra || spinningTeam || spinningEra) return;
    const next = buildEraRoster(spunTeam, spunEra).filter((p) => !rosteredIds.has(p.id));
    setOffers(next);
    setStatus(`Draft from the ${spunTeam.fullName} · ${spunEra}`);
  }, [spunTeam, spunEra, spinningTeam, spinningEra, rosteredIds]);

  const resetTableForNextPick = useCallback(() => {
    setSpunTeam(null);
    setSpunEra(null);
    setDisplayTeam(EMPTY_SPIN);
    setDisplayEra(EMPTY_SPIN);
    setOffers([]);
    setSelectedOfferId(null);
    setMovingFrom(null);
    // Re-rolls stay spent for the entire run — do not restore.
  }, []);

  const finishRun = useCallback(
    (nextSlots: RosterSlots, value: number) => {
      const lineup = rosterInSlotOrder(nextSlots);
      if (value >= BILLION_GOAL) {
        const record = simulateLineupSeason(lineup);
        setSeasonRecord(record);
        playVictory();
        setPhase('won');
        onWin?.();
        setStatus(`Dynasty complete · ${formatDollarsExact(value)}`);
      } else {
        setSeasonRecord(null);
        playDefeat();
        setPhase('lost');
        setStatus(`Board full at ${formatDollarsExact(value)} — short of $1B.`);
      }
    },
    [onWin, playDefeat, playVictory],
  );

  const handleSelectOffer = useCallback(
    (player: EraOfferPlayer) => {
      if (phase !== 'draft' || !readyToDraft) return;
      resume();
      playTap();
      setMovingFrom(null);
      setSelectedOfferId((id) => (id === player.id ? null : player.id));
      const alts = formatEligiblePositions(player);
      setStatus(`Selected ${player.name} (${alts}) — tap an open matching slot.`);
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
        playAccept();
        setStatus(`${movingPlayer.name} moved to ${POSITION_LABELS[slot]}.`);
        return;
      }

      // Tap a locked player to pick them up for a position move (alts only).
      if (!selectedOffer && occupant) {
        const alts = getEligiblePositions(occupant);
        const hasOpenAlt = alts.some((pos) => pos !== slot && !slots[pos]);
        if (!hasOpenAlt) {
          setStatus(
            alts.length <= 1
              ? `${occupant.name} is locked at ${slot} — no alternate slots open.`
              : `${occupant.name} has no open alternate slots right now.`,
          );
          return;
        }
        setSelectedOfferId(null);
        setMovingFrom(slot);
        setStatus(
          `Moving ${occupant.name} (${formatEligiblePositions(occupant)}) — tap an open eligible slot.`,
        );
        return;
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
      const value = sumTeamValue(rosterList(nextSlots));
      const full = LINEUP_POSITIONS.every((pos) => nextSlots[pos]);
      setSlots(nextSlots);
      setSelectedOfferId(null);
      setMovingFrom(null);

      if (full) {
        finishRun(nextSlots, value);
        return;
      }

      playAccept();
      setStatus(`${valued.name} locked at ${POSITION_LABELS[slot]}. Spin again.`);
      window.setTimeout(() => resetTableForNextPick(), reduceMotion ? 120 : 380);
    },
    [
      finishRun,
      movingFrom,
      movingPlayer,
      phase,
      playAccept,
      playReject,
      playTap,
      reduceMotion,
      resetTableForNextPick,
      resume,
      selectedOffer,
      slots,
    ],
  );

  if (phase === 'won' || phase === 'lost') {
    return (
      <div className="tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820">
        <GameBackground />
        <header className="billion-top">
          <button type="button" className="tu-back" onClick={onExit}>
            ← Home
          </button>
          <TradeUpLogo size="xs" />
          <span className="billion-draft-meta">5/5</span>
        </header>
        <BillionResultScreen
          kind={phase}
          teamValue={teamValue}
          roster={rosterInSlotOrder(slots)}
          seasonRecord={seasonRecord}
          onExit={onExit}
        />
      </div>
    );
  }

  return (
    <div className="tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820">
      <GameBackground />

      <header className="billion-top">
        <button type="button" className="tu-back" onClick={onExit}>
          ← Home
        </button>
        <TradeUpLogo size="xs" />
        <span className="billion-draft-meta">
          {openSlots === 0 ? '5/5' : `${5 - openSlots}/5`}
        </span>
      </header>

      <div className="billion-value-block" aria-live="polite">
        <p className="billion-value-block__label">Team Value</p>
        <p className="billion-value-block__amount">{formatDollarsExact(teamValue)}</p>
        <div
          className="billion-value-block__bar"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="billion-value-block__goal">Goal {formatDollars(BILLION_GOAL)}</p>
      </div>

      <div className="billion-draft-layout">
        <main className="billion-main billion-main--draft">
          <section className="billion-wheels billion-wheels--xl">
            <button
              type="button"
              className={`billion-wheel billion-wheel--xl${
                spinningTeam ? ' is-spinning' : ''
              }${spunTeam && !spinningTeam ? ' is-locked' : ''}`}
              onClick={spinTeam}
              disabled={spinningTeam}
            >
              <span>Team</span>
              <strong>{displayTeam}</strong>
              <em>{spunTeam && !spinningTeam ? 'Locked' : 'Spin'}</em>
            </button>
            <button
              type="button"
              className={`billion-wheel billion-wheel--xl${
                spinningEra ? ' is-spinning' : ''
              }${spunEra && !spinningEra ? ' is-locked' : ''}`}
              onClick={spinEra}
              disabled={spinningEra}
            >
              <span>Era</span>
              <strong>{displayEra}</strong>
              <em>{spunEra && !spinningEra ? 'Locked' : 'Spin'}</em>
            </button>
          </section>

          {readyToDraft ? (
            <div className="billion-rerolls">
              <button
                type="button"
                className="billion-reroll"
                onClick={rerollTeam}
                disabled={teamRerolls <= 0 || spinningTeam}
              >
                Re-roll team
                <span>{teamRerolls} left</span>
              </button>
              <button
                type="button"
                className="billion-reroll"
                onClick={rerollEra}
                disabled={eraRerolls <= 0 || spinningEra}
              >
                Re-roll era
                <span>{eraRerolls} left</span>
              </button>
            </div>
          ) : null}

          {status ? <p className="billion-status">{status}</p> : null}

          {readyToDraft && offers.length > 0 ? (
            <section className="billion-offers billion-offers--blind" aria-label="Available players">
              <div className="billion-offers__head">
                <h2>
                  {spunTeam?.fullName} · {spunEra}
                </h2>
              </div>
              <p className="billion-offers__hint">
                {selectedOffer
                  ? `Tap an open ${formatEligiblePositions(selectedOffer)} slot.`
                  : movingPlayer
                    ? `Moving ${movingPlayer.name} — tap an open alternate slot.`
                    : 'Best players first — pick one, then lock an open matching slot.'}
              </p>
              <div className="billion-offers__list">
                {offers.map((player) => {
                  const selected = selectedOfferId === player.id;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      className={`billion-offer${selected ? ' is-selected' : ''}`}
                      onClick={() => handleSelectOffer(player)}
                    >
                      <div className="billion-offer__card">
                        <PlayerCardVisual player={player} variant="full" size="sm" />
                      </div>
                      <div className="billion-offer__meta">
                        <strong>{player.name}</strong>
                        <span className="billion-offer__pos">
                          {formatEligiblePositions(player)}
                        </span>
                        <span>
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
          ) : (
            <section className="billion-waiting">
              <p>
                {spinningTeam || spinningEra
                  ? 'Spinning…'
                  : 'Spin Team and Era to reveal your draft board.'}
              </p>
            </section>
          )}
        </main>

        <aside className="billion-court" aria-label="Starting five chart">
          <p className="billion-court__label">Your five</p>
          <div className="billion-court__formation">
            {FORMATION_LAYOUT.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={`billion-court__row billion-court__row--${row.length}`}
              >
                {row.map((slot) => {
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
                  const wrongDrop =
                    (Boolean(selectedOffer) && !offerCanDrop) ||
                    (Boolean(movingPlayer) && !moveCanDrop && slot !== movingFrom);
                  const isMovingSource = movingFrom === slot;

                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`billion-court__slot${player ? ' is-filled' : ' is-empty'}${
                        canDrop ? ' is-target' : ''
                      }${wrongDrop && (selectedOffer || movingPlayer) ? ' is-blocked' : ''}${
                        canDrop ? ' is-pulse' : ''
                      }${isMovingSource ? ' is-moving' : ''}`}
                      onClick={() => handleSlotClick(slot)}
                      aria-label={
                        player
                          ? `${POSITION_LABELS[slot]}: ${player.name}`
                          : `Empty ${POSITION_LABELS[slot]} slot`
                      }
                    >
                      <span className="billion-court__slot-pos">{slot}</span>
                      {player ? (
                        <>
                          <span className="billion-court__slot-name">{player.name}</span>
                          <span className="billion-court__slot-stats">
                            {player.stats.ppg.toFixed(0)}/{player.stats.rpg.toFixed(0)}/
                            {player.stats.apg.toFixed(0)}
                          </span>
                        </>
                      ) : (
                        <span className="billion-court__slot-empty">
                          {POSITION_LABELS[slot]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
