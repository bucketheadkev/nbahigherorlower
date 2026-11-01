'use client';

import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  POSITION_LABELS,
} from '@/lib/tradeup/startingLineup';
import { contrastOnPrimary, getTeamColors, teamGlowColor } from '@/lib/tradeup/teamColors';
import { getTeam } from '@/lib/tradeup/teams';
import { eraShortLabel, type DecadeEra, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';
import { ArenaCourtArt } from './draft/ArenaCourt';
import { CourtJersey } from './draft/CourtJersey';

export type HubCardPlayer = ValuedPlayer & { era?: DecadeEra };

type DraftHubCardsProps = {
  slots: Record<Position, HubCardPlayer | null>;
  justFilledSlot?: Position | null;
  /** Seat currently being moved (hub rearrange). */
  movingSlot?: Position | null;
  /** Highlight empty eligible seats while placing a pick. */
  targetSlots?: Partial<Record<Position, boolean>>;
  /** The placing player's primary position — its jersey wears the heaviest outline. */
  primarySlot?: Position | null;
  /** Lightened team color for the moving light on eligible jerseys. */
  targetColor?: string | null;
  /** Team primary that rings the eligible jerseys while placing. */
  targetPrimary?: string | null;
  /** Court weight-impact toward this seat (tilt + line ripple). */
  impactSlot?: Position | null;
  /** Team primary color for the impact flash (from player/team theme). */
  impactColor?: string | null;
  /** Hide seat fill while the fly disc is still in the air. */
  concealSlot?: Position | null;
  /** Play court → valuation collapse (final five locked). */
  analyzing?: boolean;
  reduceMotion?: boolean;
  /** When set, empty/filled seats route placement through the draft engine. */
  onSlotPress?: (slot: Position) => void;
  onAnalyzeComplete?: () => void;
};

/** A press that travels farther than this is a scroll or swipe, never a jersey tap. */
const TAP_SLOP_PX = 10;

/** Length of the placement reveal (see .jersey.is-landing). */
const LANDING_MS = 650;

/** Court slot order for a11y / DOM (paint → wings → point). */
const COURT_SLOTS: Position[] = ['PF', 'C', 'SG', 'SF', 'PG'];

type AnalyzeStage = 'idle' | 'pulse' | 'sweep' | 'focus' | 'collapse' | 'beam';

/** Subtle physical tilt toward each seat — controlled, not springy. */
const IMPACT_PHYSICS: Record<
  Position,
  { ox: string; oy: string; rx: string; ry: string; dx: string; dy: string }
> = {
  PF: { ox: '39%', oy: '17%', rx: '2.2deg', ry: '2.0deg', dx: '-2px', dy: '-3px' },
  C: { ox: '61%', oy: '17%', rx: '2.2deg', ry: '-2.0deg', dx: '2px', dy: '-3px' },
  SG: { ox: '18%', oy: '74%', rx: '-2.0deg', ry: '2.4deg', dx: '-3px', dy: '2px' },
  SF: { ox: '82%', oy: '74%', rx: '-2.0deg', ry: '-2.4deg', dx: '3px', dy: '2px' },
  PG: { ox: '50%', oy: '88%', rx: '-2.6deg', ry: '0deg', dx: '0px', dy: '3px' },
};

function resolveEra(player: HubCardPlayer): DecadeEra | null {
  if (player.era) return player.era;
  const match = /^hist_(\d{4}s)_/.exec(player.id);
  if (match) return match[1] as DecadeEra;
  return null;
}

function teamLine(player: HubCardPlayer): string {
  const team = getTeam(player.teamId);
  if (!team) return player.teamId;
  return `${team.city} ${team.name}`.trim();
}

export function CircleName({
  pos,
  first,
  last,
}: {
  pos: string;
  first: string;
  last: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;

    const fit = () => {
      const style = getComputedStyle(box);
      const maxW =
        box.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const maxH =
        box.clientHeight -
        (parseFloat(style.paddingTop) || 0) -
        (parseFloat(style.paddingBottom) || 0);
      if (maxW < 4 || maxH < 4) return;
      let lo = 5;
      let hi = Math.max(6, maxH * 0.36);
      let best = lo;
      while (hi - lo > 0.2) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        const fits =
          el.scrollWidth <= maxW + 0.5 && el.scrollHeight <= maxH + 0.5;
        if (fits) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      el.style.fontSize = `${best}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [first, last, pos]);

  return (
    <span ref={ref} className="draft-hub-court__face-copy">
      <span className="draft-hub-court__face-pos">{pos}</span>
      <span className="draft-hub-court__face-line">{first}</span>
      {last ? <span className="draft-hub-court__face-line">{last}</span> : null}
    </span>
  );
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '—', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

/**
 * Experimental classic-hub court roster (replaces the five position rows).
 * Flip EXPERIMENTAL_DRAFT_HUB_CARDS off in BillionTradeEngine to restore the rows.
 *
 * True bird's-eye half-court: PF/C in paint, SG/SF/PG outside the 3-point arc.
 */
export function DraftHubCards({
  slots,
  movingSlot = null,
  targetSlots,
  primarySlot = null,
  targetColor = null,
  targetPrimary = null,
  impactSlot = null,
  impactColor = null,
  concealSlot = null,
  analyzing = false,
  reduceMotion = false,
  onSlotPress,
  onAnalyzeComplete,
}: DraftHubCardsProps) {
  const [detailSlot, setDetailSlot] = useState<Position | null>(null);
  const [flippedSlots, setFlippedSlots] = useState<ReadonlySet<Position>>(() => new Set());
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [landingSlots, setLandingSlots] = useState<ReadonlySet<Position>>(() => new Set());
  const prevSlotsRef = useRef(slots);
  const landingTimersRef = useRef<number[]>([]);
  const maskId = `court-mask-${useId().replace(/:/g, '')}`;
  const [analyzeStage, setAnalyzeStage] = useState<AnalyzeStage>('idle');
  const rootRef = useRef<HTMLElement | null>(null);
  const analyzeDoneRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const detailPlayer = detailSlot ? slots[detailSlot] : null;
  const detailColors = detailPlayer ? getTeamColors(detailPlayer.teamId) : null;
  const detailInk = detailColors
    ? contrastOnPrimary(detailColors.primary)
    : undefined;
  const assignMode = Boolean(onSlotPress) && !analyzing;
  const impact = impactSlot && !reduceMotion ? IMPACT_PHYSICS[impactSlot] : null;
  const resolvedImpactColor =
    impactColor ??
    (impactSlot && slots[impactSlot]
      ? getTeamColors(slots[impactSlot]!.teamId).primary
      : null);

  // A newly drafted player lands on his jersey; a seated player moving seats does not.
  // Layout effect so the first painted frame already starts from the empty jersey.
  useLayoutEffect(() => {
    const prev = prevSlotsRef.current;
    prevSlotsRef.current = slots;
    if (reduceMotion) return;
    const seatedBefore = new Set(
      COURT_SLOTS.flatMap((slot) => (prev[slot] ? [prev[slot]!.id] : [])),
    );
    const fresh = COURT_SLOTS.filter((slot) => {
      const player = slots[slot];
      return player && prev[slot]?.id !== player.id && !seatedBefore.has(player.id);
    });
    if (fresh.length === 0) return;
    setLandingSlots((current) => new Set([...current, ...fresh]));
    landingTimersRef.current.push(
      window.setTimeout(() => {
        setLandingSlots((current) => {
          const next = new Set(current);
          fresh.forEach((slot) => next.delete(slot));
          return next;
        });
      }, LANDING_MS),
    );
  }, [reduceMotion, slots]);

  useEffect(
    () => () => {
      landingTimersRef.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  // A turned jersey stays turned only while the same player wears it (moves and swaps reset it).
  const flipOwnerRef = useRef<Partial<Record<Position, string>>>({});
  useEffect(() => {
    const owners = flipOwnerRef.current;
    setFlippedSlots((prev) => {
      const kept = [...prev].filter((slot) => slots[slot] && owners[slot] === slots[slot]!.id);
      return kept.length === prev.size ? prev : new Set(kept);
    });
    flipOwnerRef.current = Object.fromEntries(
      COURT_SLOTS.flatMap((slot) => (slots[slot] ? [[slot, slots[slot]!.id]] : [])),
    );
  }, [slots]);

  useEffect(() => {
    if (!detailSlot) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailSlot(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailSlot]);

  useEffect(() => {
    if (!assignMode) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || !rootRef.current) return;
      if (target.closest('.draft-hub-court__pop')) return;
      if (target.closest('.draft-hub-court__slot')) return;
      setDetailSlot(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [assignMode]);

  useEffect(() => {
    if (!analyzing) {
      setAnalyzeStage('idle');
      analyzeDoneRef.current = false;
      return;
    }

    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    analyzeDoneRef.current = false;
    setDetailSlot(null);
    setFlippedSlots(new Set());

    const arm = (ms: number, fn: () => void) => {
      timersRef.current.push(
        window.setTimeout(fn, reduceMotion ? Math.min(ms, 28) : ms),
      );
    };

    const finish = () => {
      if (analyzeDoneRef.current) return;
      analyzeDoneRef.current = true;
      onAnalyzeComplete?.();
    };

    if (reduceMotion) {
      setAnalyzeStage('beam');
      arm(60, finish);
      return () => {
        timersRef.current.forEach((id) => window.clearTimeout(id));
        timersRef.current = [];
      };
    }

    // FINAL LOCK → pulse → sweep → focus → collapse → beam → valuation
    // ~0.9s total (plus the ~150ms pause before analyzing starts).
    setAnalyzeStage('pulse');
    arm(110, () => setAnalyzeStage('sweep'));
    arm(220, () => setAnalyzeStage('focus'));
    arm(360, () => setAnalyzeStage('collapse'));
    arm(700, () => setAnalyzeStage('beam'));
    arm(1100, finish);

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [analyzing, onAnalyzeComplete, reduceMotion]);

  const impactStyle = impact
    ? ({
        '--impact-ox': impact.ox,
        '--impact-oy': impact.oy,
        '--impact-rx': impact.rx,
        '--impact-ry': impact.ry,
        '--impact-dx': impact.dx,
        '--impact-dy': impact.dy,
        ...(resolvedImpactColor
          ? { '--impact-team': resolvedImpactColor }
          : null),
      } as CSSProperties)
    : undefined;

  const stageClass =
    analyzeStage === 'idle' ? '' : ` is-analyze-${analyzeStage}`;
  const choosing = Boolean(targetSlots) && Object.values(targetSlots ?? {}).some(Boolean);
  const courtStyle = {
    ...impactStyle,
    ...(targetColor ? { '--target-color': targetColor } : null),
    ...(targetPrimary ? { '--target-primary': targetPrimary } : null),
  } as CSSProperties;

  return (
    <aside
      ref={rootRef}
      className={`draft-hub-court${analyzing ? ' is-analyzing' : ''}${stageClass}${
        assignMode ? ' is-assigning' : ''
      }${impact ? ' is-impacting' : ''}${choosing ? ' is-choosing' : ''}`}
      style={courtStyle}
      aria-label={analyzing ? 'Activating lineup' : 'Your five'}
    >
      <div className="draft-hub-court__stage">
        <div className="draft-hub-court__floor" aria-hidden="true">
          {impact ? (
            <>
              <span className="draft-hub-court__impact-wash" aria-hidden="true" />
              <span className="draft-hub-court__impact-bolt" aria-hidden="true" />
            </>
          ) : null}
          <ArenaCourtArt />
          <svg
            className="draft-hub-court__lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              {/* The free-throw line and circle fade out around the $1B mark instead of crossing it. */}
              <radialGradient id={`${maskId}-fade`}>
                <stop offset="0.55" stopColor="black" />
                <stop offset="1" stopColor="white" />
              </radialGradient>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                <rect x="0" y="0" width="100" height="100" fill="white" />
                <ellipse cx="50" cy="52.4" rx="17" ry="9.5" fill={`url(#${maskId}-fade)`} />
              </mask>
            </defs>
            <g className="draft-hub-court__geo draft-hub-court__geo--boundary">
              <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="0.4" />
            </g>
            <g className="draft-hub-court__geo draft-hub-court__geo--paint" mask={`url(#${maskId})`}>
              <rect x="28" y="1.2" width="44" height="51.7" />
            </g>
            <g className="draft-hub-court__geo draft-hub-court__geo--key" mask={`url(#${maskId})`}>
              <path
                d="M 34 52.9 A 16 16 0 0 1 66 52.9"
                strokeDasharray="2.4 2.2"
              />
              <path d="M 34 52.9 A 16 16 0 0 0 66 52.9" />
            </g>
            <g className="draft-hub-court__geo draft-hub-court__geo--arc">
              <path d="M 1.2 46.78 A 54.2 54.2 0 0 0 98.8 46.78" />
            </g>
          </svg>
          <span className="draft-hub-court__mark" aria-hidden="true">
            $1B
          </span>
          <span className="draft-hub-court__energy-sweep" aria-hidden="true" />
        </div>

        {COURT_SLOTS.map((slot) => {
          const player = slots[slot];
          const colors = player ? getTeamColors(player.teamId) : null;
          const ink = colors ? contrastOnPrimary(colors.primary) : undefined;
          const concealed = concealSlot === slot;
          const filled = Boolean(player) && !concealed;
          const open = detailSlot === slot && filled && !analyzing && !assignMode;
          const showName =
            filled && (movingSlot === slot || (flippedSlots.has(slot) && movingSlot == null));
          const isTarget = Boolean(targetSlots?.[slot]);
          const isPrimary = isTarget && primarySlot === slot;
          const isMoving = movingSlot === slot;

          return (
            <div
              key={slot}
              className={`draft-hub-court__seat draft-hub-court__seat--${slot.toLowerCase()}${
                isTarget ? ' is-target' : ''
              }${isMoving ? ' is-moving' : ''}${
                impactSlot === slot ? ' is-impact-seat' : ''
              }`}
            >
              <button
                type="button"
                data-draft-slot={slot}
                className={`draft-hub-court__slot${
                  filled ? ' is-filled' : ' is-empty'
                }${open ? ' is-open' : ''}${isTarget ? ' is-target' : ''}${
                  isPrimary ? ' is-primary' : ''
                }${isMoving ? ' is-moving' : ''} jersey-slot`}
                style={
                  filled && colors && player
                    ? ({
                        '--slot-primary': colors.primary,
                        '--slot-accent': colors.accent,
                        '--slot-ink': ink,
                        '--slot-glow': teamGlowColor(player.teamId),
                      } as CSSProperties)
                    : undefined
                }
                aria-label={
                  player && !concealed
                    ? `${POSITION_LABELS[slot]}: ${player.name}`
                    : `Empty ${POSITION_LABELS[slot]}`
                }
                aria-expanded={open || undefined}
                disabled={analyzing}
                onPointerDown={(event) => {
                  pressRef.current = { x: event.clientX, y: event.clientY, moved: false };
                }}
                onPointerMove={(event) => {
                  const press = pressRef.current;
                  if (
                    press &&
                    (Math.abs(event.clientX - press.x) > TAP_SLOP_PX ||
                      Math.abs(event.clientY - press.y) > TAP_SLOP_PX)
                  ) {
                    press.moved = true;
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  const dragged = pressRef.current?.moved;
                  pressRef.current = null;
                  if (analyzing || dragged) return;
                  // A glowing seat is a destination (swap), not a jersey to turn over.
                  if (filled && player && !isTarget) {
                    setFlippedSlots((prev) => {
                      const next = new Set(prev);
                      if (next.has(slot)) next.delete(slot);
                      else next.add(slot);
                      return next;
                    });
                  }
                  if (onSlotPress) {
                    onSlotPress(slot);
                    return;
                  }
                  if (!player || concealed) {
                    setDetailSlot(null);
                    return;
                  }
                  setDetailSlot((prev) => (prev === slot ? null : slot));
                }}
              >
                <CourtJersey
                  position={slot}
                  playerName={filled && player ? player.name : null}
                  flipped={showName}
                  landing={filled && landingSlots.has(slot)}
                />
              </button>
              <span className={`draft-hub-court__seat-pos${filled && player ? '' : ' is-empty'}`}>
                {slot}
              </span>
            </div>
          );
        })}

        <span className="draft-hub-court__beam" aria-hidden="true" />
      </div>

      {detailSlot && detailPlayer && detailColors ? (
        <div
          className={`draft-hub-court__pop draft-hub-court__pop--${detailSlot.toLowerCase()}`}
          role="dialog"
          aria-label={`${POSITION_LABELS[detailSlot]} details`}
          style={
            {
              '--slot-primary': detailColors.primary,
              '--slot-accent': detailColors.accent,
              '--slot-ink': detailInk,
            } as CSSProperties
          }
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const { first, last } = splitName(detailPlayer.name);
            const era = resolveEra(detailPlayer);
            return (
              <>
                <p className="draft-hub-court__pop-pos">{detailSlot}</p>
                <p className="draft-hub-court__pop-first">{first}</p>
                {last ? (
                  <p className="draft-hub-court__pop-last">{last}</p>
                ) : null}
                <p className="draft-hub-court__pop-team">{teamLine(detailPlayer)}</p>
                {era ? (
                  <p className="draft-hub-court__pop-era">{eraShortLabel(era)}</p>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}
    </aside>
  );
}
