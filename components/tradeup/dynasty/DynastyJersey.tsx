'use client';

import { memo, type CSSProperties } from 'react';
import type { DynastyColors } from '@/lib/tradeup/dynasty/catalog';
import { initialsOf } from '@/lib/tradeup/dynasty/catalog';
import { JerseyShape } from '../draft/CourtJersey';

type Look = 'owned' | 'missing' | 'sealed';

/** Classic's tank top: team colors and initials when collected, dark with a lock when missing. */
export const DynastyJersey = memo(function DynastyJersey({
  name,
  colors,
  look,
  className = '',
}: {
  name: string;
  colors: DynastyColors;
  look: Look;
  className?: string;
}) {
  const style =
    look === 'owned'
      ? ({ '--slot-primary': colors.primary, '--slot-accent': colors.accent, '--slot-ink': colors.ink } as CSSProperties)
      : undefined;
  return (
    <span className={`jersey dyn-jersey dyn-jersey--${look}${look === 'owned' ? ' is-filled' : ''} ${className}`} style={style} aria-hidden>
      <JerseyShape />
      {look === 'owned' ? (
        <span className="jersey__text jersey__text--initials dyn-jersey__initials">{initialsOf(name)}</span>
      ) : look === 'missing' ? (
        <span className="dyn-jersey__mark">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="2" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      ) : (
        <span className="dyn-jersey__mark dyn-jersey__mark--sealed">?</span>
      )}
    </span>
  );
});

/** "J.J. Barea" → ["J.J.", "Barea"]: a light first line and a bold surname. */
export function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return ['', name];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]!];
}
