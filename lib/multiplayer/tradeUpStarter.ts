import { buildTeamAllErasRoster } from '@/lib/tradeup/billionDollar';
import { TEAMS } from '@/lib/tradeup/teams';
import { TRADE_UP_STARTER_MAX_DOLLARS } from '@/lib/multiplayer/gameModes';
import type { TradeUpPlayerSnapshot } from '@/lib/multiplayer/modeConfig';

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Shared low-tier starter for Trade Up — deterministic from seed so both devices match.
 * Prefer `${roomId}:${modeSeed}` so rematches can roll a new starter.
 */
export function pickTradeUpStarter(seed: string): TradeUpPlayerSnapshot {
  const pool = TEAMS.flatMap((team) =>
    buildTeamAllErasRoster(team).filter((p) => p.dollarValue <= TRADE_UP_STARTER_MAX_DOLLARS),
  );

  const candidates =
    pool.length > 0
      ? pool
      : TEAMS.flatMap((team) => buildTeamAllErasRoster(team)).sort(
          (a, b) => a.dollarValue - b.dollarValue,
        );

  const idx = hashSeed(`tradeup:${seed}`) % Math.max(1, candidates.length);
  const pick = candidates[idx]!;
  return {
    name: pick.name,
    teamId: pick.teamId,
    teamName: TEAMS.find((t) => t.id === pick.teamId)?.fullName ?? pick.teamId,
    era: String(pick.sourceEra ?? '2020s'),
    dollarValue: Math.round(pick.dollarValue),
    playerId: pick.id,
  };
}
