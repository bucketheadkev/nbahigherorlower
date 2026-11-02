/**
 * Dev-only `?franchisePreview=1[&fast=1][&bank=N][&reset=1]`: an in-browser stand-in for the v5
 * Franchise RPCs that mirrors 20261101_1_franchise_v5_chests.sql, so the mode can be played end
 * to end before the migration is applied. Never active in production; the real Bank is never
 * touched. State persists in localStorage (survives reloads). `fast=1` makes a 12-hour paycheck
 * period last 12 seconds.
 */

import { cardCatalog, cardSlug, type CardInfo } from '@/lib/tradeup/franchise/cards';
import { CHESTS, PAYCHECK, SHOP_CHESTS, type ChestId, type Slot } from '@/lib/tradeup/franchise/config';
import { franchisePrice, RESALE, resaleValue, CHAMPIONSHIPS, compareFranchises } from '@/lib/tradeup/ownership/config';
import { TEAMS } from '@/lib/tradeup/teams';
import { clearIntroSeenLocally } from '@/lib/tradeup/franchise/introSeen';
import type { FFailure } from './franchiseV5Cloud';

const KEY = 'oneb_franchise_preview_v5';
const SLOTS: Slot[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const TIERS = ['goat', 'legend', 'superstar', 'all_star', 'pro'] as const;

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const periodMs = () => PAYCHECK.periodHours * (param('fast') === '1' ? 1000 : 3_600_000);

interface PCard {
  id: string;
  player_id: string;
  tier: string;
  fans: number;
  source: string;
  acquired_at: string;
}
interface POpen {
  id: string;
  request_id: string;
  chest_id: ChestId;
  price: number;
  cards: { card_id: string; player_id: string; tier: string; fans: number; slot: Slot | null }[];
  created_at: string;
  revealed: boolean;
}
interface PState {
  bank: number;
  intro: boolean;
  starter: boolean;
  owned: { ownership_id: string; team_id: string; price_paid: number } | null;
  pay: { ownership_id: string; period_start: number; periods_paid: number; last_at: number; fans: number; fan_ms: number } | null;
  lineup: Partial<Record<Slot, string>>;
  cards: PCard[];
  opens: POpen[];
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `p${Math.random().toString(36).slice(2)}`);

function load(): PState {
  if (param('reset') === '1' && !sessionStorage.getItem(`${KEY}:reset`)) {
    sessionStorage.setItem(`${KEY}:reset`, '1');
    localStorage.removeItem(KEY);
    clearIntroSeenLocally('preview');
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as PState;
  } catch {
    /* fresh */
  }
  return {
    bank: Number(param('bank')) || 300_000_000,
    intro: false,
    starter: false,
    owned: null,
    pay: null,
    lineup: {},
    cards: [],
    opens: [],
  };
}

function save(s: PState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

const lineupFans = (s: PState) =>
  SLOTS.reduce((sum, slot) => sum + (s.cards.find((c) => c.id === s.lineup[slot])?.fans ?? 0), 0);

const periodPay = (fanMs: number) => Math.floor((Math.max(0, fanMs) * PAYCHECK.payPpm) / (1_000_000 * periodMs()));

function settle(s: PState): number {
  const p = s.pay;
  if (!p) return 0;
  let paid = 0;
  for (let n = 0; n < 400; n++) {
    const end = p.period_start + periodMs();
    if (end > Date.now()) break;
    const pay = periodPay(p.fan_ms + p.fans * (end - p.last_at));
    s.bank += pay;
    paid += pay;
    p.periods_paid += 1;
    p.period_start = end;
    p.last_at = end;
    p.fan_ms = 0;
  }
  return paid;
}

function touch(s: PState) {
  settle(s);
  if (!s.pay) return;
  const now = Date.now();
  s.pay.fan_ms += s.pay.fans * Math.max(0, now - s.pay.last_at);
  s.pay.last_at = now;
  s.pay.fans = lineupFans(s);
}

function openPay(s: PState) {
  if (!s.owned || s.pay?.ownership_id === s.owned.ownership_id) return;
  const now = Date.now();
  s.pay = { ownership_id: s.owned.ownership_id, period_start: now, periods_paid: 0, last_at: now, fans: lineupFans(s), fan_ms: 0 };
}

function closePay(s: PState) {
  settle(s);
  if (s.pay) {
    s.bank += periodPay(s.pay.fan_ms + s.pay.fans * Math.max(0, Date.now() - s.pay.last_at));
    s.pay = null;
  }
}

let byTier: Map<string, CardInfo[]> | null = null;
function pool(tier: string): CardInfo[] {
  if (!byTier) {
    byTier = new Map();
    for (const c of cardCatalog().values()) {
      const list = byTier.get(c.tier) ?? [];
      list.push(c);
      byTier.set(c.tier, list);
    }
  }
  return byTier.get(tier) ?? [];
}

function draw(tier: string, minBp: number, slot: Slot | null, exclude: Set<string>): CardInfo {
  const from = Math.max(0, TIERS.indexOf(tier as (typeof TIERS)[number]));
  for (let i = from; i < TIERS.length; i++) {
    const list = pool(TIERS[i]!).filter(
      (c) => (i === from ? c.scoreBp >= minBp : true) && (!slot || c.eligible.includes(slot)) && !exclude.has(cardSlug(c.playerId)),
    );
    if (list.length > 0) return list[Math.floor(Math.random() * list.length)]!;
  }
  throw new Error('empty_pool');
}

function roll(chest: ChestId) {
  const r = Math.floor(Math.random() * 10_000);
  let acc = 0;
  for (const o of CHESTS[chest].odds) {
    acc += o.bps;
    if (r < acc) return o;
  }
  return CHESTS[chest].odds[CHESTS[chest].odds.length - 1]!;
}

function snapshot(s: PState, paidNow = 0) {
  return {
    version: 5,
    server_time: new Date().toISOString(),
    settings: { pay_period_hours: PAYCHECK.periodHours, pay_ppm: PAYCHECK.payPpm, resale_bps: RESALE.refundBps },
    bank: s.bank,
    profile: { intro_seen: s.intro, starter_claimed: s.starter },
    owned: s.owned ? { ...s.owned, resale_value: resaleValue(s.owned.price_paid) } : null,
    pay: s.pay
      ? {
          period_start: new Date(s.pay.period_start).toISOString(),
          period_end: new Date(s.pay.period_start + periodMs()).toISOString(),
          periods_paid: s.pay.periods_paid,
          last_at: new Date(s.pay.last_at).toISOString(),
          fans: s.pay.fans,
          // The app treats this as fan-seconds; the preview clock may run fast.
          fan_seconds: s.pay.fan_ms / 1000,
        }
      : null,
    lineup: SLOTS.filter((slot) => s.lineup[slot]).map((slot) => ({ slot, card_id: s.lineup[slot] })),
    cards: [...s.cards].sort((a, b) => b.fans - a.fans),
    pending: s.opens.filter((o) => !o.revealed),
    chests: (['starter', ...SHOP_CHESTS] as ChestId[]).map((id) => ({
      id,
      price: CHESTS[id].price,
      picks: CHESTS[id].picks,
      guarantee: CHESTS[id].guarantee,
      odds: CHESTS[id].odds.map((o) => ({ tier: o.tier, bps: o.bps, min_score_bp: Math.round((o.minScore ?? 0) * 10_000) })),
    })),
    franchises: TEAMS.map((t) => ({ teamId: t.id, name: t.fullName, championships: CHAMPIONSHIPS[t.id] ?? 0 }))
      .sort(compareFranchises)
      .map((t) => ({ team_id: t.teamId, name: t.name, championships: t.championships, price: franchisePrice(t.teamId) })),
    paid_now: paidNow,
  };
}

type Raw = { ok: true; data: unknown } | { ok: false; reason: FFailure };
const fail = (reason: FFailure): Raw => ({ ok: false, reason });

export async function previewV5Call(fn: string, args: Record<string, unknown> | undefined): Promise<Raw> {
  await new Promise((r) => setTimeout(r, 160));
  const s = load();
  const done = (data: unknown): Raw => {
    save(s);
    return { ok: true, data };
  };
  switch (fn) {
    case 'franchise_v5_state': {
      openPay(s);
      const paid = settle(s);
      return done(snapshot(s, paid));
    }
    case 'franchise_v5_mark_intro':
      s.intro = true;
      return done({ ok: true });
    case 'franchise_v5_buy': {
      const team = String(args?.p_team ?? '');
      if (!TEAMS.some((t) => t.id === team)) return fail('error');
      if (s.owned?.team_id === team) return done(snapshot(s));
      const price = franchisePrice(team);
      const refund = s.owned ? resaleValue(s.owned.price_paid) : 0;
      if (s.bank + refund < price) return fail('insufficient');
      if (s.owned) {
        closePay(s);
        s.bank += refund;
      }
      s.bank -= price;
      s.owned = { ownership_id: uid(), team_id: team, price_paid: price };
      openPay(s);
      return done(snapshot(s));
    }
    case 'franchise_v5_open_chest': {
      const chestId = String(args?.p_chest) as ChestId;
      const request = String(args?.p_request ?? '');
      const existing = s.opens.find((o) => o.request_id === request);
      if (existing) return done({ open: existing, state: snapshot(s) });
      const chest = CHESTS[chestId];
      if (!chest) return fail('error');
      if (!s.owned) return fail('no_franchise');
      if (chestId === 'starter' && s.starter) return fail('starter_claimed');
      openPay(s);
      settle(s);
      if (s.bank < chest.price) return fail('insufficient');
      s.bank -= chest.price;
      const openId = uid();
      const drawn = new Set<string>();
      const cards: POpen['cards'] = [];
      for (let i = 0; i < chest.picks; i++) {
        const slot = chestId === 'starter' ? SLOTS[i]! : null;
        const odds = roll(chestId);
        const info = draw(odds.tier, Math.round((odds.minScore ?? 0) * 10_000), slot, drawn);
        drawn.add(cardSlug(info.playerId));
        const card: PCard = {
          id: uid(),
          player_id: info.playerId,
          tier: info.tier,
          fans: info.fans,
          source: chestId === 'starter' ? 'starter' : 'chest',
          acquired_at: new Date().toISOString(),
        };
        s.cards.push(card);
        const personSeated = SLOTS.some((x) => {
          const c = s.cards.find((k) => k.id === s.lineup[x]);
          return c && cardSlug(c.player_id) === cardSlug(card.player_id);
        });
        if (slot && !s.lineup[slot] && !personSeated) s.lineup[slot] = card.id;
        cards.push({ card_id: card.id, player_id: card.player_id, tier: card.tier, fans: card.fans, slot });
      }
      const open: POpen = {
        id: openId,
        request_id: request,
        chest_id: chestId,
        price: chest.price,
        cards,
        created_at: new Date().toISOString(),
        revealed: false,
      };
      s.opens.push(open);
      if (chestId === 'starter') s.starter = true;
      touch(s);
      return done({ open, state: snapshot(s) });
    }
    case 'franchise_v5_reveal': {
      const o = s.opens.find((x) => x.id === String(args?.p_open));
      if (o) o.revealed = true;
      return done(snapshot(s));
    }
    case 'franchise_v5_set_lineup': {
      const slot = String(args?.p_slot) as Slot;
      const card = s.cards.find((c) => c.id === String(args?.p_card));
      if (!card) return fail('account');
      const info = cardCatalog().get(card.player_id);
      if (!SLOTS.includes(slot) || !info?.eligible.includes(slot)) return fail('invalid_slot');
      const from = SLOTS.find((x) => s.lineup[x] === card.id) ?? null;
      if (from === slot) return done(snapshot(s));
      const dup = SLOTS.some((x) => {
        if (x === slot || x === from) return false;
        const c = s.cards.find((k) => k.id === s.lineup[x]);
        return c && cardSlug(c.player_id) === cardSlug(card.player_id);
      });
      if (dup) return fail('duplicate_player');
      const current = s.lineup[slot];
      if (from && current) {
        const cur = s.cards.find((k) => k.id === current);
        if (!cur || !cardCatalog().get(cur.player_id)?.eligible.includes(from)) return fail('invalid_slot');
        s.lineup[from] = current;
      } else if (from) {
        delete s.lineup[from];
      }
      s.lineup[slot] = card.id;
      touch(s);
      return done(snapshot(s));
    }
    case 'franchise_v5_sell_duplicate': {
      const card = s.cards.find((c) => c.id === String(args?.p_card));
      if (!card) return done({ ...snapshot(s), sold: 0 });
      if (SLOTS.some((x) => s.lineup[x] === card.id)) return fail('error');
      if (!s.cards.some((c) => c.id !== card.id && c.player_id === card.player_id)) return fail('error');
      const price = CHESTS[card.tier as ChestId]?.price ?? 0;
      if (price <= 0) return fail('error');
      s.cards = s.cards.filter((c) => c.id !== card.id);
      s.bank += price;
      return done({ ...snapshot(s), sold: price });
    }
    default:
      return fail('error');
  }
}
