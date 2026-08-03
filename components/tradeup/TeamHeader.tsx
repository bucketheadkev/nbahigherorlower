'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { motion } from 'framer-motion';
import type { TeamInfo } from '@/lib/tradeup/types';
import { TeamLogo } from './TeamLogo';

interface TeamHeaderProps {
  team: TeamInfo;
  needs: string[];
  skipsRemaining: number;
  onSkip: () => void;
  skipDisabled?: boolean;
}

export function TeamHeader({
  team,
  needs,
  skipsRemaining,
  onSkip,
  skipDisabled,
}: TeamHeaderProps) {
  const reduceMotion = useGameReducedMotion();

  return (
    <motion.section
      className="game-offer-panel"
      key={team.id}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      aria-label={`Trading with the ${team.fullName}`}
    >
      <div className="game-offer-panel__header">
        <TeamLogo teamId={team.id} abbreviation={team.id} size="sm" />
        <div className="game-offer-panel__titles">
          <span className="game-offer-panel__eyebrow">Trading with</span>
          <h2 className="game-offer-panel__name">{team.fullName}</h2>
        </div>
      </div>

      <div className="game-offer-panel__needs">
        <span className="game-offer-panel__needs-label">Team needs</span>
        <ul className="game-offer-panel__tags">
          {needs.map((need) => (
            <li key={need} className="game-offer-panel__tag">
              {need}
            </li>
          ))}
        </ul>
      </div>

      <div className="game-offer-panel__footer">
        <button
          type="button"
          className="game-offer-panel__skip"
          onClick={onSkip}
          disabled={skipDisabled || skipsRemaining <= 0}
        >
          Skip team
        </button>
        <span className="game-offer-panel__skips">{skipsRemaining} skips left</span>
      </div>
    </motion.section>
  );
}
