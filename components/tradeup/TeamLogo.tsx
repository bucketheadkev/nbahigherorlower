'use client';

import type { CSSProperties } from 'react';
import { getTeamColors } from '@/lib/tradeup/teamColors';

interface TeamLogoProps {
  teamId: string;
  abbreviation: string;
  size?: 'default' | 'sm' | 'xs' | 'panel';
}

/** Team mark — abbreviation on team-color fill (no remote logo images). */
export function TeamLogo({ teamId, abbreviation, size = 'default' }: TeamLogoProps) {
  const colors = getTeamColors(teamId);

  const sizeClass =
    size === 'xs'
      ? ' team-logo--xs'
      : size === 'sm'
        ? ' team-logo--sm'
        : size === 'panel'
          ? ' team-logo--panel'
          : '';

  const label = abbreviation.slice(0, 3).toUpperCase();

  return (
    <div
      className={`team-logo${sizeClass} team-logo--fallback`}
      style={
        {
          '--logo-primary': colors.primary,
          '--logo-accent': colors.accent,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="team-logo__abbr">{label}</span>
    </div>
  );
}
