import type { H2HPosition } from './h2hPenalty';
import { H2H_POSITIONS } from './h2hPenalty';
import type { H2HGameMode } from './gameModes';
import {
  KNOCKOUT_WINS_TO_FINISH,
  TRADE_UP_ATTEMPTS,
  TRADE_UP_STARTER_MAX_DOLLARS,
} from './gameModes';

export type { H2HGameMode };

export interface BountyModeConfig {
  bountyPosition: H2HPosition;
  multiplier: 2;
  revealed: boolean;
}

export interface TradeUpPlayerSnapshot {
  name: string;
  teamId: string;
  teamName: string;
  era: string;
  dollarValue: number;
  playerId: string;
}

export interface TradeUpPlayerState {
  current: TradeUpPlayerSnapshot;
  attemptsRemaining: number;
  finished: boolean;
}

export interface TradeUpModeConfig {
  attemptsTotal: number;
  starterMaxDollars: number;
  starter: TradeUpPlayerSnapshot;
  p1: TradeUpPlayerState;
  p2: TradeUpPlayerState;
}

export interface KnockoutModeConfig {
  winsToFinish: number;
  p1Wins: number;
  p2Wins: number;
  startedAt: string | null;
}

export type H2HModeConfig =
  | { mode: 'classic' }
  | { mode: 'bounty'; bounty: BountyModeConfig }
  | { mode: 'tradeUp'; tradeUp: TradeUpModeConfig }
  | { mode: 'knockout'; knockout: KnockoutModeConfig };

export function pickSharedBountyPosition(seed: string): H2HPosition {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return H2H_POSITIONS[hash % H2H_POSITIONS.length]!;
}

export function bountyAdjustedTotal(
  rounds: Array<{
    position: H2HPosition;
    p1_adjusted_value?: number | null;
    p2_adjusted_value?: number | null;
  }>,
  bountyPosition: H2HPosition,
  multiplier = 2,
): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (const round of rounds) {
    const a = Math.round(round.p1_adjusted_value ?? 0);
    const b = Math.round(round.p2_adjusted_value ?? 0);
    const mult = round.position === bountyPosition ? multiplier : 1;
    p1 += a * mult;
    p2 += b * mult;
  }
  return { p1, p2 };
}

export function classicModeConfig(): H2HModeConfig {
  return { mode: 'classic' };
}

export function bountyModeConfig(roomId: string): H2HModeConfig {
  return {
    mode: 'bounty',
    bounty: {
      bountyPosition: pickSharedBountyPosition(roomId),
      multiplier: 2,
      revealed: false,
    },
  };
}

export function knockoutModeConfig(): H2HModeConfig {
  return {
    mode: 'knockout',
    knockout: {
      winsToFinish: KNOCKOUT_WINS_TO_FINISH,
      p1Wins: 0,
      p2Wins: 0,
      startedAt: null,
    },
  };
}

export function tradeUpModeConfig(starter: TradeUpPlayerSnapshot): H2HModeConfig {
  const slot: TradeUpPlayerState = {
    current: starter,
    attemptsRemaining: TRADE_UP_ATTEMPTS,
    finished: false,
  };
  return {
    mode: 'tradeUp',
    tradeUp: {
      attemptsTotal: TRADE_UP_ATTEMPTS,
      starterMaxDollars: TRADE_UP_STARTER_MAX_DOLLARS,
      starter,
      p1: { ...slot, current: { ...starter } },
      p2: { ...slot, current: { ...starter } },
    },
  };
}

function asTradePlayer(raw: unknown): TradeUpPlayerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? '').trim();
  if (!name) return null;
  return {
    name,
    teamId: String(row.teamId ?? ''),
    teamName: String(row.teamName ?? '—'),
    era: String(row.era ?? '—'),
    dollarValue: Math.round(Number(row.dollarValue ?? 0)),
    playerId: String(row.playerId ?? ''),
  };
}

function asTradeSlot(raw: unknown, fallback: TradeUpPlayerSnapshot | null): TradeUpPlayerState {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const current = asTradePlayer(row.current) ?? fallback;
  return {
    current: current ?? {
      name: '—',
      teamId: '',
      teamName: '—',
      era: '—',
      dollarValue: 0,
      playerId: '',
    },
    attemptsRemaining: Math.max(0, Math.round(Number(row.attemptsRemaining ?? TRADE_UP_ATTEMPTS))),
    finished: Boolean(row.finished),
  };
}

export function parseModeConfig(raw: unknown, fallback: H2HGameMode = 'classic'): H2HModeConfig {
  if (!raw || typeof raw !== 'object') {
    if (fallback === 'knockout') return knockoutModeConfig();
    if (fallback === 'bounty') return bountyModeConfig('fallback');
    if (fallback === 'tradeUp') {
      return tradeUpModeConfig({
        name: '—',
        teamId: '',
        teamName: '—',
        era: '—',
        dollarValue: 0,
        playerId: '',
      });
    }
    return classicModeConfig();
  }
  const row = raw as Record<string, unknown>;
  const mode = row.mode ?? fallback;
  if (mode === 'bounty' && row.bounty && typeof row.bounty === 'object') {
    const b = row.bounty as Record<string, unknown>;
    const pos = b.bountyPosition;
    return {
      mode: 'bounty',
      bounty: {
        bountyPosition:
          pos === 'PG' || pos === 'SG' || pos === 'SF' || pos === 'PF' || pos === 'C'
            ? pos
            : 'SF',
        multiplier: 2,
        revealed: Boolean(b.revealed),
      },
    };
  }
  if ((mode === 'tradeUp' || fallback === 'tradeUp') && row.tradeUp && typeof row.tradeUp === 'object') {
    const t = row.tradeUp as Record<string, unknown>;
    const starter = asTradePlayer(t.starter);
    return {
      mode: 'tradeUp',
      tradeUp: {
        attemptsTotal: Math.round(Number(t.attemptsTotal ?? TRADE_UP_ATTEMPTS)) || TRADE_UP_ATTEMPTS,
        starterMaxDollars:
          Math.round(Number(t.starterMaxDollars ?? TRADE_UP_STARTER_MAX_DOLLARS)) ||
          TRADE_UP_STARTER_MAX_DOLLARS,
        starter: starter ?? {
          name: '—',
          teamId: '',
          teamName: '—',
          era: '—',
          dollarValue: 0,
          playerId: '',
        },
        p1: asTradeSlot(t.p1, starter),
        p2: asTradeSlot(t.p2, starter),
      },
    };
  }
  if (mode === 'knockout' && row.knockout && typeof row.knockout === 'object') {
    const k = row.knockout as Record<string, unknown>;
    return {
      mode: 'knockout',
      knockout: {
        winsToFinish: Number(k.winsToFinish) || KNOCKOUT_WINS_TO_FINISH,
        p1Wins: Math.max(0, Math.round(Number(k.p1Wins ?? 0))),
        p2Wins: Math.max(0, Math.round(Number(k.p2Wins ?? 0))),
        startedAt:
          typeof k.startedAt === 'string' && k.startedAt.trim()
            ? k.startedAt
            : null,
      },
    };
  }
  if (fallback === 'knockout') return knockoutModeConfig();
  if (fallback === 'bounty') return bountyModeConfig(String(row.seed ?? 'fallback'));
  return classicModeConfig();
}

export function resolveBountyPosition(
  modeConfig: H2HModeConfig,
  roomId: string,
  seed: string | null,
): H2HPosition {
  if (modeConfig.mode === 'bounty') return modeConfig.bounty.bountyPosition;
  return pickSharedBountyPosition(seed ? `${roomId}:${seed}` : roomId);
}
