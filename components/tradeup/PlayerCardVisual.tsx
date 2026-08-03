'use client';

import type { CSSProperties } from 'react';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import { getTeam } from '@/lib/tradeup/teams';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { TeamLogo } from './TeamLogo';

type PlayerCardSize = 'sm' | 'md' | 'lg' | 'fill';

interface PlayerRef {
  id: string;
  name: string;
  teamId: string;
}

interface PlayerCardVisualProps {
  player: PlayerRef | TradePlayer;
  /** When set, shows the position label in the meta strip. */
  slot?: Position;
  /**
   * full — team-color name face + black meta strip
   * face — team-color name only
   * meta — black strip only (H2H)
   */
  variant?: 'full' | 'face' | 'meta';
  size?: PlayerCardSize;
  className?: string;
  /** Optional chip overlaid on the color face (e.g. FREE / price). */
  badge?: string | null;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

function NameFace({
  player,
  size,
  badge,
}: {
  player: PlayerRef;
  size: PlayerCardSize;
  badge?: string | null;
}) {
  const colors = getTeamColors(player.teamId);
  const { first, last } = splitName(player.name);

  return (
    <div
      className={`player-card-visual__face player-card-visual__face--${size}`}
      style={{ background: colors.primary } as CSSProperties}
      aria-hidden
    >
      <div className="player-card-visual__name-block">
        <span className="player-card-visual__first">{first}</span>
        {last ? <span className="player-card-visual__last">{last}</span> : null}
      </div>
      {badge ? <span className="player-card-visual__badge">{badge}</span> : null}
    </div>
  );
}

function MetaStrip({
  player,
  slot,
  size,
}: {
  player: PlayerRef;
  slot?: Position;
  size: PlayerCardSize;
}) {
  const team = getTeam(player.teamId);
  return (
    <div className={`player-card-visual__meta player-card-visual__meta--${size}`}>
      {slot ? (
        <span className="player-card-visual__position">{POSITION_LABELS[slot]}</span>
      ) : null}
      <strong className="player-card-visual__meta-name">{player.name}</strong>
      <span className="player-card-visual__team">
        <TeamLogo teamId={player.teamId} abbreviation={player.teamId} size="xs" />
        {team?.id ?? player.teamId}
      </span>
    </div>
  );
}

export function PlayerCardVisual({
  player,
  slot,
  variant = 'full',
  size = 'md',
  className = '',
  badge,
}: PlayerCardVisualProps) {
  const ref: PlayerRef = {
    id: player.id,
    name: player.name,
    teamId: player.teamId,
  };

  if (variant === 'meta') {
    return (
      <article
        className={`player-card-visual player-card-visual--meta player-card-visual--${size} ${className}`.trim()}
        aria-label={`${slot ? `${POSITION_LABELS[slot]} ` : ''}${ref.name}`}
      >
        <MetaStrip player={ref} slot={slot} size={size} />
      </article>
    );
  }

  if (variant === 'face') {
    return (
      <div
        className={`player-card-visual player-card-visual--face player-card-visual--${size} ${className}`.trim()}
        aria-label={ref.name}
      >
        <NameFace player={ref} size={size} badge={badge} />
      </div>
    );
  }

  return (
    <article
      className={`player-card-visual player-card-visual--full player-card-visual--${size} ${className}`.trim()}
      aria-label={`${slot ? `${POSITION_LABELS[slot]} ` : ''}${ref.name}`}
    >
      <NameFace player={ref} size={size} badge={badge} />
      <MetaStrip player={ref} slot={slot} size={size} />
    </article>
  );
}
