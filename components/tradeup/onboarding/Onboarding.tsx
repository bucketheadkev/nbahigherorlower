'use client';

import { animate, AnimatePresence, motion, useMotionValue } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { Locale } from '@/lib/i18n/messages';
import { formatEligiblePositions, playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { playerInitials } from '@/lib/tradeup/draftRun';
import { playFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import {
  hapticLight,
  hapticSelection,
  hapticSlotConfirm,
  hapticSuccess,
  hapticWarning,
} from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position } from '@/lib/tradeup/types';
import { ArenaAtmosphere } from '../ArenaAtmosphere';
import { BillionCelebration } from '../BillionCelebration';
import { DraftHubCards } from '../DraftHubCards';
import {
  DIRECTIONS,
  DRAWS,
  FINISH,
  GOAL,
  HEADLINES,
  HINTS,
  INITIAL_SLOTS,
  KOBE,
  LABELS,
  LEBRON,
  METER_SCALE,
  MOMENT,
  seat,
  seatedValue,
  SUBLINES,
  type Direction,
  type IntroPhase,
  type IntroPlayer,
  type IntroSlots,
} from './introData';
import { DemoFinish, WelcomeScene } from './IntroScenes';
import { CHROME, pick, type Copy } from './onboardingCopy';
import { EASE_OUT, EASE_OUT_QUAD, easeOutQuad, money, TickerNumber } from './ticker';

type Source = 'offer' | Position;

interface Ghost {
  player: IntroPlayer;
  from: Source;
}

interface Readout {
  player: IntroPlayer;
  slot: Position;
  value: number;
  primary: boolean;
}

interface Point {
  x: number;
  y: number;
}

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const WASH_MS = 1080;
/** Final climb past $1B — one continuous count; the celebration lands when it finishes. */
const VICTORY_MS = 1300;
const DRAG_SLOP = 6;
const HIT_PAD = 18;
const SNAP = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } as const;
const CAMERA = { type: 'spring', stiffness: 60, damping: 18, mass: 1.1 } as const;

function fill(copy: Copy, locale: Locale, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), pick(copy, locale));
}

interface OnboardingProps {
  /** Skip or Get Started — back to the main menu. */
  onDone: () => void;
}

/**
 * Guided first-run tutorial: meet the most valuable legends, play a miniature Classic draft
 * on the real court to exactly $1,005,000,000, then practice Bank-or-Risk on what's over.
 * A controlled demo — nothing is saved, credited, or counted.
 */
