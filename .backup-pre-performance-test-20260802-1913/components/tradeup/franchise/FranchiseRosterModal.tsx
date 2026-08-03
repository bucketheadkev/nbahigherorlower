'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FranchiseData } from '@/lib/tradeup/franchise/types';
import {
  countFilledInZone,
  getOtherLineupPlayerIds,
  getZonePlayerIds,
} from '@/lib/tradeup/franchise/operations';
import { getPlayerById } from '@/lib/tradeup/rosters';
import { getTeam } from '@/lib/tradeup/teams';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { LINEUP_SIZE } from '@/lib/tradeup/franchise/types';
import { PlayerHeadshot } from '../PlayerHeadshot';
import { TierBadge } from '../TierBadge';

export type RosterModalView = 'menu' | 'replace-starting' | 'replace-bench' | 'swap';

interface FranchiseRosterModalProps {
  playerId: string;
  zone: 'collection' | 'starting' | 'bench';
  data: FranchiseData;
  view: RosterModalView;
  onViewChange: (view: RosterModalView) => void;
  onClose: () => void;
  onAssignStarting: (replacePlayerId?: string) => void;
  onAssignBench: (replacePlayerId?: string) => void;
  onMoveToCollection: () => void;
  onSwap: (targetPlayerId: string) => void;
  onSell: () => void;
}

function PlayerPickRow({
  playerId,
  onSelect,
}: {
  playerId: string;
  onSelect: () => void;
}) {
  const player = getPlayerById(playerId);
  if (!player) return null;
  const team = getTeam(player.teamId);

  return (
    <button type="button" className="franchise-roster-pick" onClick={onSelect}>
      <PlayerHeadshot
        name={player.name}
        teamId={player.teamId}
        playerId={player.id}
        headshotUrl={player.headshotUrl}
        size="card"
      />
      <span className="franchise-roster-pick-info">
        <span className="franchise-roster-pick-name">{player.name}</span>
        <span className="franchise-roster-pick-meta">
          {player.position} · {player.stats.ppg.toFixed(1)} PPG
        </span>
      </span>
      <TierBadge tier={getPlayerTier(player)} />
    </button>
  );
}

export function FranchiseRosterModal({
  playerId,
  zone,
  data,
  view,
  onViewChange,
  onClose,
  onAssignStarting,
  onAssignBench,
  onMoveToCollection,
  onSwap,
  onSell,
}: FranchiseRosterModalProps) {
  const player = getPlayerById(playerId);
  const inStarting = zone === 'starting';
  const inBench = zone === 'bench';
  const inLineup = inStarting || inBench;
  const startersFull = countFilledInZone(data, 'starting') >= LINEUP_SIZE;
  const benchFull = countFilledInZone(data, 'bench') >= LINEUP_SIZE;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view !== 'menu') onViewChange('menu');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onViewChange, onClose]);

  if (!player) return null;

  const teamName = getTeam(player.teamId)?.fullName ?? player.teamId;

  const handleAddStarting = () => {
    if (startersFull && zone !== 'starting') {
      onViewChange('replace-starting');
      return;
    }
    onAssignStarting();
  };

  const handleAddBench = () => {
    if (benchFull && zone !== 'bench') {
      onViewChange('replace-bench');
      return;
    }
    onAssignBench();
  };

  const replaceIds =
    view === 'replace-starting'
      ? getZonePlayerIds(data, 'starting')
      : view === 'replace-bench'
        ? getZonePlayerIds(data, 'bench')
        : [];

  const swapIds = view === 'swap' ? getOtherLineupPlayerIds(data, playerId) : [];

  return (
    <AnimatePresence>
      <motion.div
        className="franchise-roster-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="franchise-roster-sheet"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="franchise-roster-title"
        >
          <div className="franchise-roster-sheet-handle" aria-hidden />

          <div className="franchise-roster-sheet-player">
            <PlayerHeadshot
              name={player.name}
              teamId={player.teamId}
              playerId={player.id}
              headshotUrl={player.headshotUrl}
              size="card-lg"
            />
            <div className="franchise-roster-sheet-player-text">
              <h3 id="franchise-roster-title" className="franchise-roster-sheet-name">
                {player.name}
              </h3>
              <p className="franchise-roster-sheet-team">{teamName}</p>
              <p className="franchise-roster-sheet-stats">
                {player.position} · {player.stats.ppg.toFixed(1)} PPG ·{' '}
                <TierBadge tier={getPlayerTier(player)} />
              </p>
            </div>
          </div>

          {view === 'menu' ? (
            <div className="franchise-roster-actions">
              {!inStarting ? (
                <button type="button" className="franchise-roster-action" onClick={handleAddStarting}>
                  {inLineup ? 'Move to Starting Five' : 'Add to Starting Five'}
                </button>
              ) : null}
              {!inBench ? (
                <button type="button" className="franchise-roster-action" onClick={handleAddBench}>
                  {inLineup ? 'Move to Bench' : 'Add to Bench'}
                </button>
              ) : null}
              {inLineup ? (
                <>
                  <button
                    type="button"
                    className="franchise-roster-action"
                    onClick={onMoveToCollection}
                  >
                    Move to My Collection
                  </button>
                  <button
                    type="button"
                    className="franchise-roster-action"
                    onClick={() => onViewChange('swap')}
                  >
                    Swap Player
                  </button>
                </>
              ) : null}
              {zone === 'collection' ? (
                <button
                  type="button"
                  className="franchise-roster-action franchise-roster-action--danger"
                  onClick={onSell}
                >
                  Sell Player
                </button>
              ) : null}
              <button type="button" className="franchise-roster-action franchise-roster-action--ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          ) : null}

          {view === 'replace-starting' || view === 'replace-bench' ? (
            <div className="franchise-roster-pick-list">
              <p className="franchise-roster-pick-heading">Select a player to replace</p>
              {replaceIds.map((id) => (
                <PlayerPickRow
                  key={id}
                  playerId={id}
                  onSelect={() => {
                    if (view === 'replace-starting') onAssignStarting(id);
                    else onAssignBench(id);
                  }}
                />
              ))}
              <button
                type="button"
                className="franchise-roster-action franchise-roster-action--ghost"
                onClick={() => onViewChange('menu')}
              >
                Back
              </button>
            </div>
          ) : null}

          {view === 'swap' ? (
            <div className="franchise-roster-pick-list">
              <p className="franchise-roster-pick-heading">Select a player to swap with</p>
              {swapIds.length === 0 ? (
                <p className="franchise-roster-pick-empty">No other lineup players available.</p>
              ) : (
                swapIds.map((id) => (
                  <PlayerPickRow key={id} playerId={id} onSelect={() => onSwap(id)} />
                ))
              )}
              <button
                type="button"
                className="franchise-roster-action franchise-roster-action--ghost"
                onClick={() => onViewChange('menu')}
              >
                Back
              </button>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
