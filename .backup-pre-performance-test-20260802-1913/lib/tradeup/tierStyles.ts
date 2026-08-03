import type { PlayerTier } from './tiers';

export interface TierStyle {
  label: string;
  color: string;
  glow: string;
  border: string;
  bg: string;
}

export const TIER_STYLES: Record<PlayerTier, TierStyle> = {
  F: {
    label: 'F Tier',
    color: '#fca5a5',
    glow: 'rgba(185, 28, 28, 0.35)',
    border: 'rgba(185, 28, 28, 0.55)',
    bg: 'rgba(185, 28, 28, 0.12)',
  },
  D: {
    label: 'D Tier',
    color: '#fdba74',
    glow: 'rgba(234, 88, 12, 0.3)',
    border: 'rgba(234, 88, 12, 0.5)',
    bg: 'rgba(234, 88, 12, 0.1)',
  },
  C: {
    label: 'C Tier',
    color: '#fde047',
    glow: 'rgba(202, 138, 4, 0.28)',
    border: 'rgba(202, 138, 4, 0.48)',
    bg: 'rgba(202, 138, 4, 0.1)',
  },
  B: {
    label: 'B Tier',
    color: '#93c5fd',
    glow: 'rgba(37, 99, 235, 0.32)',
    border: 'rgba(37, 99, 235, 0.5)',
    bg: 'rgba(37, 99, 235, 0.1)',
  },
  A: {
    label: 'A Tier',
    color: '#6ee7b7',
    glow: 'rgba(5, 150, 105, 0.3)',
    border: 'rgba(5, 150, 105, 0.48)',
    bg: 'rgba(5, 150, 105, 0.1)',
  },
  S: {
    label: 'S Tier',
    color: '#f5d77a',
    glow: 'rgba(212, 175, 55, 0.38)',
    border: 'rgba(212, 175, 55, 0.55)',
    bg: 'rgba(212, 175, 55, 0.12)',
  },
  GOAT: {
    label: 'GOAT',
    color: '#e9d5ff',
    glow: 'rgba(168, 85, 247, 0.45)',
    border: 'rgba(216, 180, 254, 0.7)',
    bg: 'rgba(126, 34, 206, 0.18)',
  },
};
