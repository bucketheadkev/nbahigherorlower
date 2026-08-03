'use client';

import { motion } from 'framer-motion';
import type { TradePlayer } from '@/lib/tradeup/types';
import { getPrimaryStrength } from '@/lib/tradeup/engine';
import { PlayerHeadshot } from './PlayerHeadshot';

interface PlayerOptionProps {
  player: TradePlayer;
  disabled: boolean;
  picked?: boolean;
  submitted?: boolean;
  accepted?: boolean;
  rejected?: boolean;
  onSelect: (player: TradePlayer, element: HTMLButtonElement) => void;
}

function nameSizeClass(name: string): string {
  if (name.length > 22) return ' game-candidate__name--xs';
  if (name.length > 17) return ' game-candidate__name--sm';
  return '';
}

function specialtySizeClass(specialty: string): string {
  if (specialty.length > 18) return ' game-candidate__specialty--compact';
  return '';
}

export function PlayerOption({
  player,
  disabled,
  picked,
  submitted,
  accepted,
  rejected,
  onSelect,
}: PlayerOptionProps) {
  const specialty = getPrimaryStrength(player);
  const teamAbbr = player.teamId.toUpperCase();

  const stateClass = accepted
    ? ' game-candidate--accepted'
    : rejected
      ? ' game-candidate--rejected'
      : picked
        ? ' game-candidate--picked'
        : submitted
          ? ' game-candidate--submitted'
          : '';

  return (
    <motion.button
      type="button"
      className={`game-candidate${stateClass}`}
      disabled={disabled}
      onClick={(event) => onSelect(player, event.currentTarget)}
      aria-pressed={picked}
      aria-label={`Select ${player.name}, ${teamAbbr}, ${player.stats.ppg.toFixed(1)} points per game`}
      whileHover={disabled ? undefined : { y: -2, transition: { duration: 0.15 } }}
      whileTap={disabled ? undefined : { scale: 0.98, transition: { duration: 0.1 } }}
    >
      {picked ? (
        <span className="game-candidate__check" aria-hidden>
          ✓
        </span>
      ) : null}

      <div className="game-candidate__photo">
        <PlayerHeadshot
          name={player.name}
          teamId={player.teamId}
          playerId={player.id}
          headshotUrl={player.headshotUrl}
          size="fill"
        />
      </div>

      <div className="game-candidate__body">
        <div className="game-candidate__identity">
          <span className="game-candidate__abbr">{teamAbbr}</span>
          <span className={`game-candidate__name${nameSizeClass(player.name)}`}>{player.name}</span>
        </div>
        <div className="game-candidate__meta-row">
          <span className="game-candidate__ppg-line">{player.stats.ppg.toFixed(1)} PPG</span>
          <span className={`game-candidate__specialty${specialtySizeClass(specialty)}`}>{specialty}</span>
        </div>
      </div>
    </motion.button>
  );
}
