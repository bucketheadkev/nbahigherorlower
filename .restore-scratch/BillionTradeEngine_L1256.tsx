'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BILLION_GOAL,
  formatDollarsExact,
  sumTeamValue,
  type SpinPair,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import {
  type DraftTicket,
  formatTicketHeadline,
  generateTradeUpOptions,
  pickPrintedPlayer,
} from '@/lib/tradeup/draftRun';
import {
  saveBestFourPlayerSum,
  saveBestRosterValue,
  saveBestWorldRank,
} from '@/lib/tradeup/storage';
import {
  getWorldRank,
  sumTopPlayerValues,
} from '@/lib/tradeup/worldLeaderboard';
import { playGameSound, playSlotPlaceSound } from '@/lib/tradeup/gameAudio';
import { hapticSlotConfirm, hapticTap } from '@/lib/tradeup/haptics';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { GameBackground } from './game/GameBackground';
import { TicketDispenser } from './TicketDispenser';
import { TradeTokenMachine } from './TradeTokenMachine';
import { ValueRevealMachine } from './ValueRevealMachine';
import { TradeUpLogo } from './TradeUpLogo';

interface BillionTradeEngineProps {
  onExit: () => void;
  onPlayAgain?: () => void;
  onWin?: () => void;
}

type Phase =
  | 'tokens'
  | 'draft'
  | 'tradeUp'
  | 'transition'
  | 'reveal';

/**
 * Redesigned run loop:
 * Trade Tokens → print 5 player tickets (optional Trade Up) → Assay Vault.
 */
