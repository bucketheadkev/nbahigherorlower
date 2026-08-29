'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildEraRoster,
  getDollarValue,
  type DecadeEra,
  type EraOfferPlayer,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import { TEAMS } from '@/lib/tradeup/teams';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { TRADE_UP_ATTEMPTS } from '@/lib/multiplayer/gameModes';
import type { H2HModeConfig, TradeUpPlayerSnapshot } from '@/lib/multiplayer/modeConfig';
import { pickTradeUpStarter } from '@/lib/multiplayer/tradeUpStarter';
import { applyH2HTradeUpDecision, fetchH2HState, seedH2HTradeUpStarter } from '@/lib/multiplayer/rooms';
import { BallionTicketMachine, type TicketRerollKind } from '../BallionTicketMachine';
import { FranchisePickScreen } from '../FranchisePickScreen';
import { GameBackground } from '../game/GameBackground';
import type { TeamInfo } from '@/lib/tradeup/types';

interface H2HTradeUpMatchProps {
  roomId: string;
  userId: string;
  myPlayerNumber: 1 | 2;
  myName: string;
  opponentName: string;
  modeSeed: string | null;
  modeConfig: H2HModeConfig;
  phase: 'selecting' | 'reveal' | 'finished';
  isHost: boolean;
  rematchBusy: boolean;
  error: string | null;
  onRematch: () => void;
  onExit: () => void;
}

type Peer = {
  current: TradeUpPlayerSnapshot;
  attemptsRemaining: number;
  finished: boolean;
};

function readPeer(cfg: H2HModeConfig, n: 1 | 2, fallback: TradeUpPlayerSnapshot): Peer {
  if (cfg.mode !== 'tradeUp') {
    return { current: fallback, attemptsRemaining: TRADE_UP_ATTEMPTS, finished: false };
  }
  const slot = n === 1 ? cfg.tradeUp.p1 : cfg.tradeUp.p2;
  const starter = cfg.tradeUp.starter?.name && cfg.tradeUp.starter.name !== '—' ? cfg.tradeUp.starter : fallback;
  return {
    current: slot.current?.name && slot.current.name !== '—' ? slot.current : starter,
    attemptsRemaining: slot.attemptsRemaining,
    finished: slot.finished,
  };
}

