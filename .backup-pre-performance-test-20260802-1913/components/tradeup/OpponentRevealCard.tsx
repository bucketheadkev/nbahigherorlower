'use client';

import { useCallback, useRef } from 'react';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { isSTier } from '@/lib/tradeup/tiers';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { getTeam } from '@/lib/tradeup/teams';
import { PlayerHeadshot } from './PlayerHeadshot';
import { TeamLogo } from './TeamLogo';

interface OpponentRevealCardProps {
  slot: Position;
  player: TradePlayer;
  revealed: boolean;
  revealing: boolean;
}

/** Flip-only card for opponent reveals — no Keep / Trade Up chrome. */
export function OpponentRevealCard({
  slot,
  player,
  revealed,
  revealing,
}: OpponentRevealCardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const team = getTeam(player.teamId);
  const teamName = team?.fullName ?? player.teamId;

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (revealed || revealing || event.pointerType === 'touch') return;
      const node = wrapRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      node.style.setProperty('--card-tilt-x', `${(0.5 - y) * 12}deg`);
      node.style.setProperty('--card-tilt-y', `${(x - 0.5) * 14}deg`);
    },
    [revealed, revealing],
  );

  const handlePointerLeave = useCallback(() => {
    const node = wrapRef.current;
    if (!node) return;
    node.style.setProperty('--card-tilt-x', '0deg');
    node.style.setProperty('--card-tilt-y', '0deg');
  }, []);

  return (
    <div className="lineup-card-motion">
      <div
        ref={wrapRef}
        className={[
          'lineup-card-wrap',
          'opponent-card-wrap',
          revealed ? 'lineup-card-wrap--revealed' : '',
          revealing ? 'lineup-card-wrap--revealing' : '',
          player && isSTier(player)
            ? 'lineup-card-wrap--front-s'
            : 'lineup-card-wrap--front-standard',
          'lineup-card-wrap--red',
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div className={`lineup-card${revealed ? ' lineup-card--revealed' : ''}`}>
          <div className="lineup-card__inner">
            <div className="lineup-card__face lineup-card__back" aria-hidden={revealed}>
              <span className="lineup-card__back-glow" />
              <span className="lineup-card__back-shine" />
              <span className="lineup-card__back-pattern" />
              <span className="lineup-card__back-frame" />
              <span className="lineup-card__pos">{slot}</span>
              <span className="lineup-card__pos-full">{POSITION_LABELS[slot]}</span>
            </div>
            <div className="lineup-card__face lineup-card__front">
              <div className="lineup-card__photo">
                <PlayerHeadshot
                  name={player.name}
                  teamId={player.teamId}
                  playerId={player.id}
                  headshotUrl={player.headshotUrl}
                  size="card-lg"
                  priority={revealed}
                />
              </div>
              <div className="lineup-card__info">
                <span className="lineup-card__pos lineup-card__pos--small">{slot}</span>
                <h3 className="lineup-card__name">{player.name}</h3>
                <div className="lineup-card__team">
                  <TeamLogo teamId={player.teamId} abbreviation={player.teamId} size="xs" />
                  <span>{teamName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
