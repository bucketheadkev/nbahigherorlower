import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { TEAMS } from '@/lib/tradeup/teams';
import { cardInfo } from './cards';
import type { Slot } from './config';

export interface PlayerView {
  name: string;
  teamId: string;
  teamName: string;
  era: string;
  /** First and last initials, letters only: Kobe Bryant → KB, J.J. Redick → JR. */
  initials: string;
  primary: string;
  accent: string;
  ink: string;
  eligible: Slot[];
}

const cache = new Map<string, PlayerView>();

export function playerView(playerId: string): PlayerView {
  const hit = cache.get(playerId);
  if (hit) return hit;
  const player = getHistPlayerById(playerId);
  const m = /^hist_(\d{4}s)_([A-Za-z]+)_/.exec(playerId);
  const teamId = player?.teamId ?? m?.[2] ?? '';
  const name = player?.name ?? playerId.replace(/^hist_\d{4}s_[A-Za-z]+_/, '').replace(/_/g, ' ');
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  const initials = (parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
  const colors = getTeamColors(teamId);
  const view: PlayerView = {
    name,
    teamId,
    teamName: TEAMS.find((t) => t.id === teamId)?.fullName ?? teamId,
    era: m?.[1] ?? '',
    initials,
    primary: colors.primary,
    accent: colors.accent,
    ink: contrastOnPrimary(colors.primary),
    eligible: (cardInfo(playerId)?.eligible ?? []) as Slot[],
  };
  cache.set(playerId, view);
  return view;
}
