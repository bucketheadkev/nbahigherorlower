/**
 * Dev-only `?franchisePreview=1[&fast=1][&seed=owned|earning|expired]`: an in-browser stand-in for
 * the Franchise + earnings RPCs that mirrors 20261025_4_franchise_v4_fan_power.sql, so the screens can be
 * exercised before the migration is live. Never active in production; nothing reaches the real Bank.
 * State lives in sessionStorage so a refresh resumes a draft. `fast=1` makes one hour last one
 * second; `seed` starts from a bought franchise, a running roster, or an expired one (`team=SAS`
 * picks which franchise).
 */

import { getEligiblePositions } from '@/lib/tradeup/alternatePositions';
import { buildEraRoster, getDollarValueForSlot, listValidSpinPairs } from '@/lib/tradeup/billionDollar';
import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';
import {
  CHAMPIONSHIPS,
  compareFranchises,
  CYCLE_HOURS,
  EARNINGS,
  fanPowerMilli,
  franchisePrice,
  franchiseTier,
  hourlyPay,
  RESALE,
  resaleValue,
} from '@/lib/tradeup/ownership/config';
import { playerFans } from '@/lib/tradeup/ownership/fans';
import { TEAMS } from '@/lib/tradeup/teams';
import type { Position } from '@/lib/tradeup/types';

const SLOTS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const KEY = 'oneb_franchise_preview_v4';

export function isFranchisePreview(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('franchisePreview') === '1';
}

const param = (name: string) =>
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name);
const hourMs = () => (param('fast') === '1' ? 1000 : 3_600_000);

interface PreviewPick {
  slot: Position;
  player_id: string;
  value: number;
  fans: number;
}

interface PreviewCycle {
  id: string;
  team_id: string;
  status: 'drafting' | 'earning' | 'collected' | 'cancelled';
  picks: PreviewPick[];
  spin: { team_id: string; era: string } | null;
  spins: number;
  lineup_value: number | null;
  fans: number | null;
  fan_power_milli: number | null;
  hourly_rate: number | null;
  hours_total: number | null;
  hours_paid: number;
  locked_at: number | null;
  ends_at: number | null;
  ended_at: number | null;
}

interface PreviewState {
  bank: number;
  owned: { team_id: string; price_paid: number; purchased_at: number } | null;
  cycles: PreviewCycle[];
}

const SEED_FIVE: PreviewPick[] = [
  { slot: 'PG', player_id: 'hist_1980s_LAL_magic_johnson', value: 0, fans: 0 },
  { slot: 'SG', player_id: 'hist_1990s_CHI_michael_jordan', value: 0, fans: 0 },
  { slot: 'SF', player_id: 'hist_2010s_MIA_lebron_james', value: 0, fans: 0 },
  { slot: 'PF', player_id: 'hist_2000s_SAS_tim_duncan', value: 0, fans: 0 },
  { slot: 'C', player_id: 'hist_2000s_LAL_shaquille_o_neal', value: 0, fans: 0 },
];

function seedPicks(): PreviewPick[] {
  return SEED_FIVE.flatMap((p) => {
    const player = getHistPlayerById(p.player_id);
    return player ? [{ ...p, value: getDollarValueForSlot(player, p.slot), fans: playerFans(player.id) }] : [];
  });
}

function seeded(): PreviewState {
  const seed = param('seed');
  const bank = 260_000_000;
  if (seed !== 'owned' && seed !== 'earning' && seed !== 'expired') return { bank, owned: null, cycles: [] };
  const team = TEAMS.some((t) => t.id === param('team')) ? param('team')! : 'BOS';
  const price = franchisePrice(team);
  const state: PreviewState = { bank: bank - price, owned: { team_id: team, price_paid: price, purchased_at: Date.now() }, cycles: [] };
  if (seed === 'owned') return state;
  const picks = seedPicks();
  const fans = picks.reduce((sum, p) => sum + p.fans, 0);
  const locked = Date.now() - (seed === 'expired' ? 50 : 5.6) * hourMs();
  state.cycles.push({
    id: `preview_${team}_${locked}`,
    team_id: team,
    status: 'earning',
    picks,
    spin: null,
    spins: 5,
    lineup_value: picks.reduce((s, p) => s + p.value, 0),
    fans,
    fan_power_milli: fanPowerMilli(fans),
    hourly_rate: hourlyPay(price, fans),
    hours_total: CYCLE_HOURS,
    hours_paid: seed === 'expired' ? 40 : 3,
    locked_at: locked,
    ends_at: locked + CYCLE_HOURS * hourMs(),
    ended_at: null,
  });
  return state;
}

function load(): PreviewState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as PreviewState;
  } catch {
    /* fresh */
  }
  return seeded();
}