export function H2HTradeUpMatch({
  roomId,
  myPlayerNumber,
  myName,
  opponentName,
  modeSeed,
  modeConfig,
  phase,
  isHost,
  rematchBusy,
  error,
  onRematch,
  onExit,
}: H2HTradeUpMatchProps) {
  const seedKey = modeSeed ? `${roomId}:${modeSeed}` : roomId;
  const starter = useMemo(() => pickTradeUpStarter(seedKey), [seedKey]);
  const reduceMotion = getPrefersReducedMotion();

  const [cfg, setCfg] = useState(modeConfig);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [spunTeam, setSpunTeam] = useState<TeamInfo | null>(null);
  const [spunEra, setSpunEra] = useState<DecadeEra | null>(null);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [offers, setOffers] = useState<EraOfferPlayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boothReroll, setBoothReroll] = useState<TicketRerollKind | null>(null);
  const [pending, setPending] = useState<TradeUpPlayerSnapshot | null>(null);
  const [seeded, setSeeded] = useState(false);

  const mine = readPeer(cfg, myPlayerNumber, starter);
  const theirs = readPeer(cfg, myPlayerNumber === 1 ? 2 : 1, starter);
  const selected = offers.find((p) => p.id === selectedId) ?? null;
  const lockedPair: SpinPair | null = spunTeam && spunEra ? { team: spunTeam, era: spunEra } : null;
  const ready = Boolean(spunTeam && spunEra) && !ticketPrinting;
  const finished = phase === 'finished' || (mine.finished && theirs.finished);
  const iWin = mine.current.dollarValue > theirs.current.dollarValue;
  const theyWin = theirs.current.dollarValue > mine.current.dollarValue;

  const refresh = useCallback(async () => {
    const next = await fetchH2HState(roomId);
    setCfg(next.mode_config);
  }, [roomId]);

  useEffect(() => {
    setCfg(modeConfig);
  }, [modeConfig]);

  useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    void (async () => {
      try {
        await seedH2HTradeUpStarter(roomId, { ...starter });
        if (!cancelled) await refresh();
      } catch {
        /* SQL not applied yet — deterministic local starter still matches. */
      } finally {
        if (!cancelled) setSeeded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, roomId, seeded, starter]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!spunTeam || !spunEra || ticketPrinting) return;
    setOffers(buildEraRoster(spunTeam, spunEra).sort((a, b) => b.dollarValue - a.dollarValue));
  }, [spunEra, spunTeam, ticketPrinting]);

  const beginAttempt = () => {
    if (mine.finished || mine.attemptsRemaining <= 0 || busy) return;
    setPending(null);
    setSelectedId(null);
    setOffers([]);
    setSpunTeam(null);
    setSpunEra(null);
    setTicketPrinting(true);
  };

  const decide = async (didTrade: boolean) => {
    if (mine.finished || busy) return;
    if (didTrade && !pending) return;
    setBusy(true);
    setLocalError(null);
    try {
      await applyH2HTradeUpDecision(roomId, didTrade, didTrade && pending ? { ...pending } : null);
      setPending(null);
      setSpunTeam(null);
      setSpunEra(null);
      setOffers([]);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  };

  if (finished) {
    return (
      <div className="h2h-lobby h2h-lobby--results" aria-label="Trade Up results">
        <header className="h2h-lobby__header">
          <p className="h2h-lobby__eyebrow">TRADE UP · FINAL</p>
          <h1 className="h2h-lobby__title">
            {iWin ? `${myName.toUpperCase()} WINS` : theyWin ? `${opponentName.toUpperCase()} WINS` : 'TIE GAME'}
          </h1>
        </header>
        <div className="h2h-results__grid">
          <div className={`h2h-results__card${iWin ? ' is-winner' : ''}`}>
            <strong>{myName}</strong>
            <p className="h2h-results__total">{formatDollarsExact(mine.current.dollarValue)}</p>
            <p>{mine.current.name}</p>
          </div>
          <div className={`h2h-results__card${theyWin ? ' is-winner' : ''}`}>
            <strong>{opponentName}</strong>
            <p className="h2h-results__total">{formatDollarsExact(theirs.current.dollarValue)}</p>
            <p>{theirs.current.name}</p>
          </div>
        </div>
        {error || localError ? (
          <p className="h2h-lobby__error" role="alert">
            {error || localError}
          </p>
        ) : null}
        {isHost ? (
          <button type="button" className="run-btn run-btn--primary h2h-lobby__submit" disabled={rematchBusy} onClick={onRematch}>
            <strong>{rematchBusy ? 'STARTING…' : 'RUN IT BACK'}</strong>
          </button>
        ) : (
          <p className="h2h-lobby__waiting h2h-lobby__waiting--ready">Waiting for host…</p>
        )}
        <button type="button" className="run-btn run-btn--secondary h2h-lobby__submit" onClick={onExit}>
          <strong>BACK TO 1V1</strong>
        </button>
      </div>
    );
  }

  return (
    <div className="tradeup-shell tradeup-shell--game billion-shell billion-shell--h2h billion-shell--picking">
      <GameBackground />
      <header className="billion-top billion-top--h2h">
        <button type="button" className="tu-back" onClick={onExit}>
          ← Leave
        </button>
        <div className="billion-h2h-bar">
          <span>TRADE UP</span>
          <em>
            {mine.attemptsRemaining} left · {formatDollarsExact(mine.current.dollarValue)}
          </em>
        </div>
      </header>

      <div className="h2h-tradeup-status">
        <p>
          You: <strong>{mine.current.name}</strong> ({formatDollarsExact(mine.current.dollarValue)})
        </p>
        <p>
          {opponentName}: {theirs.finished ? 'Done' : `${theirs.attemptsRemaining} left`} ·{ }
          {formatDollarsExact(theirs.current.dollarValue)}
        </p>
      </div>

      {localError ? (
        <p className="h2h-lobby__error" role="alert">
          {localError}
        </p>
      ) : null}

      {mine.finished ? (
        <p className="h2h-lobby__waiting h2h-lobby__waiting--ready">Waiting for opponent to finish…</p>
      ) : pending ? (
        <div className="h2h-lobby">
          <p className="h2h-lobby__title">{pending.name}</p>
          <p className="h2h-lobby__subtitle">{formatDollarsExact(pending.dollarValue)}</p>
          <button type="button" className="run-btn run-btn--primary h2h-lobby__submit" disabled={busy} onClick={() => void decide(true)}>
            <strong>TRADE</strong>
            <span>Replace your current player</span>
          </button>
          <button type="button" className="run-btn run-btn--secondary h2h-lobby__submit" disabled={busy} onClick={() => void decide(false)}>
            <strong>PASS</strong>
            <span>Keep {mine.current.name}</span>
          </button>
        </div>
      ) : !ready ? (
        <div className={`billion-booth-stage${ticketPrinting ? ' is-printing' : ''}`}>
          <BallionTicketMachine
            locked={lockedPair}
            printing={ticketPrinting}
            canRerollTeam={false}
            canRerollEra={false}
            reduceMotion={reduceMotion}
            autoReroll={boothReroll}
            rerollFrom={null}
            holdTeam={spunTeam}
            holdEra={spunEra}
            showGoal={false}
            onAutoRerollConsumed={() => setBoothReroll(null)}
            onPrint={() => {
              setTicketPrinting(true);
              setOffers([]);
              setSelectedId(null);
            }}
            onResult={(pair: SpinPair) => {
              setSpunTeam(pair.team);
              setSpunEra(pair.era);
              setTicketPrinting(false);
            }}
            onReroll={() => undefined}
          />
          {!ticketPrinting && !spunTeam ? (
            <button type="button" className="run-btn run-btn--primary h2h-lobby__submit" onClick={beginAttempt}>
              <strong>SPIN TEAM + ERA</strong>
              <span>
                Attempt {TRADE_UP_ATTEMPTS - mine.attemptsRemaining + 1} of {TRADE_UP_ATTEMPTS}
              </span>
            </button>
          ) : null}
        </div>
      ) : spunTeam && spunEra ? (
        <div className="billion-pick-stage">
          <FranchisePickScreen
            team={spunTeam}
            era={spunEra}
            offers={offers}
            openPositions={['PG', 'SG', 'SF', 'PF', 'C']}
            selectedId={selectedId}
            canRerollTeam={false}
            canRerollEra={false}
            hint="Pick any player, then Trade or Pass."
            onSelect={(player) => setSelectedId((id) => (id === player.id ? null : player.id))}
            onReroll={() => undefined}
          />
          <button
            type="button"
            className="run-btn run-btn--primary h2h-lobby__submit"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              setPending({
                name: selected.name,
                teamId: selected.teamId,
                teamName: TEAMS.find((t) => t.id === selected.teamId)?.fullName ?? selected.teamId,
                era: String(selected.sourceEra ?? spunEra),
                dollarValue: Math.round(getDollarValue(selected)),
                playerId: selected.id,
              });
            }}
          >
            <strong>REVIEW PLAYER</strong>
          </button>
        </div>
      ) : null}
    </div>
  );
}
