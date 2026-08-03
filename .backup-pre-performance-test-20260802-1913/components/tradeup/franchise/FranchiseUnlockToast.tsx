'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlayerById } from '@/lib/tradeup/rosters';
import { getTeam } from '@/lib/tradeup/teams';

interface FranchiseUnlockToastProps {
  playerName: string | null;
  status: 'new' | 'duplicate' | null;
  onDone: () => void;
}

export function FranchiseUnlockToast({ playerName, status, onDone }: FranchiseUnlockToastProps) {
  useEffect(() => {
    if (!status || !playerName) return;
    const timer = window.setTimeout(onDone, 2800);
    return () => window.clearTimeout(timer);
  }, [status, playerName, onDone]);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {status && playerName ? (
        <div className="franchise-toast-host">
          <motion.div
            className={`franchise-toast franchise-toast--${status}`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <span className="franchise-toast-label">
              {status === 'new' ? 'New player added' : 'Already in franchise'}
            </span>
            <span className="franchise-toast-name">{playerName}</span>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function getFranchisePlayerDisplay(playerId: string) {
  const player = getPlayerById(playerId);
  if (!player) return null;
  const teamName = getTeam(player.teamId)?.fullName ?? player.teamId;
  return { player, teamName };
}
