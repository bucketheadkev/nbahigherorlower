'use client';

import { useId, type CSSProperties } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { FranchisePick } from '@/lib/account/franchiseCloud';
import { formatCash } from '@/lib/tradeup/bank';
import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';
import { CYCLE_HOURS, EARNINGS, formatFanPower } from '@/lib/tradeup/ownership/config';
import { pickFans } from '@/lib/tradeup/ownership/fans';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position } from '@/lib/tradeup/types';

export const ROSTER_SLOTS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const fanFormat = new Intl.NumberFormat('en-US');

/** Whole fans with commas, e.g. 4,850,000. */
export function formatFans(value: number): string {
  return fanFormat.format(Math.max(0, Math.round(value)));
}

function rgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) || 0) as [number, number, number];
}

function mix(hex: string, toward: [number, number, number], amount: number): string {
  const [r, g, b] = rgb(hex);
  const ch = (c: number, t: number) => Math.round(c + (t - c) * amount);
  return `rgb(${ch(r, toward[0])}, ${ch(g, toward[1])}, ${ch(b, toward[2])})`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Franchise color theme as CSS variables. Near-black primaries (Nets, Wolves, Pelicans) are lifted
 * a little so the card still reads as the team's color against the app's navy.
 */
export function teamTheme(teamId: string): CSSProperties {
  const { primary, accent } = getTeamColors(teamId);
  const dark = luminance(primary) < 0.12;
  const team = dark ? mix(primary, [72, 86, 112], 0.32) : primary;
  const accentVisible = luminance(accent) < 0.12 ? mix(accent, [255, 255, 255], 0.55) : accent;
  const ink = dark ? '#ffffff' : contrastOnPrimary(primary);
  return {
    '--team': team,
    '--team-deep': mix(primary, [2, 8, 20], dark ? 0.2 : 0.5),
    // Dark ink needs the row to stay light end to end.
    '--team-row-end': ink === '#ffffff' ? mix(primary, [2, 8, 20], dark ? 0.12 : 0.34) : mix(primary, [0, 0, 0], 0.1),
    '--team-ink': ink,
    '--team-accent': accentVisible,
  } as CSSProperties;
}

export function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.35 12H8a4 4 0 0 1-4-4V5h3V3Zm0 4H6v1a2 2 0 0 0 1.2 1.83A5.6 5.6 0 0 1 7 8.5V7Zm10 0v1.5c0 .46-.07.9-.2 1.33A2 2 0 0 0 18 8V7h-1ZM7 20h10v1H7v-1Z"
      />
    </svg>
  );
}

export function FansIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="7.2" r="3.2" fill="currentColor" />
      <path fill="currentColor" d="M5.5 19.5c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2v.5h-13v-.5Z" />
      <circle cx="5.2" cy="9.3" r="2.3" fill="currentColor" opacity="0.6" />
      <circle cx="18.8" cy="9.3" r="2.3" fill="currentColor" opacity="0.6" />
      <path fill="currentColor" opacity="0.6" d="M.8 18.6c0-2.6 1.9-4.5 4.4-4.5.9 0 1.7.2 2.4.7a7.6 7.6 0 0 0-2.6 4.7H.8v-.9Zm22.4 0c0-2.6-1.9-4.5-4.4-4.5-.9 0-1.7.2-2.4.7a7.6 7.6 0 0 1 2.6 4.7h4.2v-.9Z" />
    </svg>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Round monogram: team primary inside, alternate color as the ring. */
export function Crest({ teamId, className }: { teamId: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const { primary, accent } = getTeamColors(teamId);
  const dark = luminance(primary) < 0.12;
  const fill = dark ? mix(primary, [72, 86, 112], 0.32) : primary;
  const ink = dark ? '#ffffff' : contrastOnPrimary(primary);
  const rim = luminance(accent) < 0.12 ? mix(accent, [255, 255, 255], 0.55) : accent;
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={`crest-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fill} />
          <stop offset="1" stopColor={mix(primary, [2, 8, 20], dark ? 0.15 : 0.42)} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#crest-${id})`} stroke={rim} strokeWidth="4" />
      <circle cx="32" cy="32" r="24.5" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      <text
        x="32"
        y="39.5"
        textAnchor="middle"
        fill={ink}
        fontFamily='"Avenir Next Condensed", "Avenir Next", "SF Pro Display", "Helvetica Neue", sans-serif'
        fontWeight="800"
        fontSize={teamId.length > 2 ? 19 : 23}
        letterSpacing="0.5"
      >
        {teamId}
      </text>
    </svg>
  );
}

