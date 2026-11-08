'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { buildEraRoster, type EraOfferPlayer, type SpinPair } from '@/lib/tradeup/billionDollar';
import { playPlaceClickSound, stopWheelSpinSound } from '@/lib/tradeup/gameAudio';
import { hapticLight, hapticSlam, hapticSuccess, hapticWarning } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { rolloverFor } from '@/lib/tradeup/rollover';
import { contrastOnPrimary, getTeamColors, teamGlowColor } from '@/lib/tradeup/teamColors';
import { getTeam } from '@/lib/tradeup/teams';
import type { Position } from '@/lib/tradeup/types';
import { BallionTicketMachine } from '../BallionTicketMachine';
import { ClassicRosterReveal } from '../ClassicRosterReveal';
import { DraftHubCards } from '../DraftHubCards';
import { FranchisePickScreen } from '../FranchisePickScreen';
import { CourtJersey, jerseyInitials } from '../draft/CourtJersey';
import { DraftSheet } from '../draft/DraftSheet';
import {
  BUTTONS,
  EMPTY_SLOTS,
  FINAL_FIVE,
  FINAL_SLOTS,
  FINAL_TOTAL,
  GOAL,
  KOBE,
  kobeBoard,
  kobeSpinPair,
  LABELS,
  LEBRON,
  LEBRON_LAL,
  NUDGES,
  seat,
  seatedValue,
  STEPS,
  type IntroSlots,
} from './introData';
import { CHROME, pick, type Copy } from './onboardingCopy';
import { TickerNumber } from './ticker';

type Step =
  | 'goal'
  | 'values'
  | 'spin'
  | 'spinning'
  | 'pick'
  | 'placeSf'
  | 'penalty'
  | 'moveSg'
  | 'moving'
  | 'restored'
  | 'fill'
  | 'evaluating'
  | 'result'
  | 'bank'
  | 'done';

const STAGE_OF: Record<Step, 0 | 1 | 2> = {
  goal: 0,
  values: 0,
  spin: 1,
  spinning: 1,
  pick: 1,
  placeSf: 1,
  penalty: 1,
  moveSg: 1,
  moving: 1,
  restored: 1,
  fill: 1,
  evaluating: 2,
  result: 2,
  bank: 2,
  done: 2,
};

const COPY_OF: Record<Step, keyof typeof STEPS> = {
  goal: 'goal',
  values: 'values',
  spin: 'spin',
  spinning: 'spin',
  pick: 'place',
  placeSf: 'place',
  penalty: 'penalty',
  moveSg: 'moveSg',
  moving: 'moveSg',
  restored: 'restored',
  fill: 'fill',
  evaluating: 'result',
  result: 'result',
  bank: 'bank',
  done: 'done',
};

const ALL_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
/** The four practice teammates, in the order they walk on. */
const FILL_ORDER: Position[] = ['PG', 'SF', 'PF', 'C'];
const FILL_STEP_MS = 140;
const FADE = { duration: 0.2, ease: [0.22, 1, 0.36, 1] } as const;

interface OnboardingProps {
  /** Skip — back to the main menu (marked as seen). */
  onDone: () => void;
  /** START MY FIRST RUN — straight into a normal Classic run (marked as seen). */
  onPlay: () => void;
}

/**
 * First-run tutorial on the real Classic arena: the $1B challenge, how a player's value changes
 * between team/era versions, a real spin → pick → place → move between eligible positions, the practice
 * five's real valuation and the Bank. Instructions always sit at the top, the one orange button
 * at the bottom. A demo only — nothing is saved, credited or counted.
 */
