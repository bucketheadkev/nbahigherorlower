'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BILLION_GOAL,
  type SpinPair,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import {
  type DraftTicket,
  currentDraftPosition,
  formatTicketHeadline,
  generateTradeUpOptions,
  listSpinPairsForPosition,
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
import {
  hapticMedium,
  hapticSlotConfirm,
  hapticSuccess,
  hapticTap,
} from '@/lib/tradeup/haptics';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position } from '@/lib/tradeup/types';
import { GameBackground } from './game/GameBackground';
import { TicketDispenser } from './TicketDispenser';
import { TradeTokenMachine } from './TradeTokenMachine';
import { ValueRevealMachine } from './ValueRevealMachine';
import { TradeUpLogo } from './TradeUpLogo';
import { PositionDock } from './PositionDock';
import { TokenInventory } from './TokenInventory';

interface BillionTradeEngineProps {
  onExit: () => void;
  onPlayAgain?: () => void;
  onWin?: () => void;
}

type Phase =
  | 'tokens'
  | 'draft'
  | 'tradeUp'
  | 'tease'
  | 'reveal';

type TradeAnim =
  | null
  | 'fly'
  | 'slot'
  | 'power'
  | 'spin'
  | 'print';

/**
 * Run loop:
 * Tokens → print PG→C tickets (optional Trade Up) → billion tease → Assay Vault.
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
  const [tradeAnim, setTradeAnim] = useState<TradeAnim>(null);
  const [shreddingIds, setShreddingIds] = useState<Set<string>>(() => new Set());
  const [collected, setCollected] = useState(false);
  const [tokenSpending, setTokenSpending] = useState(false);
  const [status, setStatus] = useState<string | null>(
    'Dispense Trade Up Tokens to begin.',
  );
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [worldRank, setWorldRank] = useState(0);

  const currentSlot: Position = currentDraftPosition(tickets.length);
  const spinPairs = useMemo(
    () => listSpinPairsForPosition(currentSlot, 70),
    [currentSlot],
  );

  const headline =
    pending
      ? formatTicketHeadline(pending.team, pending.era)
      : lockedPair
        ? formatTicketHeadline(lockedPair.team, lockedPair.era)
        : null;

  const headlineColor = pending
    ? getTeamColors(pending.team.id).primary
    : lockedPair
      ? getTeamColors(lockedPair.team.id).primary
      : undefined;

  const finishRun = useCallback(
    (finalValue: number) => {
      const saved = saveBestRosterValue(finalValue);
      const fourSum = sumTopPlayerValues(
        tickets.map((t) => t.dollarValue),
        4,
      );
      saveBestFourPlayerSum(fourSum);
      const rank = getWorldRank(finalValue);
      if (rank > 0) saveBestWorldRank(rank);
      setPersonalBest(saved.best);
      setIsNewPersonalBest(saved.isNewBest);
      setWorldRank(rank);
      if (finalValue >= BILLION_GOAL) {
        playVictory();
        onWin?.();
      } else {
        playDefeat();
      }
      return {
        personalBest: saved.best,
        isNewPersonalBest: saved.isNewBest,
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
      setStatus(`Drafting ${POSITION_LABELS.PG}. Print your first ticket.`);
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
    setStatus(`Spinning ${POSITION_LABELS[currentSlot]}…`);
  }, [
    currentSlot,
    phase,
    pending,
    playTap,
    resume,
    ticketPrinting,
    tickets.length,
  ]);

  const handleTicketResult = useCallback(
    (pair: SpinPair) => {
      const printed = pickPrintedPlayer(pair, tickets, currentSlot);
      // Display identity always matches the historical ticket row
      setLockedPair({ team: printed.team, era: printed.era });
      setTicketPrinting(false);
      setCollected(false);
      setStatus(
        `${formatTicketHeadline(printed.team, printed.era)} — revealing…`,
      );
      window.setTimeout(() => {
        setPending(printed);
        hapticSuccess();
        playGameSound('reveal_standard');
        setStatus(
          `${formatTicketHeadline(printed.team, printed.era)} — tap to collect.`,
        );
      }, reduceMotion ? 60 : 420);
    },
    [currentSlot, reduceMotion, tickets],
  );

  const lockTicket = useCallback(
    (ticket: DraftTicket) => {
      playSlotPlaceSound();
      hapticSlotConfirm();
      const next = [...tickets, { ...ticket, slot: ticket.slot || currentSlot }];
      setTickets(next);
      setPending(null);
      setLockedPair(null);
      setTradeOptions([]);
      setCollected(false);
      setTradeAnim(null);
      setTokenSpending(false);
      setPhase('draft');

      if (next.length >= 5) {
        setStatus(null);
        setPhase('tease');
        window.setTimeout(
          () => setPhase('reveal'),
          reduceMotion ? 900 : 2800,
        );
        return;
      }

      const nextSlot = currentDraftPosition(next.length);
      setStatus(`Locked. Drafting ${POSITION_LABELS[nextSlot]} next.`);
    },
    [currentSlot, reduceMotion, tickets],
  );

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
    if (tradeAnim) return;
    resume();
    playGameSound('ui_confirm');
    hapticTap();
    setTokenSpending(true);
    setPhase('tradeUp');
    setTradeAnim('fly');
    setStatus('Inserting Trade Up Token…');

    const step = (next: TradeAnim, delay: number, label: string, sfx?: string) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          setTradeAnim(next);
          setStatus(label);
          if (sfx) playGameSound(sfx as 'ui_confirm');
          hapticMedium();
          resolve();
        }, delay);
      });

    void (async () => {
      if (reduceMotion) {
        const options = generateTradeUpOptions(pending, tickets, currentSlot);
        setTradeOptions(options);
        setTradeAnim(null);
        setTokenSpending(false);
        setStatus('Pick one ticket — or keep your original.');
        playGameSound('bank_coin');
        return;
      }

      await step('slot', 520, 'Token seated…', 'slot_place');
      await step('power', 480, 'Machine powering on…', 'ui_secondary');
      await step('spin', 700, 'Trade Up spinning…', 'ui_confirm');
      await step('print', 900, 'Printing three new tickets…', 'ticket_ding');

      const options = generateTradeUpOptions(pending, tickets, currentSlot);
      setTradeOptions(options);
      setTradeAnim(null);
      setTokenSpending(false);
      setStatus('Pick one ticket — or keep your original.');
      playGameSound('bank_coin');
      hapticSuccess();
    })();
  }, [
    collected,
    currentSlot,
    pending,
    reduceMotion,
    resume,
    tickets,
    tradeAnim,
    tradeTokens,
  ]);

  const handleTradePick = useCallback(
    (option: DraftTicket | 'keep') => {
      if (!pending || phase !== 'tradeUp' || shreddingIds.size > 0) return;
      if (tradeAnim) return;
      playGameSound('ui_confirm');
      hapticTap();

      const chosenId = option === 'keep' ? null : option.id;
      const rejectIds = tradeOptions
        .filter((o) => o.id !== chosenId)
        .map((o) => o.id);
      setShreddingIds(new Set(rejectIds));
      playGameSound('ticket_tear');

      const chosen =
        option === 'keep'
          ? { ...pending, tradedUp: true, slot: currentSlot }
          : { ...option, tradedUp: true, slot: currentSlot };

      window.setTimeout(() => {
        setTradeTokens((t) => Math.max(0, t - 1));
        setTradeOptions([]);
        setShreddingIds(new Set());
        setCollected(false);
        lockTicket(chosen);
      }, reduceMotion ? 120 : 520);
    },
    [
      currentSlot,
      lockTicket,
      pending,
      phase,
      reduceMotion,
      shreddingIds.size,
      tradeAnim,
      tradeOptions,
    ],
  );

  const rosterForVault: ValuedPlayer[] = tickets;
  const tradeBusy = tradeAnim !== null;

  return (
    <div
      className={`tradeup-shell tradeup-shell--game billion-shell billion-shell--draft820${
        phase === 'draft' || phase === 'tradeUp' ? ' billion-shell--picking' : ''
      }${phase === 'tease' ? ' billion-shell--vault-transition' : ''}${
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
            : phase === 'reveal' || phase === 'tease'
              ? 'Vault'
              : POSITION_LABELS[currentSlot]}
        </span>
      </header>

      {phase === 'tokens' ? (
        <div className="billion-main billion-main--draft">
          <TradeTokenMachine onComplete={handleTokensComplete} />
        </div>
      ) : null}

      {phase === 'tease' ? (
        <div className="billion-tease" aria-live="polite">
          <div className="billion-tease__glow" aria-hidden />
          <p className="billion-tease__eyebrow">Final Board</p>
          <h2 className="billion-tease__title">
            Is Your Team Worth
            <span> $1 Billion?</span>
          </h2>
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
        <div className="billion-draft-layout billion-draft-layout--positions">
          <div className="billion-main billion-main--draft">
            <TokenInventory
              count={tradeTokens}
              spending={tokenSpending}
            />

            {status ? <p className="billion-status">{status}</p> : null}

            <p className="draft-slot-banner" aria-live="polite">
              <span className="draft-slot-banner__kicker">Now drafting</span>
              <strong>{POSITION_LABELS[currentSlot]}</strong>
            </p>

            {phase === 'draft' ? (
              <>
                <TicketDispenser
                  key={`print-${tickets.length}-${currentSlot}`}
                  locked={lockedPair}
                  printing={ticketPrinting}
                  reduceMotion={reduceMotion}
                  spinPairs={spinPairs}
                  playerName={pending?.name ?? null}
                  ticketHeadline={headline}
                  ticketHeadlineColor={headlineColor}
                  ticketSerial={pending?.serial ?? null}
                  ticketId={pending?.ticketId ?? null}
                  collectible={Boolean(pending) && !collected}
                  tradeTokenSlot
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
                          Trade Up
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
              <div
                className={`tradeup-mode${tradeBusy ? ` is-${tradeAnim}` : ''}`}
              >
                <div
                  className={`tradeup-mode__machine${
                    tradeBusy ? ' is-processing' : ''
                  }${tradeAnim === 'power' || tradeAnim === 'spin' || tradeAnim === 'print' ? ' is-powered' : ''}`}
                >
                  <div className="tradeup-mode__token-slot" aria-hidden>
                    <span
                      className={`tradeup-mode__token-fly${
                        tradeAnim === 'fly' || tradeAnim === 'slot'
                          ? ' is-active'
                          : ''
                      }${tradeAnim === 'slot' || tradeAnim === 'power' || tradeAnim === 'spin' || tradeAnim === 'print' ? ' is-seated' : ''}`}
                    >
                      TU
                    </span>
                  </div>
                  <p className="tradeup-mode__eyebrow">TRADE UP MODE</p>
                  <p className="tradeup-mode__original">
                    {POSITION_LABELS[currentSlot]} · {pending?.name}
                  </p>
                  <div
                    className={`tradeup-mode__lights${
                      tradeAnim === 'power' ||
                      tradeAnim === 'spin' ||
                      tradeAnim === 'print'
                        ? ' is-on'
                        : ''
                    }`}
                    aria-hidden
                  >
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>

                {tradeBusy ? (
                  <div className="tradeup-mode__insert" aria-live="polite">
                    <span className="tradeup-mode__insert-ticket" aria-hidden />
                    <p className="tradeup-mode__busy">
                      {tradeAnim === 'fly' && 'Token flying to the machine…'}
                      {tradeAnim === 'slot' && 'Seating token…'}
                      {tradeAnim === 'power' && 'Lights online…'}
                      {tradeAnim === 'spin' && 'Reels spinning…'}
                      {tradeAnim === 'print' && 'Printing upgraded tickets…'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="tradeup-fan" role="list">
                      {tradeOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`tradeup-fan__card${
                            shreddingIds.has(opt.id) ? ' is-shredding' : ''
                          }`}
                          style={{
                            borderColor: `${getTeamColors(opt.team.id).primary}99`,
                          }}
                          role="listitem"
                          disabled={shreddingIds.size > 0}
                          onClick={() => handleTradePick(opt)}
                        >
                          <span
                            className="tradeup-fan__era"
                            style={{ color: getTeamColors(opt.team.id).primary }}
                          >
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
                      disabled={shreddingIds.size > 0}
                      onClick={() => handleTradePick('keep')}
                    >
                      Keep original ticket
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <PositionDock
            tickets={tickets}
            currentSlot={currentSlot}
            pending={collected ? pending : null}
          />
        </div>
      )}
    </div>
  );
}
