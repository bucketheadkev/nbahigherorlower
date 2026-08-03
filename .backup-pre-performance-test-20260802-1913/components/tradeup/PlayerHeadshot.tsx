'use client';

/**
 * Team-color name face — no photos, no tier, no jersey number.
 * Kept as PlayerHeadshot so legacy call sites keep working.
 */

import { getPlayerById } from '@/lib/tradeup/rosters';
import { PlayerCardVisual } from './PlayerCardVisual';

interface PlayerHeadshotProps {
  name: string;
  teamId: string;
  playerId?: string;
  headshotUrl?: string;
  size?: 'hero' | 'card' | 'card-lg' | 'asset' | 'candidate' | 'modal' | 'fill' | 'xs';
  priority?: boolean;
  tradeValue?: number;
}

function mapSize(
  size: NonNullable<PlayerHeadshotProps['size']>,
): 'sm' | 'md' | 'lg' | 'fill' {
  if (size === 'xs') return 'sm';
  if (size === 'fill' || size === 'hero' || size === 'modal' || size === 'card-lg') return 'fill';
  if (size === 'asset' || size === 'candidate') return 'lg';
  return 'md';
}

export function PlayerHeadshot({
  name,
  teamId,
  playerId,
  size = 'card',
}: PlayerHeadshotProps) {
  const rosterPlayer = playerId ? getPlayerById(playerId) : undefined;
  const player = {
    id: playerId ?? rosterPlayer?.id ?? `${teamId}-${name}`,
    name: rosterPlayer?.name ?? name,
    teamId: rosterPlayer?.teamId ?? teamId,
  };

  return (
    <div className={`player-headshot player-headshot--identity player-headshot--${size}`}>
      <PlayerCardVisual player={player} variant="face" size={mapSize(size)} />
    </div>
  );
}
