'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import {
  getTeamLogoFallbackUrl,
  getTeamLogoUrl,
  logMissingTeamLogo,
} from '@/lib/tradeup/teamLogos';

interface TeamLogoProps {
  teamId: string;
  abbreviation: string;
  size?: 'default' | 'sm' | 'xs' | 'panel';
}

/**
 * Team mark — SportsLogos fallback, then abbreviation.
 */
export function TeamLogo({ teamId, abbreviation, size = 'default' }: TeamLogoProps) {
  const colors = getTeamColors(teamId);
  const primaryUrl = getTeamLogoUrl(teamId, size === 'panel' ? 'panel' : 'thumb');
  const fallbackUrl = getTeamLogoFallbackUrl(teamId);
  const [src, setSrc] = useState<string | undefined>(primaryUrl);
  const [failed, setFailed] = useState(false);

  const sizeClass =
    size === 'xs'
      ? ' team-logo--xs'
      : size === 'sm'
        ? ' team-logo--sm'
        : size === 'panel'
          ? ' team-logo--panel'
          : '';

  useEffect(() => {
    setSrc(primaryUrl);
    setFailed(false);
    if (!primaryUrl && !fallbackUrl) logMissingTeamLogo(teamId, abbreviation);
  }, [primaryUrl, fallbackUrl, teamId, abbreviation]);

  const handleError = () => {
    if (src === primaryUrl && fallbackUrl && fallbackUrl !== primaryUrl) {
      setSrc(fallbackUrl);
      return;
    }
    setFailed(true);
    logMissingTeamLogo(teamId, abbreviation);
  };

  const showImage = Boolean(src) && !failed;
  const label = abbreviation.slice(0, 3).toUpperCase();

  return (
    <div
      className={`team-logo${sizeClass}${showImage ? ' team-logo--img' : ' team-logo--fallback'}`}
      style={
        {
          '--logo-primary': colors.primary,
          '--logo-accent': colors.accent,
        } as CSSProperties
      }
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="team-logo-image"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleError}
        />
      ) : (
        <span className="team-logo__abbr">{label}</span>
      )}
    </div>
  );
}
