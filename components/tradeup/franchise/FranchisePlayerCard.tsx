'use client';

import { getPlayerById } from '@/lib/tradeup/rosters';
import { getTeam } from '@/lib/tradeup/teams';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { TierBadge } from '../TierBadge';
import { PlayerHeadshot } from '../PlayerHeadshot';

interface FranchisePlayerCardProps {
  playerId: string;
  zone: 'collection' | 'starting' | 'bench';
  draggable?: boolean;
  isNew?: boolean;
  onSelect: () => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}

export function FranchisePlayerCard({
  playerId,
  zone,
  draggable = true,
  isNew,
  onSelect,
  onDragStart,
  onDragEnd,
  isDragging,
}: FranchisePlayerCardProps) {
  const player = getPlayerById(playerId);
  if (!player) return null;

  const teamName = getTeam(player.teamId)?.fullName ?? player.teamId;

  return (
    <button
      type="button"
      className={`franchise-player-card franchise-player-card--${zone}${isDragging ? ' franchise-player-card--dragging' : ''}${isNew ? ' franchise-player-card--new' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/player-id', playerId);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(playerId);
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      <PlayerHeadshot
        name={player.name}
        teamId={player.teamId}
        playerId={player.id}
        headshotUrl={player.headshotUrl}
        size="card"
      />
      <div className="franchise-player-card-body">
        <div className="franchise-player-card-top">
          <span className="franchise-player-name">{player.name}</span>
          <TierBadge tier={getPlayerTier(player)} />
        </div>
        <span className="franchise-player-team">{teamName}</span>
        <span className="franchise-player-meta">
          {player.position} · {player.stats.ppg.toFixed(1)} PPG
        </span>
      </div>
    </button>
  );
}