export function Onboarding({ onDone, onPlay }: OnboardingProps) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const t = useCallback((copy: Copy) => pick(copy, locale), [locale]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const nudgeTimer = useRef(0);

  const [step, setStep] = useState<Step>('goal');
  const [pair, setPair] = useState<SpinPair | null>(null);
  const [slots, setSlots] = useState<IntroSlots>(EMPTY_SLOTS);
  const [nudge, setNudge] = useState<Copy | null>(null);
  const [filled, setFilled] = useState(false);
  const [settled, setSettled] = useState(false);
  const [courtKey, setCourtKey] = useState(0);

  const stage = STAGE_OF[step];
  const lakers = getTeamColors(KOBE.teamId);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(nudgeTimer.current);
      stopWheelSpinSound();
    },
    [],
  );

  // The player sheet stops on top of the orange button, never over it.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const root = rootRef.current;
    if (!dock || !root) return;
    const sync = () => root.style.setProperty('--tut-dock-h', `${dock.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  const say = useCallback((copy: Copy) => {
    window.clearTimeout(nudgeTimer.current);
    setNudge(copy);
    nudgeTimer.current = window.setTimeout(() => setNudge(null), 1800);
  }, []);

  const go = useCallback((next: Step) => {
    window.clearTimeout(nudgeTimer.current);
    setNudge(null);
    setStep(next);
  }, []);

  /* ── Stage 2: the real spinner, list and court ─────────────── */

  const resolveRoll = useCallback(async () => kobeSpinPair(), []);
  const board = useMemo<EraOfferPlayer[]>(
    () => (pair ? kobeBoard(buildEraRoster(pair.team, pair.era)) : []),
    [pair],
  );

  /** The orange button runs the booth's own SPIN (same tap, so spin audio still unlocks). */
  const spin = () => {
    rootRef.current?.querySelector<HTMLButtonElement>('button.ter__roll')?.click();
  };

  const onSelect = useCallback(
    (player: EraOfferPlayer) => {
      if (step !== 'pick') return;
      if (player.id !== KOBE.id) {
        hapticWarning();
        say(NUDGES.pickKobe);
        return;
      }
      hapticLight();
      playPlaceClickSound();
      go('placeSf');
    },
    [go, say, step],
  );

  const onSlotPress = useCallback(
    (slot: Position) => {
      if (step === 'placeSf') {
        if (slot !== 'SF') {
          hapticWarning();
          say(NUDGES.tapSf);
          return;
        }
        hapticSlam();
        playPlaceClickSound();
        setSlots({ ...EMPTY_SLOTS, SF: seat(KOBE, 'SF') });
        go('penalty');
        return;
      }
      if (step === 'moveSg') {
        if (slot === 'SF') {
          hapticLight();
          go('moving');
        } else {
          say(NUDGES.tapKobe);
        }
        return;
      }
      if (step === 'moving') {
        if (slot === 'SF') {
          go('moveSg');
          return;
        }
        if (slot !== 'SG') {
          hapticWarning();
          say(NUDGES.tapSg);
          return;
        }
        hapticSlam();
        playPlaceClickSound();
        setSlots({ ...EMPTY_SLOTS, SG: seat(KOBE, 'SG') });
        go('restored');
      }
    },
    [go, say, step],
  );

  const targets = useMemo<Partial<Record<Position, boolean>> | undefined>(() => {
    if (step === 'placeSf') return { SF: true };
    if (step === 'moving') return { SG: true };
    return undefined;
  }, [step]);

  /** Kobe stays at SG; the other four walk on in quick succession on the same court. */
  const fillTeam = () => {
    go('fill');
    setFilled(false);
    FILL_ORDER.forEach((slot, i) => {
      later(reduceMotion ? 0 : 160 + i * FILL_STEP_MS, () => {
        setSlots((current) => ({ ...current, [slot]: FINAL_SLOTS[slot] }));
      });
    });
    later(reduceMotion ? 0 : 160 + FILL_ORDER.length * FILL_STEP_MS + 260, () => setFilled(true));
  };

  /* ── Stage 3: the real valuation, then the Bank ───────────── */

  const revealRoster = useMemo(
    () => FINAL_FIVE.map(([player, slot]) => ({ ...seat(player, slot), seatedSlot: slot })),
    [],
  );
  const bankEarned = rolloverFor(FINAL_TOTAL);

  const onTotalSettled = useCallback(() => {
    hapticSuccess();
    setSettled(true);
  }, []);

  /* ── Top: instructions; bottom: the one orange button ─────── */

  const copy = STEPS[COPY_OF[step]];
  const kobeSf = seatedValue(KOBE, 'SF');
  const kobeSg = seatedValue(KOBE, 'SG');

  const chip =
    step === 'penalty' || step === 'moveSg' || step === 'moving' ? (
      <span className="tut__value is-full">
        <b>KOBE · SF</b>
        <strong>{formatCash(kobeSf)}</strong>
        <em>✓ {t(LABELS.fullValue)}</em>
      </span>
    ) : step === 'restored' || step === 'fill' ? (
      <span className="tut__value is-full">
        <b>KOBE · SG</b>
        <strong>{formatCash(kobeSg)}</strong>
        <em>✓ {t(LABELS.fullValue)}</em>
      </span>
    ) : null;

  const action: { label: Copy; run?: () => void } =
    step === 'goal'
      ? { label: BUTTONS.showMe, run: () => (hapticLight(), go('values')) }
      : step === 'values'
        ? { label: BUTTONS.continue, run: () => (hapticLight(), go('spin')) }
        : step === 'spin'
          ? { label: BUTTONS.spin, run: spin }
          : step === 'spinning'
            ? { label: BUTTONS.spin }
            : step === 'penalty'
              ? { label: BUTTONS.continue, run: () => (hapticLight(), go('moveSg')) }
              : step === 'restored'
                ? { label: BUTTONS.continue, run: () => (hapticLight(), fillTeam()) }
                : step === 'fill'
                  ? { label: BUTTONS.evaluate, run: filled ? () => (hapticLight(), go('evaluating')) : undefined }
                  : step === 'evaluating' || step === 'result'
                    ? { label: BUTTONS.continue, run: settled ? () => (hapticLight(), go('bank')) : undefined }
                    : step === 'bank'
                      ? {
                          label: BUTTONS.continue,
                          run: () => {
                            hapticLight();
                            setCourtKey((k) => k + 1);
                            go('done');
                          },
                        }
                      : step === 'done'
                        ? { label: BUTTONS.start, run: () => (hapticSuccess(), onPlay()) }
                        : { label: BUTTONS.continue };

  /* ── View ─────────────────────────────────────────────────── */

  const sheetPresent = Boolean(pair) && (step === 'pick' || step === 'placeSf');
  const showBooth = stage === 1;
  const courtAnalyzing = step === 'evaluating' || step === 'result';
  const overlay: 'values' | 'reveal' | 'bank' | null =
    step === 'values' ? 'values' : courtAnalyzing ? 'reveal' : step === 'bank' ? 'bank' : null;

  return (
    <div
      ref={rootRef}
      className={`tut billion-shell--picking tut--stage-${stage + 1} tut--${step}${overlay ? ' has-overlay' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t(CHROME.label)}
    >
      <div className="tut__shell">
        <header className="tut__top">
          <div className="tut__bar">
            <span className="tut__bar-spacer" aria-hidden />
            <span className="tut__dots" role="img" aria-label={`${stage + 1} / 3`}>
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < stage ? 'is-done' : i === stage ? 'is-on' : undefined} />
              ))}
            </span>
            {/* Stays in the layout on the last screen (hidden) so the header never changes height. */}
            <button
              type="button"
              className="tut__skip"
              style={step === 'done' ? { visibility: 'hidden' } : undefined}
              tabIndex={step === 'done' ? -1 : undefined}
              onClick={() => (hapticLight(), onDone())}
            >
              {t(CHROME.skip)}
            </button>
          </div>
          <div className="tut__words" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={t(copy.title)}
                className="tut__words-in"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <h1 className="tut__title">{t(copy.title)}</h1>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={t(nudge ?? copy.line)}
                className={`tut__line${nudge ? ' is-nudge' : ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                {t(nudge ?? copy.line)}
              </motion.p>
            </AnimatePresence>
          </div>
          {stage === 1 ? <div className="tut__chip-row">{chip}</div> : null}
        </header>

        <main className="tut__center">
          <div className="billion-draft-layout billion-draft-layout--no-value billion-draft-layout--vertical-booth billion-draft-layout--classic-hub tut__play">
            <main className="billion-main billion-main--draft">
              {stage === 0 ? (
                <div className="tut__goal">
                  <span className="tut__goal-label">{t(LABELS.goal)}</span>
                  <span className="tut__goal-amount">{formatCash(GOAL)}</span>
                </div>
              ) : showBooth ? (
                <div className={`billion-booth-stage${step === 'spinning' ? ' is-printing' : ''}`}>
                  <BallionTicketMachine
                    locked={pair}
                    printing={step === 'spinning'}
                    canRerollTeam={false}
                    canRerollEra={false}
                    reduceMotion={reduceMotion}
                    holdTeam={pair?.team ?? null}
                    holdEra={pair?.era ?? null}
                    showGoal={false}
                    rollLocked={step !== 'spin'}
                    resolveRoll={resolveRoll}
                    onPrint={() => go('spinning')}
                    onResult={(landed) => {
                      setPair(landed);
                      go('pick');
                    }}
                    onReroll={() => undefined}
                  />
                </div>
              ) : null}
            </main>
            <DraftHubCards
              key={courtKey}
              slots={step === 'done' ? FINAL_SLOTS : slots}
              targetSlots={targets}
              primarySlot={step === 'moving' ? KOBE.primaryPosition : null}
              targetColor={targets ? teamGlowColor(KOBE.teamId) : null}
              targetPrimary={targets ? lakers.primary : null}
              movingSlot={step === 'moving' ? 'SF' : null}
              analyzing={courtAnalyzing}
              reduceMotion={reduceMotion}
              onSlotPress={stage === 1 ? onSlotPress : undefined}
              onAnalyzeComplete={() => go('result')}
            />
          </div>

          <AnimatePresence initial={false}>
            {overlay === 'values' ? (
              <motion.div key="values" className="tut__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                <LeBronVersions locale={locale} reduceMotion={reduceMotion} />
              </motion.div>
            ) : null}
            {overlay === 'reveal' && step === 'result' ? (
              <motion.div key="reveal" className="tut__overlay tut__overlay--reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                <ClassicRosterReveal
                  roster={revealRoster}
                  reduceMotion={reduceMotion}
                  skipAnalyze
                  fromCourtBeam
                  actions="none"
                  onComplete={() => undefined}
                  onTotalSettled={onTotalSettled}
                  onPlayAgain={() => undefined}
                />
              </motion.div>
            ) : null}
            {overlay === 'bank' ? (
              <motion.div key="bank" className="tut__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                <BankPanel locale={locale} earned={bankEarned} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>

        <footer ref={dockRef} className="tut__dock">
          <button
            type="button"
            className={`tut__cta${step === 'done' ? ' is-start' : ''}`}
            disabled={!action.run}
            onClick={action.run}
          >
            {t(action.label)}
          </button>
        </footer>
      </div>

      {pair ? (
        <DraftSheet
          present={sheetPresent}
          open={step === 'pick'}
          onOpenChange={() => undefined}
          anchorSelectors={['.tut__top']}
          label={t(CHROME.label)}
          peek={
            <span className="draft-sheet-peek">
              <span
                className="draft-sheet-peek__chip"
                style={{ background: lakers.primary, color: contrastOnPrimary(lakers.primary) }}
              >
                {jerseyInitials(KOBE.name)}
              </span>
              <span className="draft-sheet-peek__copy">
                <strong>{KOBE.name}</strong>
                <em>SG · SF</em>
              </span>
            </span>
          }
        >
          <div className="billion-pick-stage">
            <FranchisePickScreen
              team={pair.team}
              era={pair.era}
              offers={board}
              openPositions={ALL_POSITIONS}
              selectedId={step === 'pick' ? null : KOBE.id}
              canRerollTeam={false}
              canRerollEra={false}
              rerollsOff
              reduceMotion={reduceMotion}
              skipArrival
              hint=""
              onSelect={onSelect}
              onReroll={() => undefined}
            />
          </div>
        </DraftSheet>
      ) : null}
    </div>
  );
}

/** One LeBron, two team/era versions: the jersey and value change with the selected version. */
function LeBronVersions({ locale, reduceMotion }: { locale: string; reduceMotion: boolean }) {
  const versions = [LEBRON, LEBRON_LAL];
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);

  // Alternates on its own until the player picks a version.
  useEffect(() => {
    if (touched || reduceMotion) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % versions.length), 2200);
    return () => window.clearInterval(id);
  }, [reduceMotion, touched, versions.length]);

  const player = versions[index]!;
  const colors = getTeamColors(player.teamId);
  const t = (copy: Copy) => pick(copy, locale as 'en' | 'es');

  return (
    <div className="tut__lebron">
      <span
        className="tut__lebron-jersey"
        style={
          {
            '--slot-primary': colors.primary,
            '--slot-accent': colors.accent,
            '--slot-ink': contrastOnPrimary(colors.primary),
            '--slot-glow': teamGlowColor(player.teamId),
          } as CSSProperties
        }
      >
        <CourtJersey position={player.primaryPosition} playerName={player.name} />
      </span>
      <strong className="tut__lebron-name">{player.name.toUpperCase()}</strong>
      <div className="tut__toggle" role="tablist">
        {versions.map((version, i) => (
          <button
            key={version.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`tut__toggle-option${i === index ? ' is-on' : ''}`}
            style={{ '--opt': getTeamColors(version.teamId).primary } as CSSProperties}
            onClick={() => {
              hapticLight();
              setTouched(true);
              setIndex(i);
            }}
          >
            <span>{getTeam(version.teamId)?.name ?? version.teamId}</span>
            <em>{version.era}</em>
          </button>
        ))}
      </div>
      <TickerNumber className="tut__lebron-value" value={player.base} duration={520} />
      <p className="tut__lebron-note">{t(LABELS.valueNote)}</p>
    </div>
  );
}

/** Team value vs the goal, what goes to the Bank, and what the Bank is for. */
function BankPanel({ locale, earned }: { locale: string; earned: number }) {
  const t = (copy: Copy) => pick(copy, locale as 'en' | 'es');
  return (
    <div className="tut__bank">
      <div className="tut__bank-sum">
        <p className="tut__bank-row">
          <span>{t(LABELS.teamValue)}</span>
          <strong>{formatCash(FINAL_TOTAL)}</strong>
        </p>
        <p className="tut__bank-row">
          <span>{t(LABELS.goal)}</span>
          <strong>{formatCash(GOAL)}</strong>
        </p>
        <p className="tut__bank-row is-earned">
          <span>{t(LABELS.bankEarned)}</span>
          <strong>+{formatCash(earned)}</strong>
        </p>
      </div>
      <p className="tut__bank-heading">{t(LABELS.yourBank)}</p>
      <ul className="tut__bank-uses">
        <li>
          <BankIcon kind="board" />
          <span>{t(LABELS.leaderboard)}</span>
        </li>
        <li>
          <BankIcon kind="wall" />
          <span>{t(LABELS.wall)}</span>
        </li>
      </ul>
    </div>
  );
}

function BankIcon({ kind }: { kind: 'board' | 'wall' }) {
  return (
    <span className="tut__bank-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'board' ? (
          <path d="M5 20V12M12 20V5M19 20v-9" />
        ) : (
          <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
        )}
      </svg>
    </span>
  );
}
