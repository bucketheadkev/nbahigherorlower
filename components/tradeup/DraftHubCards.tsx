'use client';

import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  POSITION_LABELS,
} from '@/lib/tradeup/startingLineup';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { getTeam } from '@/lib/tradeup/teams';
import { eraShortLabel, type DecadeEra, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';

export type HubCardPlayer = ValuedPlayer & { era?: DecadeEra };

type DraftHubCardsProps = {
  slots: Record<Position, HubCardPlayer | null>;
  justFilledSlot?: Position | null;
  /** Seat currently being moved (hub rearrange). */
  movingSlot?: Position | null;
  /** Highlight empty eligible seats while placing a pick. */
  targetSlots?: Partial<Record<Position, boolean>>;
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
  SG: { ox: '15%', oy: '76%', rx: '-2.0deg', ry: '2.4deg', dx: '-3px', dy: '2px' },
  SF: { ox: '85%', oy: '76%', rx: '-2.0deg', ry: '-2.4deg', dx: '3px', dy: '2px' },
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

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '—', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

function playerInitials(name: string): string {
  const { first, last } = splitName(name);
  if (!last) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
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
  impactSlot = null,
  impactColor = null,
  concealSlot = null,
  analyzing = false,
  reduceMotion = false,
  onSlotPress,
  onAnalyzeComplete,
}: DraftHubCardsProps) {
  const [detailSlot, setDetailSlot] = useState<Position | null>(null);
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
    const onDoc = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || !rootRef.current) return;
      if (target.closest('.draft-hub-court__pop')) return;
      if (target.closest('.draft-hub-court__slot')) return;
      setDetailSlot(null);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
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
    arm(900, finish);

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

  return (
    <aside
      ref={rootRef}
      className={`draft-hub-court${analyzing ? ' is-analyzing' : ''}${stageClass}${
        assignMode ? ' is-assigning' : ''
      }${impact ? ' is-impacting' : ''}`}
      style={impactStyle}
      aria-label={analyzing ? 'Activating lineup' : 'Your five'}
    >
      <div className="draft-hub-court__stage">
        <div className="draft-hub-court__floor" aria-hidden="true">
          <svg
            className="draft-hub-court__lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
          >
            <g className="draft-hub-court__geo draft-hub-court__geo--boundary">
              <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="0.4" />
            </g>
            <g className="draft-hub-court__geo draft-hub-court__geo--paint">
              <rect x="28" y="1.2" width="44" height="51.7" />
            </g>
            <g className="draft-hub-court__geo draft-hub-court__geo--key">
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
          {impact ? (
            <>
              <span className="draft-hub-court__impact-wash" aria-hidden="true" />
              <span className="draft-hub-court__impact-wave" aria-hidden="true" />
            </>
          ) : null}
          <span className="draft-hub-court__energy-sweep" aria-hidden="true" />
        </div>

        {COURT_SLOTS.map((slot) => {
          const player = slots[slot];
          const colors = player ? getTeamColors(player.teamId) : null;
          const ink = colors ? contrastOnPrimary(colors.primary) : undefined;
          const concealed = concealSlot === slot;
          const filled = Boolean(player) && !concealed;
          const open = detailSlot === slot && filled && !analyzing && !assignMode;
          const isTarget = Boolean(targetSlots?.[slot]);
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
                  isMoving ? ' is-moving' : ''
                }`}
                style={
                  filled && colors
                    ? ({
                        '--slot-primary': colors.primary,
                        '--slot-accent': colors.accent,
                        '--slot-ink': ink,
                        backgroundColor: colors.primary,
                        color: ink,
                        borderColor: colors.primary,
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
                  if (!onSlotPress || analyzing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSlotPress(slot);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (analyzing || onSlotPress) return;
                  if (!player || concealed) {
                    setDetailSlot(null);
                    return;
                  }
                  setDetailSlot((prev) => (prev === slot ? null : slot));
                }}
              >
                <span className="draft-hub-court__slot-ring" aria-hidden="true" />
                <span className="draft-hub-court__slot-mark">
                  {filled && player ? playerInitials(player.name) : slot}
                </span>
              </button>
              {filled ? (
                <span className="draft-hub-court__pos-label" aria-hidden="true">
                  {slot}
                </span>
              ) : null}
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
          onPointerDown={(event) => event.stopPropagation()}
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