export function Onboarding({ onDone }: OnboardingProps) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();

  const frameRef = useRef<HTMLDivElement | null>(null);
  const courtRef = useRef<HTMLDivElement | null>(null);
  const offerPosRef = useRef<HTMLSpanElement | null>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const [phase, setPhase] = useState<IntroPhase>('welcome');
  const [slots, setSlots] = useState<IntroSlots>(INITIAL_SLOTS);
  const [selected, setSelected] = useState<Source | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hover, setHover] = useState<Position | null>(null);
  const [impact, setImpact] = useState<{ slot: Position; color: string } | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [nudge, setNudge] = useState<{ text: Copy; key: number } | null>(null);
  const [crossed, setCrossed] = useState(false);
  /** Bank-or-Risk mounts after the celebration's first frames so the landing never hitches. */
  const [finishReady, setFinishReady] = useState(false);
  const [handle, setHandle] = useState<{ left: number; top: number; size: number } | null>(null);

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gs = useMotionValue(1);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  const offer = phase === 'build' ? KOBE : phase === 'cross' ? LEBRON : null;
  const draw = phase === 'cross' ? DRAWS.lebron : DRAWS.kobe;
  const drafting = phase === 'build' || phase === 'position' || phase === 'cross';
  const total = POSITIONS.reduce((sum, p) => sum + (slots[p]?.dollarValue ?? 0), 0);
  const kobeSlot = POSITIONS.find((p) => slots[p]?.id === KOBE.id) ?? null;

  /** Guided targets, always filtered through the real eligibility rules. */
  const targetsFor = useCallback(
    (source: Source | null): Position[] => {
      if (source === 'offer') {
        if (!offer) return [];
        return (['SF'] as Position[]).filter((s) => !slots[s] && playerFitsSlot(offer, s));
      }
      if (source && phase === 'position' && source === kobeSlot) {
        return (['SG'] as Position[]).filter((s) => !slots[s] && playerFitsSlot(KOBE, s));
      }
      return [];
    },
    [kobeSlot, offer, phase, slots],
  );

  const invite = phase === 'position' ? targetsFor(kobeSlot) : targetsFor('offer');
  const targetMap = useMemo(
    () => Object.fromEntries(invite.map((s) => [s, true])) as Partial<Record<Position, boolean>>,
    [invite],
  );

  /* ── Geometry ─────────────────────────────────────────────── */

  const frameBox = () => frameRef.current?.getBoundingClientRect() ?? null;

  const slotEl = (slot: Position) =>
    courtRef.current?.querySelector<HTMLElement>(`[data-draft-slot="${slot}"]`) ?? null;

  const centerIn = (el: Element | null): Point | null => {
    const box = frameBox();
    if (!el || !box) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
  };

  // Drag handle sits over the seated player during the position lesson.
  useLayoutEffect(() => {
    if (phase !== 'position' || !kobeSlot) {
      setHandle(null);
      return;
    }
    const place = () => {
      const court = courtRef.current;
      const el = slotEl(kobeSlot);
      if (!court || !el) return;
      const c = court.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) + 12;
      setHandle({
        left: r.left - c.left + r.width / 2 - size / 2,
        top: r.top - c.top + r.height / 2 - size / 2,
        size,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (courtRef.current) observer.observe(courtRef.current);
    return () => observer.disconnect();
  }, [kobeSlot, phase]);

  useEffect(() => {
    if (!hover) return;
    const el = slotEl(hover);
    el?.classList.add('is-drop-hover');
    return () => el?.classList.remove('is-drop-hover');
  }, [hover]);

  /* ── Outcomes ─────────────────────────────────────────────── */

  const fireImpact = useCallback(
    (slot: Position, color: string) => {
      setImpact(null);
      requestAnimationFrame(() => setImpact({ slot, color }));
      later(WASH_MS, () => setImpact(null));
    },
    [later],
  );

  const showReadout = useCallback(
    (player: IntroPlayer, slot: Position, startValue: number) => {
      setReadout({ player, slot, value: startValue, primary: player.primaryPosition === slot });
      later(140, () =>
        setReadout((r) =>
          r && r.player.id === player.id && r.slot === slot
            ? { ...r, value: seatedValue(player, slot) }
            : r,
        ),
      );
    },
    [later],
  );

  const startVictory = useCallback(
    () => {
      setPhase('victory');
      later(reduceMotion ? 0 : VICTORY_MS, () => {
        setCrossed(true);
        hapticSuccess();
        playFinalTotalSettleSound();
      });
      later(reduceMotion ? 0 : VICTORY_MS + 650, () => setFinishReady(true));
    },
    [later, reduceMotion],
  );

  const commit = useCallback(
    (source: Source, slot: Position) => {
      setSelected(null);
      hapticSlotConfirm();
      if (source === 'offer' && offer) {
        setSlots((s) => ({ ...s, [slot]: seat(offer, slot) }));
        fireImpact(slot, getTeamColors(offer.teamId).primary);
        showReadout(offer, slot, offer.base);
        if (phase === 'build') setPhase('position');
        else if (phase === 'cross') startVictory();
        return;
      }
      if (source !== 'offer') {
        setSlots((s) => ({ ...s, [source]: null, [slot]: seat(KOBE, slot) }));
        fireImpact(slot, getTeamColors(KOBE.teamId).primary);
        showReadout(KOBE, slot, seatedValue(KOBE, source));
        if (slot === KOBE.primaryPosition) later(1300, () => setPhase('cross'));
      }
    },
    [fireImpact, later, offer, phase, showReadout, startVictory],
  );

  const reject = useCallback(
    (slot: Position) => {
      hapticWarning();
      const text = phase === 'build' && slot === 'SG' ? HINTS.startAtSf : HINTS.notEligible;
      setNudge({ text, key: Date.now() });
      later(1600, () => setNudge((n) => (n && n.text === text ? null : n)));
    },
    [later, phase],
  );

  /** Fly the token into the seat, then hand off to the court in the same frame. */
  const land = (source: Source, slot: Position) => {
    if (busy.current) return;
    busy.current = true;
    const done = () => {
      commit(source, slot);
      setGhost(null);
      setHover(null);
      busy.current = false;
    };
    const target = centerIn(slotEl(slot));
    if (!target || reduceMotion) {
      done();
      return;
    }
    void Promise.all([
      animate(gx, target.x, SNAP),
      animate(gy, target.y, SNAP),
      animate(gs, 1, { duration: 0.2, ease: EASE_OUT }),
    ]).then(done);
  };

  const originOf = (source: Source): Point | null =>
    source === 'offer' ? centerIn(offerPosRef.current) : centerIn(slotEl(source));

  const placeByTap = (source: Source, slot: Position) => {
    if (busy.current) return;
    const player = source === 'offer' ? offer : KOBE;
    const from = originOf(source);
    if (!player || !from || reduceMotion) {
      commit(source, slot);
      return;
    }
    gx.set(from.x);
    gy.set(from.y);
    gs.set(1.08);
    setGhost({ player, from: source });
    requestAnimationFrame(() => land(source, slot));
  };

  const tapSelect = (source: Source) => {
    const targets = targetsFor(source);
    if (targets.length === 1) {
      hapticLight();
      placeByTap(source, targets[0]!);
      return;
    }
    if (source === 'offer') {
      hapticLight();
      setSelected((s) => (s === 'offer' ? null : 'offer'));
      return;
    }
    if (phase === 'position' && source === kobeSlot) {
      hapticLight();
      setSelected((s) => (s === source ? null : source));
    }
  };

  /* ── Drag ─────────────────────────────────────────────────── */

  const beginPress =
    (source: Source, player: IntroPlayer) => (e: ReactPointerEvent<HTMLElement>) => {
      if (busy.current || ghost) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const box = frameBox();
      if (!box) return;
      e.preventDefault();
      const pointerId = e.pointerId;
      const sx = e.clientX;
      const sy = e.clientY;
      const lift = e.pointerType === 'touch' ? 34 : 0;
      const targets = targetsFor(source);
      let dragging = false;
      let over: Position | null = null;
      let rects: Array<[Position, DOMRect]> = [];

      const hitTest = (x: number, y: number): Position | null => {
        for (const [slot, r] of rects) {
          if (
            x >= r.left - HIT_PAD &&
            x <= r.right + HIT_PAD &&
            y >= r.top - HIT_PAD &&
            y <= r.bottom + HIT_PAD
          ) {
            return slot;
          }
        }
        return null;
      };

      const follow = (x: number, y: number) => {
        gx.set(x - box.left);
        gy.set(y - box.top - lift);
      };

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (!dragging) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_SLOP) return;
          dragging = true;
          rects = POSITIONS.flatMap((slot) => {
            const el = slotEl(slot);
            return el ? [[slot, el.getBoundingClientRect()] as [Position, DOMRect]] : [];
          });
          setSelected(null);
          follow(ev.clientX, ev.clientY);
          gs.set(0.92);
          setGhost({ player, from: source });
          if (!reduceMotion) animate(gs, 1.12, { type: 'spring', stiffness: 600, damping: 28 });
          hapticLight();
        }
        follow(ev.clientX, ev.clientY);
        const hit = hitTest(ev.clientX, ev.clientY - lift);
        const valid = hit && targets.includes(hit) ? hit : null;
        if (valid !== over) {
          over = valid;
          setHover(valid);
          if (valid) hapticSelection();
        }
      };

      const end = (ev: PointerEvent, cancelled: boolean) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        if (!dragging) {
          if (!cancelled) tapSelect(source);
          return;
        }
        if (!cancelled && over) {
          land(source, over);
          return;
        }
        setHover(null);
        const dropped = cancelled ? null : hitTest(ev.clientX, ev.clientY - lift);
        if (dropped && dropped !== source && !slots[dropped]) reject(dropped);
        const home = originOf(source);
        if (!home || reduceMotion) {
          setGhost(null);
          return;
        }
        void Promise.all([
          animate(gx, home.x, SNAP),
          animate(gy, home.y, SNAP),
          animate(gs, 1, { duration: 0.18 }),
        ]).then(() => setGhost(null));
      };

      const up = (ev: PointerEvent) => end(ev, false);
      const cancel = (ev: PointerEvent) => end(ev, true);
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    };

  const onSlotPress = (slot: Position) => {
    if (busy.current || ghost || !drafting) return;
    if (phase === 'position' && slot === kobeSlot) {
      tapSelect(slot);
      return;
    }
    const source: Source | null =
      selected ?? (phase === 'position' ? kobeSlot : offer ? 'offer' : null);
    if (!source) return;
    if (targetsFor(source).includes(slot)) {
      placeByTap(source, slot);
      return;
    }
    if (!slots[slot]) reject(slot);
  };

  const keySelect = (source: Source) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    tapSelect(source);
  };

  const skip = () => {
    hapticLight();
    onDone();
  };

  const finish = () => {
    hapticSuccess();
    onDone();
  };

  const rollover = Math.max(0, total - GOAL);

  /* ── View ─────────────────────────────────────────────────── */

  const ghostColors = ghost ? getTeamColors(ghost.player.teamId) : null;
  const drawColors = getTeamColors(draw.teamId);
  const offerColors = offer ? getTeamColors(offer.teamId) : null;

  const direction: Direction | null =
    phase === 'build'
      ? DIRECTIONS.kobeSf
      : phase === 'position' && kobeSlot !== KOBE.primaryPosition
        ? DIRECTIONS.kobeSg
        : phase === 'cross'
          ? DIRECTIONS.lebronSf
          : null;
  const srSource = selected === 'offer' ? offer : selected ? KOBE : null;

  return (
    <div
      className={`intro${hover ? ' is-hovering' : ''}${ghost ? ' is-dragging' : ''}${
        phase === 'victory' ? ' is-victory' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={pick(CHROME.label, locale)}
    >
      <div ref={frameRef} className="intro__frame">
        <ArenaAtmosphere intensity="hub" />
        <motion.span
          className="intro__light intro__light--green"
          initial={false}
          animate={{ opacity: crossed ? 1 : 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          aria-hidden
        />
        <motion.span
          className="intro__light intro__light--orange"
          initial={false}
          animate={{ opacity: readout && !readout.primary && drafting ? 1 : 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          aria-hidden
        />

        <header className="intro__top">
          <span className="intro__skip-spacer" aria-hidden />
          <ol className="intro__steps" aria-label={`${MOMENT[phase] + 1} / 3`}>
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className={`intro__step${i < MOMENT[phase] ? ' is-done' : ''}${
                  i === MOMENT[phase] ? ' is-active' : ''
                }`}
              />
            ))}
          </ol>
          <button type="button" className="intro__skip" onClick={skip}>
            {pick(CHROME.skip, locale)}
          </button>
        </header>

        <div className="intro__headline">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={pick(HEADLINES[phase], locale)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              {pick(HEADLINES[phase], locale)}
            </motion.h1>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={pick(SUBLINES[phase], locale)}
              className="intro__subline"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.08 }}
            >
              {pick(SUBLINES[phase], locale)}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="intro__stage">
          <AnimatePresence mode="wait" initial={false}>
            {phase === 'welcome' ? (
              <WelcomeScene
                key="welcome"
                locale={locale}
                reduceMotion={reduceMotion}
                onNext={() => setPhase('build')}
              />
            ) : (
              <motion.div
                key="play"
                className="intro__scene intro__play"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.4, ease: [0.4, 0, 1, 1] } }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              >
                <div className={`intro__score${crossed ? ' is-billion' : ''}`}>
                  <div className="intro__score-label">
                    <span>{pick(LABELS.teamValue, locale)}</span>
                    <AnimatePresence>
                      {crossed ? (
                        <motion.em
                          className="intro__badge"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                        >
                          {pick(LABELS.billionTeam, locale)}
                        </motion.em>
                      ) : null}
                    </AnimatePresence>
                  </div>
                  <motion.div
                    className="intro__total"
                    initial={false}
                    animate={{ scale: phase === 'victory' && crossed ? 1.16 : 1 }}
                    transition={{ type: 'spring', stiffness: 140, damping: 18 }}
                  >
                    <TickerNumber
                      value={total}
                      duration={phase === 'victory' ? VICTORY_MS : 650}
                      easing={phase === 'victory' ? easeOutQuad : undefined}
                    />
                  </motion.div>
                  <div className="intro__score-foot">
                    <AnimatePresence initial={false}>
                      {crossed ? (
                        <motion.p
                          key="over"
                          className="intro__over"
                          initial={{ opacity: 0, y: 6, scale: 0.94 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                        >
                          {fill(FINISH.over, locale, { amount: `+${money(rollover)}` })}
                        </motion.p>
                      ) : (
                        <motion.div
                          key="meter"
                          className="intro__meter"
                          exit={{ opacity: 0, transition: { duration: 0.2 } }}
                          aria-hidden
                        >
                          <motion.span
                            className="intro__meter-fill"
                            initial={false}
                            animate={{ scaleX: Math.min(1, total / METER_SCALE) }}
                            transition={{
                              duration: (phase === 'victory' ? VICTORY_MS : 650) / 1000,
                              ease: phase === 'victory' ? EASE_OUT_QUAD : EASE_OUT,
                            }}
                          />
                          <span className="intro__meter-tick" style={{ left: `${(GOAL / METER_SCALE) * 100}%` }}>
                            <em>$1B</em>
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <motion.div
                  className="intro__court"
                  initial={false}
                  animate={{ scale: phase === 'victory' && crossed ? 1.02 : 1 }}
                  transition={CAMERA}
                >
                  <div ref={courtRef} className="intro__court-box">
                    <DraftHubCards
                      slots={slots}
                      targetSlots={drafting ? targetMap : undefined}
                      movingSlot={selected && selected !== 'offer' ? selected : null}
                      impactSlot={impact?.slot ?? null}
                      impactColor={impact?.color ?? null}
                      concealSlot={ghost && ghost.from !== 'offer' ? ghost.from : null}
                      reduceMotion={reduceMotion}
                      onSlotPress={onSlotPress}
                    />
                    {crossed && !reduceMotion ? <span className="intro__wave" aria-hidden /> : null}
                    {handle && kobeSlot && !ghost ? (
                      <button
                        type="button"
                        className={`intro__handle${selected === kobeSlot ? ' is-selected' : ''}`}
                        style={{ left: handle.left, top: handle.top, width: handle.size, height: handle.size }}
                        aria-label={`${KOBE.name} · ${kobeSlot}`}
                        aria-pressed={selected === kobeSlot}
                        onPointerDown={beginPress(kobeSlot, KOBE)}
                        onKeyDown={keySelect(kobeSlot)}
                      />
                    ) : null}
                  </div>
                </motion.div>

                <div className="intro__readout" aria-live="polite">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {readout && (phase === 'position' || phase === 'cross') ? (
                      <motion.div
                        key={`${readout.player.id}-${readout.slot}`}
                        className="intro__readout-row"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
                        transition={{ duration: 0.36, ease: EASE_OUT }}
                      >
                        <span className="intro__readout-name">
                          {readout.player.name} · {readout.slot}
                        </span>
                        <TickerNumber className="intro__readout-value" value={readout.value} duration={560} />
                        <motion.span
                          className={`intro__chip ${readout.primary ? 'is-primary' : 'is-alt'}`}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 460, damping: 26, delay: 0.12 }}
                        >
                          {pick(readout.primary ? LABELS.primary : LABELS.alternate, locale)}
                        </motion.span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="intro__tray">
                  <AnimatePresence initial={false}>
                    {drafting ? (
                      <motion.div
                        key="draft"
                        className="intro__draft"
                        exit={{ opacity: 0, y: 14, transition: { duration: 0.3 } }}
                      >
                        <div className="franchise-pick__head intro__draw">
                          <div
                            className="franchise-pick__result franchise-pick__result--team"
                            style={{
                              background: `linear-gradient(180deg, ${drawColors.primary} 0%, color-mix(in srgb, ${drawColors.primary} 72%, #041018) 100%)`,
                              color: contrastOnPrimary(drawColors.primary),
                            }}
                          >
                            <AnimatePresence mode="popLayout" initial={false}>
                              <motion.span
                                key={draw.teamId}
                                className="franchise-pick__result-label"
                                initial={{ y: '120%', opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: '-120%', opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                              >
                                {draw.teamLabel}
                              </motion.span>
                            </AnimatePresence>
                          </div>
                          <div
                            className="franchise-pick__result franchise-pick__result--era"
                            style={{ background: '#152a4d', color: 'rgba(236, 244, 255, 0.94)' }}
                          >
                            <span className="franchise-pick__result-label">{draw.era}</span>
                          </div>
                        </div>

                        <p className={`intro__direction${nudge ? ' is-warn' : ''}`} aria-live="polite">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {nudge ? (
                              <motion.span
                                key={`n${nudge.key}`}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 900, damping: 14 }}
                              >
                                {pick(nudge.text, locale)}
                              </motion.span>
                            ) : direction ? (
                              <motion.span
                                key={pick(direction.lead, locale) + pick(direction.to, locale)}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.35, ease: EASE_OUT }}
                              >
                                {pick(direction.lead, locale)} <strong>{pick(direction.to, locale)}</strong>
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                        </p>

                        <div className="intro__offer-slot">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {offer && offerColors ? (
                              <motion.button
                                key={offer.id}
                                type="button"
                                className={`franchise-pick__row intro__offer${
                                  selected === 'offer' ? ' is-selected' : ''
                                }${ghost?.from === 'offer' ? ' is-lifted' : ''}`}
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: ghost?.from === 'offer' ? 0.42 : 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                                transition={{ duration: 0.45, ease: EASE_OUT }}
                                aria-pressed={selected === 'offer'}
                                aria-label={`${offer.name} · ${offer.primaryPosition}`}
                                onPointerDown={beginPress('offer', offer)}
                                onKeyDown={keySelect('offer')}
                              >
                                <span
                                  ref={offerPosRef}
                                  className="franchise-pick__pos"
                                  style={{ background: offerColors.primary, color: contrastOnPrimary(offerColors.primary) }}
                                >
                                  {offer.primaryPosition}
                                </span>
                                <span className="franchise-pick__meta">
                                  <strong>{offer.name}</strong>
                                  <em className="franchise-pick__stats">{offer.statLine}</em>
                                </span>
                                <span className="intro__elig">
                                  {formatEligiblePositions(offer).split('/').join(' · ')}
                                </span>
                              </motion.button>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    ) : finishReady ? (
                      <DemoFinish
                        key="finish"
                        rollover={rollover}
                        locale={locale}
                        reduceMotion={reduceMotion}
                        onFinish={finish}
                      />
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {srSource
          ? targetsFor(selected).map((slot) => (
              <button
                key={slot}
                type="button"
                className="intro__sr"
                onClick={() => placeByTap(selected!, slot)}
              >
                {fill(LABELS.place, locale, { name: srSource.name, slot })}
              </button>
            ))
          : null}

        {ghost && ghostColors ? (
          <motion.div className="intro__ghost" style={{ x: gx, y: gy, scale: gs }} aria-hidden>
            <span
              className="intro__ghost-disc"
              style={
                {
                  '--slot-primary': ghostColors.primary,
                  '--slot-ink': contrastOnPrimary(ghostColors.primary),
                } as CSSProperties
              }
            >
              {playerInitials(ghost.player.name)}
            </span>
          </motion.div>
        ) : null}

        {crossed && !reduceMotion ? <BillionCelebration /> : null}
      </div>
    </div>
  );
}