function save(state: PreviewState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

/** Preview wallet balance — the real Bank is never touched. */
export function previewBank(): number {
  return load().bank;
}

const slug = (id: string) => id.replace(/^hist_\d{4}s_[A-Za-z]+_/, '');

function hoursEarned(c: PreviewCycle, now = Date.now()): number {
  if (c.locked_at == null || c.ends_at == null || c.hours_total == null) return 0;
  const end = Math.min(c.ended_at ?? now, c.ends_at);
  return Math.min(c.hours_total, Math.max(0, Math.floor((end - c.locked_at) / hourMs())));
}

function cycleJson(c: PreviewCycle) {
  const earned = hoursEarned(c);
  return {
    ...c,
    status: c.status === 'earning' && c.ends_at != null && Date.now() >= c.ends_at ? 'complete' : c.status,
    cycle_total: c.hourly_rate != null ? c.hourly_rate * (c.hours_total ?? CYCLE_HOURS) : null,
    completion_bonus: c.hourly_rate != null ? 0 : null,
    hours_earned: earned,
    bonus_earned: false,
    bonus_paid: true,
    unpaid: c.status === 'earning' ? Math.max(earned - c.hours_paid, 0) * (c.hourly_rate ?? 0) : 0,
    locked_at: c.locked_at != null ? new Date(c.locked_at).toISOString() : null,
    ends_at: c.ends_at != null ? new Date(c.ends_at).toISOString() : null,
  };
}

function snapshot(state: PreviewState) {
  const open = state.cycles.find((c) => c.status === 'drafting' || c.status === 'earning');
  return {
    server_time: new Date().toISOString(),
    settings: {
      version: 4,
      cycle_hours: CYCLE_HOURS,
      resale_bps: RESALE.refundBps,
      fans_per_power: EARNINGS.fansPerPower,
      max_power_milli: EARNINGS.maxPowerMilli,
      hourly_ppm: EARNINGS.hourlyPpm,
    },
    owned: state.owned
      ? {
          team_id: state.owned.team_id,
          price_paid: state.owned.price_paid,
          purchased_at: new Date(state.owned.purchased_at).toISOString(),
          resale_value: resaleValue(state.owned.price_paid),
        }
      : null,
    cycle: open ? cycleJson(open) : null,
    franchises: TEAMS.map((t) => ({ teamId: t.id, name: t.fullName, championships: CHAMPIONSHIPS[t.id] ?? 0 }))
      .sort(compareFranchises)
      .map((t) => ({
        team_id: t.teamId,
        name: t.name,
        championships: t.championships,
        tier: franchiseTier(t.teamId),
        price: franchisePrice(t.teamId),
      })),
  };
}

function settle(state: PreviewState, c: PreviewCycle) {
  if (c.status !== 'earning') return { hours: 0, income: 0 };
  const earned = hoursEarned(c);
  const hours = Math.max(earned - c.hours_paid, 0);
  const income = hours * (c.hourly_rate ?? 0);
  state.bank += income;
  c.hours_paid = Math.max(c.hours_paid, earned);
  if (c.hours_paid >= (c.hours_total ?? 0)) c.status = 'collected';
  return { hours, income };
}

type Raw = { ok: true; data: unknown } | { ok: false; reason: 'insufficient' | 'already_own' | 'cycle_active' | 'collect_first' | 'invalid_pick' | 'account' | 'error' };
const fail = (reason: Extract<Raw, { ok: false }>['reason']): Raw => ({ ok: false, reason });
const ok = (data: unknown): Raw => ({ ok: true, data });
const wait = () => new Promise((r) => setTimeout(r, 220));

export async function previewCall(fn: string, args: Record<string, unknown> | undefined): Promise<Raw> {
  await wait();
  const state = load();
  const team = String(args?.p_team ?? '');
  const cycle = state.cycles.find((c) => c.id === String(args?.p_cycle ?? ''));
  const open = state.cycles.find((c) => c.status === 'drafting' || c.status === 'earning');
  const done = (data: unknown) => {
    save(state);
    return ok(data);
  };

  switch (fn) {
    case 'get_franchises':
      save(state);
      return ok(snapshot(state));
    case 'buy_franchise': {
      if (state.owned?.team_id === team) return ok(snapshot(state));
      if (state.owned) return fail('already_own');
      const price = franchisePrice(team);
      if (state.bank < price) return fail('insufficient');
      state.bank -= price;
      state.owned = { team_id: team, price_paid: price, purchased_at: Date.now() };
      return done(snapshot(state));
    }
    case 'sell_franchise': {
      if (!state.owned || state.owned.team_id !== team) return ok({ snapshot: snapshot(state), sale: null });
      let paid = { hours: 0, income: 0 };
      let forfeitedHours = 0;
      if (open?.status === 'drafting') open.status = 'cancelled';
      else if (open) {
        open.ended_at = Math.min(Date.now(), open.ends_at ?? Date.now());
        forfeitedHours = (open.hours_total ?? 0) - hoursEarned(open);
        paid = settle(state, open);
        open.status = 'collected';
      }
      const proceeds = resaleValue(state.owned.price_paid);
      state.bank += proceeds;
      state.owned = null;
      return done({
        snapshot: snapshot(state),
        sale: { team_id: team, proceeds, ...paid, bonus: 0, forfeited_hours: forfeitedHours, forfeited_bonus: 0 },
      });
    }
    case 'start_franchise_draft': {
      if (state.owned?.team_id !== team) return fail('account');
      if (open?.status === 'drafting') return ok(snapshot(state));
      if (open) {
        if (open.ends_at != null && Date.now() < open.ends_at) return fail('cycle_active');
        settle(state, open);
        open.status = 'collected';
      }
      state.cycles.push({
        id: `preview_${team}_${Date.now()}`,
        team_id: team,
        status: 'drafting',
        picks: [],
        spin: null,
        spins: 0,
        lineup_value: null,
        fans: null,
        fan_power_milli: null,
        hourly_rate: null,
        hours_total: null,
        hours_paid: 0,
        locked_at: null,
        ends_at: null,
        ended_at: null,
      });
      return done(snapshot(state));
    }
    case 'franchise_spin': {
      if (!cycle || cycle.status !== 'drafting') return fail('error');
      if (cycle.spin) return ok(cycleJson(cycle));
      const openSlots = SLOTS.filter((s) => !cycle.picks.some((p) => p.slot === s));
      const taken = new Set(cycle.picks.map((p) => slug(p.player_id)));
      const pairs = listValidSpinPairs().filter((pair) =>
        buildEraRoster(pair.team, pair.era).some(
          (p) => !taken.has(slug(p.id)) && getEligiblePositions(p).some((s) => openSlots.includes(s)),
        ),
      );
      const pair = pairs[Math.floor(Math.random() * pairs.length)]!;
      cycle.spin = { team_id: pair.team.id, era: pair.era };
      cycle.spins += 1;
      return done(cycleJson(cycle));
    }
    case 'franchise_pick': {
      if (!cycle || !cycle.spin || cycle.status !== 'drafting') return fail('invalid_pick');
      const slot = String(args?.p_slot) as Position;
      const player = getHistPlayerById(String(args?.p_player_id));
      if (
        !player ||
        !player.id.startsWith(`hist_${cycle.spin.era}_${cycle.spin.team_id}_`) ||
        !getEligiblePositions(player).includes(slot) ||
        cycle.picks.some((p) => p.slot === slot || slug(p.player_id) === slug(player.id))
      ) {
        return fail('invalid_pick');
      }
      cycle.picks.push({ slot, player_id: player.id, value: getDollarValueForSlot(player, slot), fans: playerFans(player.id) });
      cycle.spin = null;
      return done(cycleJson(cycle));
    }
    case 'franchise_move': {
      if (!cycle || cycle.status !== 'drafting') return fail('invalid_pick');
      const from = String(args?.p_from) as Position;
      const to = String(args?.p_to) as Position;
      const pick = cycle.picks.find((p) => p.slot === from);
      const player = pick ? getHistPlayerById(pick.player_id) : null;
      if (!pick || !player || cycle.picks.some((p) => p.slot === to) || !getEligiblePositions(player).includes(to)) {
        return fail('invalid_pick');
      }
      pick.slot = to;
      pick.value = getDollarValueForSlot(player, to);
      return done(cycleJson(cycle));
    }
    case 'confirm_franchise_lineup': {
      if (!cycle || cycle.picks.length !== 5 || !state.owned) return fail('error');
      if (cycle.status !== 'drafting') return ok(cycleJson(cycle));
      const fans = cycle.picks.reduce((sum, p) => sum + p.fans, 0);
      const now = Date.now();
      Object.assign(cycle, {
        status: 'earning',
        lineup_value: cycle.picks.reduce((s, p) => s + p.value, 0),
        fans,
        fan_power_milli: fanPowerMilli(fans),
        hourly_rate: hourlyPay(state.owned.price_paid, fans),
        hours_total: CYCLE_HOURS,
        locked_at: now,
        ends_at: now + CYCLE_HOURS * hourMs(),
      });
      return done(cycleJson(cycle));
    }
    case 'get_pending_earnings': {
      const items = state.cycles
        .filter((c) => c.status === 'earning' && hoursEarned(c) > c.hours_paid)
        .map((c) => {
          const hours = hoursEarned(c) - c.hours_paid;
          return { kind: 'franchise_income', ref: c.id, team_id: c.team_id, hours, amount: hours * (c.hourly_rate ?? 0) };
        });
      return ok({ server_time: new Date().toISOString(), items });
    }
    case 'collect_earnings': {
      const items: Record<string, unknown>[] = [];
      for (const c of state.cycles) {
        const paid = settle(state, c);
        if (paid.income > 0) items.push({ kind: 'franchise_income', ref: c.id, team_id: c.team_id, hours: paid.hours, amount: paid.income });
      }
      return done({ server_time: new Date().toISOString(), items, balance: state.bank });
    }
    default:
      return fail('error');
  }
}
