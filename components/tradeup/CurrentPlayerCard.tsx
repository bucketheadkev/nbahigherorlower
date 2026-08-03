'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { motion } from 'framer-motion';
import type { TradePlayer } from '@/lib/tradeup/types';
import { formatCredits } from '@/lib/tradeup/credits';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { getTeam } from '@/lib/tradeup/teams';
import { TierBadge } from './TierBadge';
import { PlayerHeadshot } from './PlayerHeadshot';
import { TeamLogo } from './TeamLogo';

interface CurrentPlayerCardProps {
  player: TradePlayer;
  celebrate?: boolean;
  sellValue: number;
  onSell: () => void;
  onAddToCollection: () => void;
  actionsDisabled?: boolean;
}

export function CurrentPlayerCard({
  player,
  celebrate,
  sellValue,
  onSell,
  onAddToCollection,
  actionsDisabled,
}: CurrentPlayerCardProps) {
  const reduceMotion = useGameReducedMotion();
  const tier = getPlayerTier(player);
  const team = getTeam(player.teamId);
  const teamName = team?.fullName ?? player.teamId;

  return (
    <motion.section
      className={`hub-asset${celebrate ? ' hub-asset--celebrate' : ''}`}
      key={player.id}
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={
        celebrate && !reduceMotion
          ? { opacity: 1, y: 0, scale: [1, 1.035, 1] }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Your current player"
    >
      <div className="hub-asset__media">
        <PlayerHeadshot
          name={player.name}
          teamId={player.teamId}
          playerId={player.id}
          headshotUrl={player.headshotUrl}
          size="fill"
          priority
        />
        <div className="hub-asset__tier">
          <TierBadge tier={tier} size="large" />
        </div>
      </div>

      <div className="hub-asset__body">
        <p className="hub-asset__eyebrow">Your player</p>
        <h2 className="hub-asset__name">{player.name}</h2>
        <div className="hub-asset__meta">
          <TeamLogo teamId={player.teamId} abbreviation={player.teamId} size="xs" />
          <span>
            {teamName} · {player.stats.ppg.toFixed(1)} PPG
          </span>
        </div>

        <div className="hub-asset__actions">
          <button
            type="button"
            className="hub-link"
            onClick={onSell}
            disabled={actionsDisabled}
          >
            Sell · {formatCredits(sellValue)}
          </button>
          <span className="hub-link__sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="hub-link"
            onClick={onAddToCollection}
            disabled={actionsDisabled}
          >
            Add to Collection
          </button>
        </div>
      </div>
    </motion.section>
  );
}