export function BillionTradeEngine({
  onExit,
  onPlayAgain,
  onWin,
}: BillionTradeEngineProps) {
  const reduceMotion = getPrefersReducedMotion();
  const { resume, playTap, playVictory, playDefeat, playUiBack } = useSound();

  const [phase, setPhase] = useState<Phase>('tokens');
  const [tradeTokens, setTradeTokens] = useState(0);
  const [tickets, setTickets] = useState<DraftTicket[]>([]);
  const [pending, setPending] = useState<DraftTicket | null>(null);
  const [lockedPair, setLockedPair] = useState<SpinPair | null>(null);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [tradeOptions, setTradeOptions] = useState<DraftTicket[]>([]);
  const [tradeProcessing, setTradeProcessing] = useState(false);
  const [status, setStatus] = useState<string | null>(
    'Dispense Trade Up Tokens to begin.',
  );
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [worldRank, setWorldRank] = useState(0);

  const teamValue = useMemo(() => sumTeamValue(tickets), [tickets]);
  const slotsFilled = tickets.length;
  const headline =
    pending && lockedPair
      ? formatTicketHeadline(lockedPair.team, lockedPair.era)
      : null;

  const finishRun = useCallback(
    (finalValue: number) => {
      const prevBest = saveBestRosterValue(finalValue);
      const isBest = finalValue > prevBest;
      const fourSum = sumTopPlayerValues(tickets, 4);
      saveBestFourPlayerSum(fourSum);
      const rank = getWorldRank(finalValue);
      if (rank > 0) saveBestWorldRank(rank);
      setPersonalBest(Math.max(prevBest, finalValue));
      setIsNewPersonalBest(isBest);
      setWorldRank(rank);
      if (finalValue >= BILLION_GOAL) {
        playVictory();
        onWin?.();
      } else {
        playDefeat();
      }
      return {
        personalBest: Math.max(prevBest, finalValue),
        isNewPersonalBest: isBest,
        worldRank: rank,
      };
    },
    [onWin, playDefeat, playVictory, tickets],
  );

  const handleTokensComplete = useCallback(
    (tokens: number) => {
      resume();
      setTradeTokens(tokens);
      setPhase('draft');
      setStatus(
        tokens > 0
          ? `${tokens} Trade Up Token${tokens === 1 ? '' : 's'} ready. Print your first ticket.`
          : 'No Trade Up Tokens — print five tickets carefully.',
      );
    },
    [resume],
  );

  const handleTicketPrint = useCallback(() => {
    if (phase !== 'draft' || ticketPrinting || pending) return;
    if (tickets.length >= 5) return;
    resume();
    playTap();
    setLockedPair(null);
    setPending(null);
    setTicketPrinting(true);
    setStatus('Spinning franchise & decade…');
  }, [phase, pending, playTap, resume, ticketPrinting, tickets.length]);

  const handleTicketResult = useCallback(
    (pair: SpinPair) => {
      const printed = pickPrintedPlayer(pair, tickets);
      setLockedPair(pair);
      setPending(printed);
      setTicketPrinting(false);
      setStatus(`${formatTicketHeadline(pair.team, pair.era)} — tap ticket to collect.`);
    },
    [tickets],
  );

  const resetForNextPrint = useCallback(() => {
    setLockedPair(null);
    setPending(null);
    setTradeOptions([]);
    setTradeProcessing(false);
    if (tickets.length + 1 >= 5) {
      // caller handles transition when pushing 5th
      return;
    }
    setPhase('draft');
    setStatus(`Ticket ${tickets.length + 1}/5 locked. Print the next ticket.`);
  }, [tickets.length]);

  const lockTicket = useCallback(
    (ticket: DraftTicket) => {
      playSlotPlaceSound();
      hapticSlotConfirm();
      const next = [...tickets, ticket];
      setTickets(next);
      setPending(null);
      setLockedPair(null);
      setTradeOptions([]);
      setPhase('draft');

      if (next.length >= 5) {
        setStatus('Five tickets locked — opening the Assay Vault…');
        setPhase('transition');
        window.setTimeout(
          () => setPhase('reveal'),
          reduceMotion ? 220 : 680,
        );
        return;
      }

      setStatus(`Ticket ${next.length}/5 locked. Print the next ticket.`);
    },
    [reduceMotion, tickets],
  );

  const handleCollect = useCallback(() => {
    if (!pending || phase !== 'draft') return;
    resume();
    // After collect, player may Trade Up once before locking
    setStatus(
      tradeTokens > 0 && !pending.tradedUp
        ? 'Collected. Trade Up or keep this ticket.'
        : 'Collected. Locking into your five…',
    );
    if (tradeTokens <= 0 || pending.tradedUp) {
      lockTicket({ ...pending, tradedUp: true });
      return;
    }
    // Stay on draft with pending collected — show Trade Up CTA
    setPending({ ...pending });
  }, [lockTicket, pending, phase, resume, tradeTokens]);

  // After collect with tokens: we need a "collected" state where ticket is held
  // and user chooses Keep vs Trade Up. Re-use pending + a flag.
  const [collected, setCollected] = useState(false);

  const handleCollectTicket = useCallback(() => {
    if (!pending || phase !== 'draft' || collected) return;
    resume();
    playGameSound('ui_confirm');
    hapticTap();
    setCollected(true);
    setStatus(
      tradeTokens > 0 && !pending.tradedUp
        ? `Trade Up (${tradeTokens}) or keep ${pending.name}.`
        : `Keeping ${pending.name}…`,
    );
    if (tradeTokens <= 0 || pending.tradedUp) {
      window.setTimeout(() => {
        lockTicket({ ...pending, tradedUp: true });
        setCollected(false);
      }, reduceMotion ? 120 : 420);
    }
  }, [
    collected,
    lockTicket,
    pending,
    phase,
    reduceMotion,
    resume,
    tradeTokens,
  ]);

  const handleKeep = useCallback(() => {
    if (!pending || !collected) return;
    playGameSound('ui_confirm');
    hapticTap();
    lockTicket({ ...pending, tradedUp: true });
    setCollected(false);
  }, [collected, lockTicket, pending]);

  const handleStartTradeUp = useCallback(() => {
    if (!pending || !collected || tradeTokens <= 0 || pending.tradedUp) return;
    resume();
    playGameSound('ui_confirm');
    hapticTap();
    setTradeProcessing(true);
    setPhase('tradeUp');
    setStatus('TRADE UP MODE — inserting ticket…');

    window.setTimeout(() => {
      const options = generateTradeUpOptions(pending, tickets);
      setTradeOptions(options);
      setTradeProcessing(false);
      setStatus('Pick one ticket — or keep your original.');
      playGameSound('success_soft');
    }, reduceMotion ? 200 : 900);
  }, [collected, pending, reduceMotion, resume, tickets, tradeTokens]);

  const handleTradePick = useCallback(
    (option: DraftTicket | 'keep') => {
      if (!pending || phase !== 'tradeUp') return;
      playGameSound('ui_confirm');
      hapticTap();
      const chosen =
        option === 'keep'
          ? { ...pending, tradedUp: true }
          : { ...option, tradedUp: true };
      setTradeTokens((t) => Math.max(0, t - 1));
      setTradeOptions([]);
      setCollected(false);
      lockTicket(chosen);
    },
    [lockTicket, pending, phase],
  );

  const rosterForVault: ValuedPlayer[] = tickets;

  return (
    <div
      className={`tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820${
        phase === 'draft' || phase === 'tradeUp' ? ' billion-shell--picking' : ''
      }${phase === 'transition' ? ' billion-shell--vault-transition' : ''}${
        phase === 'reveal' ? ' billion-shell--vault' : ''
      }`}
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
          {phase === 'tokens'
            ? 'Tokens'
            : phase === 'reveal'
              ? 'Vault'
              : `${slotsFilled}/5`}
        </span>
      </header>

      {phase === 'tokens' ? (
        <div className="billion-main billion-main--draft">
          <TradeTokenMachine onComplete={handleTokensComplete} />
        </div>
      ) : null}

      {phase === 'transition' ? (
        <div className="value-vault-transition" aria-live="polite">
          <div className="value-vault-transition__beam" aria-hidden />
          <p className="value-vault-transition__eyebrow">Assay Vault</p>
          <h2 className="value-vault-transition__title">Feeding five tickets…</h2>
        </div>
      ) : null}

      {phase === 'reveal' ? (
        <ValueRevealMachine
          roster={rosterForVault}
          reduceMotion={reduceMotion}
          personalBest={personalBest}
          isNewPersonalBest={isNewPersonalBest}
          worldRank={worldRank}
          onComplete={({ teamValue: total }) => finishRun(total)}
          onExit={onExit}
          onPlayAgain={onPlayAgain ?? onExit}
        />
      ) : null}

      {(phase === 'draft' || phase === 'tradeUp') && (
        <div className="billion-draft-layout billion-draft-layout--no-value">
          <div className="billion-main billion-main--draft">
            <div className="draft-run-bar">
              <span className="draft-run-bar__tokens">
                Trade Up Tokens: <strong>{tradeTokens}</strong>
              </span>
              <span className="draft-run-bar__slots">{slotsFilled}/5 tickets</span>
            </div>

            {status ? <p className="billion-status">{status}</p> : null}

            {phase === 'draft' ? (
              <>
                <TicketDispenser
                  locked={lockedPair}
                  printing={ticketPrinting}
                  reduceMotion={reduceMotion}
                  playerName={pending?.name ?? null}
                  ticketHeadline={headline}
                  collectible={Boolean(pending) && !collected}
                  onPrint={handleTicketPrint}
                  onResult={handleTicketResult}
                  onCollect={handleCollectTicket}
                />

                {collected && pending ? (
                  <div className="draft-decision">
                    <p className="draft-decision__name">{pending.name}</p>
                    <div className="draft-decision__row">
                      {tradeTokens > 0 && !pending.tradedUp ? (
                        <button
                          type="button"
                          className="draft-decision__trade"
                          onClick={handleStartTradeUp}
                        >
                          Trade Up ({tradeTokens})
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="draft-decision__keep"
                        onClick={handleKeep}
                      >
                        Keep Ticket
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {phase === 'tradeUp' ? (
              <div className="tradeup-mode">
                <div
                  className={`tradeup-mode__machine${
                    tradeProcessing ? ' is-processing' : ''
                  }`}
                >
                  <p className="tradeup-mode__eyebrow">TRADE UP MODE</p>
                  <p className="tradeup-mode__original">
                    Original: {pending?.name}
                  </p>
                </div>

                {tradeProcessing ? (
                  <p className="tradeup-mode__busy">Printing three new tickets…</p>
                ) : (
                  <>
                    <div className="tradeup-fan" role="list">
                      {tradeOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className="tradeup-fan__card"
                          role="listitem"
                          onClick={() => handleTradePick(opt)}
                        >
                          <span className="tradeup-fan__era">
                            {formatTicketHeadline(opt.team, opt.era)}
                          </span>
                          <strong className="tradeup-fan__name">{opt.name}</strong>
                          <span className="tradeup-fan__pick">Select</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="tradeup-mode__keep"
                      onClick={() => handleTradePick('keep')}
                    >
                      Keep original ticket
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {tickets.length > 0 ? (
              <div className="draft-ticket-rail" aria-label="Collected tickets">
                {tickets.map((t, i) => (
                  <div key={`${t.id}-${i}`} className="draft-ticket-rail__item">
                    <span className="draft-ticket-rail__era">
                      {formatTicketHeadline(t.team, t.era)}
                    </span>
                    <strong>{t.name}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// silence unused in case of tree shakes
void formatDollarsExact;
void resetForNextPrint;
void handleCollect;