const PAY_COPY = {
  title: { en: 'HOW YOUR PAY IS CALCULATED', es: 'CÓMO SE CALCULA TU PAGO' },
  power: { en: 'Fan Power', es: 'Poder de fans' },
  powerMath: { en: '{fans} fans ÷ {unit}', es: '{fans} fans ÷ {unit}' },
  powerCap: { en: 'max {max}', es: 'máx. {max}' },
  hourly: { en: 'Hourly pay', es: 'Pago por hora' },
  hourlyMath: { en: '{price} × {pct} × {power}', es: '{price} × {pct} × {power}' },
  total: { en: '{hours} hours', es: '{hours} horas' },
  totalMath: { en: '{hours} × {hourly}', es: '{hours} × {hourly}' },
  note: {
    en: 'Better players bring more fans. A pricier franchise pays more for the same fans. Paid every hour of the 48, even while you’re away.',
    es: 'Mejores jugadores atraen más fans. Una franquicia más cara paga más por los mismos fans. Se paga cada hora de las 48, aunque no estés.',
  },
};

/**
 * The real pay math for a roster, line by line: Fan Power, hourly pay, 48-hour total.
 * `hourly` is the server's locked rate when there is one, so the shown result is what gets paid.
 */
export function PayFormula({
  pricePaid,
  fans,
  powerMilli,
  hourly,
  hours = CYCLE_HOURS,
  className,
}: {
  pricePaid: number;
  fans: number;
  powerMilli: number;
  hourly: number;
  hours?: number;
  className?: string;
}) {
  const { locale } = useLocale();
  const t = (copy: { en: string; es: string }, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, v), locale === 'es' ? copy.es : copy.en);
  const power = formatFanPower(powerMilli);
  return (
    <div className={`fx-pay-math${className ? ` ${className}` : ''}`}>
      <p className="fx-pay-math__title">{t(PAY_COPY.title)}</p>
      <dl className="fx-pay-math__rows">
        <div>
          <dt>{t(PAY_COPY.power)}</dt>
          <dd>
            <span>
              {t(PAY_COPY.powerMath, { fans: formatFans(fans), unit: formatFans(EARNINGS.fansPerPower) })}
              <small> · {t(PAY_COPY.powerCap, { max: formatFanPower(EARNINGS.maxPowerMilli) })}</small>
            </span>
            <b>{power}</b>
          </dd>
        </div>
        <div>
          <dt>{t(PAY_COPY.hourly)}</dt>
          <dd>
            <span>
              {t(PAY_COPY.hourlyMath, {
                price: formatCash(pricePaid),
                pct: `${(EARNINGS.hourlyPpm / 10_000).toFixed(3)}%`,
                power,
              })}
            </span>
            <b className="is-money">{formatCash(hourly)}</b>
          </dd>
        </div>
        <div>
          <dt>{t(PAY_COPY.total, { hours: String(hours) })}</dt>
          <dd>
            <span>{t(PAY_COPY.totalMath, { hours: String(hours), hourly: formatCash(hourly) })}</span>
            <b className="is-money">{formatCash(hourly * hours)}</b>
          </dd>
        </div>
      </dl>
      <p className="fx-pay-math__note">{t(PAY_COPY.note)}</p>
    </div>
  );
}

/**
 * The starting five on Classic's evaluation-card rows, every row in the owned franchise's colors
 * whatever team the player came from. Fans instead of dollar values.
 */
export function FranchiseRosterCards({
  teamId,
  picks,
  showFans = true,
  emptyLabel,
  className,
}: {
  teamId: string;
  picks: FranchisePick[];
  showFans?: boolean;
  /** Shown in seats with no player yet; omit to hide empty seats. */
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <ul className={`fx-five${className ? ` ${className}` : ''}`} style={teamTheme(teamId)}>
      {ROSTER_SLOTS.map((slot, index) => {
        const pick = picks.find((p) => p.slot === slot);
        const player = pick ? getHistPlayerById(pick.playerId) : null;
        if (!pick) {
          if (emptyLabel == null) return null;
          return (
            <li key={slot} className="fx-five__row is-empty" style={{ '--i': index } as CSSProperties}>
              <span className="fx-five__pos">{slot}</span>
              <strong className="fx-five__name">{emptyLabel}</strong>
            </li>
          );
        }
        return (
          <li key={slot} className="fx-five__row" style={{ '--i': index } as CSSProperties}>
            <span className="fx-five__pos">{slot}</span>
            <strong className="fx-five__name">{player?.name ?? pick.playerId}</strong>
            {showFans ? (
              <em className="fx-five__fans">
                {formatFans(pickFans(pick))}
                <FansIcon className="fx-five__fans-icon" />
              </em>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
