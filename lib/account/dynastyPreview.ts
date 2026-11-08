/**
 * Dev-only `?dynastyPreview=1`: Dynasty Road against an in-browser copy of the server rules
 * (20261107_1_dynasty_road.sql + 20261108_1_dynasty_chests.sql), so every screen can be exercised
 * before the migrations are applied.
 *   &reset=1   start empty            &seed=1   a collection in progress, chests in every state, keys
 *   &fast=1    20-second unlocks      &failSign=1  every signing fails like a dropped connection
 * Never active in production builds.
 */

import {
  CHEST_EARN_WEIGHTS,
  CHEST_REWARD_WEIGHTS,
  CHEST_TIER_ORDER,
  DEFAULT_CHEST_RULES,
  FOCUS_MULTIPLIER,
  NEW_PLAYER_BIAS,
  PLAYER_RARITY,
  type ChestTier,
} from '@/lib/tradeup/dynasty/chests';
import { collectiblesInLineup, DYNASTY_COLLECTIONS } from '@/lib/tradeup/dynasty/catalog';

const KEY = 'oneb_dynasty_preview_v2';
const MIN_RUN_VALUE = 1_000_000_000;

interface PreviewRun {
  client_run_id: string;
  verified_value: number;
  lineup: string[];
  achieved_at: string;
}

interface PreviewChest {
  id: string;
  tier: ChestTier;
  earned_at: string;
  unlock_started_at: string | null;
  unlock_ends_at: string | null;
  unlocked_by: 'timer' | 'key' | null;
  opened_at: string | null;
  reward_collection_id: string | null;
  reward_player_id: string | null;
  reward_is_new: boolean | null;
  reward_dup_streak: number | null;
}

interface PreviewDb {
  owned: { collection_id: string; player_id: string; source: string; source_ref: string | null; acquired_at: string }[];
  completed: { collection_id: string; completed_at: string }[];
  claims: { client_run_id: string; collection_id: string; player_id: string; claimed_at: string }[];
  runs: PreviewRun[];
  progress: { points: number; runs_counted: number; chests_earned: number; dup_streak: number; focus: string | null };
  chests: PreviewChest[];
  keys: number;
  key_requests: string[];
  run_rewards: { client_run_id: string; points: number; reason: string; chest_ids: string[]; awarded_at: string }[];
}

export function isDynastyPreview(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('dynastyPreview') === '1';
}

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const unlockSeconds = () => (param('fast') === '1' ? 20 : DEFAULT_CHEST_RULES.unlockSeconds);
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const uid = () => `pv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const empty = (): PreviewDb => ({
  owned: [],
  completed: [],
  claims: [],
  runs: [],
  progress: { points: 0, runs_counted: 0, chests_earned: 0, dup_streak: 0, focus: null },
  chests: [],
  keys: 0,
  key_requests: [],
  run_rewards: [],
});
let initializedFor: string | null = null;

function chest(tier: ChestTier, extra: Partial<PreviewChest> = {}): PreviewChest {
  return {
    id: uid(),
    tier,
    earned_at: iso(),
    unlock_started_at: null,
    unlock_ends_at: null,
    unlocked_by: null,
    opened_at: null,
    reward_collection_id: null,
    reward_player_id: null,
    reward_is_new: null,
    reward_dup_streak: null,
    ...extra,
  };
}

function seeded(): PreviewDb {
  const db = empty();
  const now = Date.now();
  const at = (minutesAgo: number) => iso(now - minutesAgo * 60_000);
  const own = (collection: string, ids: string[], minutesAgo: number, source = 'classic_run') => {
    for (const player_id of ids) db.owned.push({ collection_id: collection, player_id, source, source_ref: null, acquired_at: at(minutesAgo) });
  };
  const chi = DYNASTY_COLLECTIONS.find((c) => c.id === 'chi-1996')!;
  own('chi-1996', chi.slots.map((s) => s.playerId), 600);
  db.completed.push({ collection_id: 'chi-1996', completed_at: at(540) });
  own('dal-2011', ['hist_2010s_DAL_dirk_nowitzki', 'hist_2010s_DAL_jason_kidd'], 300);
  own('dal-2011', ['hist_2010s_DAL_tyson_chandler'], 280, 'chest');
  own('mia-2013', ['hist_2010s_MIA_lebron_james'], 200);
  own('cle-2016', ['hist_2010s_CLE_kyrie_irving', 'hist_2010s_CLE_kevin_love'], 150, 'chest');
  db.runs.push({
    client_run_id: 'preview-unsigned-run',
    verified_value: 1_042_000_000,
    lineup: ['hist_2010s_GSW_stephen_curry', 'hist_2010s_MIA_dwyane_wade', 'hist_2010s_CLE_lebron_james', 'hist_2010s_DAL_dirk_nowitzki', 'hist_1990s_HOU_hakeem_olajuwon'],
    achieved_at: at(30),
  });
  db.chests.push(
    chest('legend', { earned_at: at(400), unlock_started_at: at(380), unlock_ends_at: at(200), unlocked_by: 'timer' }),
    chest('pro', { earned_at: at(120), unlock_started_at: at(46), unlock_ends_at: iso(now + (unlockSeconds() - 46 * 60) * 1000), unlocked_by: 'timer' }),
    chest('superstar', { earned_at: at(60) }),
    chest('goat', { earned_at: at(10) }),
  );
  if (param('fast') === '1') db.chests[1]!.unlock_ends_at = iso(now + 15_000);
  db.progress = { points: 3, runs_counted: 15, chests_earned: 6, dup_streak: 1, focus: 'cle-2016' };
  db.keys = 2;
  return db;
}

function load(): PreviewDb {
  const mode = param('seed') === '1' ? 'seed' : param('reset') === '1' ? 'reset' : null;
  if (mode && initializedFor !== window.location.href) {
    initializedFor = window.location.href;
    const db = mode === 'seed' ? seeded() : empty();
    save(db);
    return db;
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...(JSON.parse(raw) as PreviewDb) } : empty();
  } catch {
    return empty();
  }
}

function save(db: PreviewDb) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

const owns = (db: PreviewDb, collection: string, player: string) =>
  db.owned.some((o) => o.collection_id === collection && o.player_id === player);

const statusOf = (c: PreviewChest, now = Date.now()) =>
  c.opened_at ? 'opened' : !c.unlock_ends_at ? 'waiting' : Date.parse(c.unlock_ends_at) > now ? 'unlocking' : 'ready';

function weighted<T>(items: { item: T; w: number }[]): T | null {
  const total = items.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const x of items) {
    roll -= x.w;
    if (roll < 0) return x.item;
  }
  return items[items.length - 1]!.item;
}

/** Stand-in for the Classic submit + the server's chest-progress trigger, once per run id. */
export function previewRecordRun(clientRunId: string, lineup: string[], value: number) {
  if (!isDynastyPreview()) return;
  const db = load();
  if (db.runs.some((r) => r.client_run_id === clientRunId)) return;
  db.runs.push({ client_run_id: clientRunId, verified_value: value, lineup, achieved_at: iso() });
  const points = DEFAULT_CHEST_RULES.pointsPerRun + (value >= MIN_RUN_VALUE ? DEFAULT_CHEST_RULES.pointsBillionBonus : 0);
  db.progress.points += points;
  db.progress.runs_counted += 1;
  const ids: string[] = [];
  while (db.progress.points >= DEFAULT_CHEST_RULES.pointsPerChest) {
    db.progress.points -= DEFAULT_CHEST_RULES.pointsPerChest;
    const tier = weighted(CHEST_TIER_ORDER.map((t) => ({ item: t, w: CHEST_EARN_WEIGHTS[t] }))) ?? 'pro';
    const c = chest(tier);
    db.chests.push(c);
    ids.push(c.id);
    db.progress.chests_earned += 1;
  }
  db.run_rewards.unshift({ client_run_id: clientRunId, points, reason: 'counted', chest_ids: ids, awarded_at: iso() });
  save(db);
}

function options(db: PreviewDb, lineup: string[]) {
  return collectiblesInLineup(lineup)
    .filter((m) => m.collection.kind === 'championship')
    .map((m) => ({ collection_id: m.collection.id, player_id: m.slot.playerId, owned: owns(db, m.collection.id, m.slot.playerId) }));
}

const focusOf = (db: PreviewDb) => (db.progress.focus && !db.completed.some((c) => c.collection_id === db.progress.focus) ? db.progress.focus : null);

function snapshot(db: PreviewDb) {
  const claimed = new Set(db.claims.map((c) => c.client_run_id));
  const chestTier = new Map(db.chests.map((c) => [c.id, c.tier]));
  const opened = db.chests.filter((c) => c.opened_at).sort((a, b) => b.opened_at!.localeCompare(a.opened_at!)).slice(0, 10);
  return {
    ok: true,
    server_now: iso(),
    min_run_value: MIN_RUN_VALUE,
    owned: db.owned.map((o) => ({
      collection_id: o.collection_id,
      player_id: o.player_id,
      source: o.source,
      acquired_at: o.acquired_at,
      chest_tier: o.source === 'chest' ? (o.source_ref ? chestTier.get(o.source_ref) : 'superstar') ?? null : null,
    })),
    completed: db.completed,
    claims: [...db.claims].sort((a, b) => b.claimed_at.localeCompare(a.claimed_at)).slice(0, 20),
    pending: db.runs
      .filter((r) => r.verified_value >= MIN_RUN_VALUE && !claimed.has(r.client_run_id))
      .map((r) => ({ client_run_id: r.client_run_id, verified_value: r.verified_value, achieved_at: r.achieved_at, options: options(db, r.lineup) }))
      .filter((r) => r.options.some((o) => !o.owned))
      .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
      .slice(0, 20),
    chest_rules: {
      points_per_run: DEFAULT_CHEST_RULES.pointsPerRun,
      points_billion_bonus: DEFAULT_CHEST_RULES.pointsBillionBonus,
      points_per_chest: DEFAULT_CHEST_RULES.pointsPerChest,
      unlock_seconds: unlockSeconds(),
      max_unlocking: DEFAULT_CHEST_RULES.maxUnlocking,
      dup_protection_after: DEFAULT_CHEST_RULES.dupProtectionAfter,
    },
    chest_progress: db.progress,
    focus_collection_id: focusOf(db),
    keys: db.keys,
    chests: [...db.chests.filter((c) => !c.opened_at), ...opened].map((c) => ({ ...c, status: statusOf(c) })),
    run_rewards: db.run_rewards.slice(0, 10),
  };
}

function grant(db: PreviewDb, collection: string, player: string, source: string, ref: string | null) {
  if (owns(db, collection, player)) return { created: false, completed: false };
  db.owned.push({ collection_id: collection, player_id: player, source, source_ref: ref, acquired_at: iso() });
  const target = DYNASTY_COLLECTIONS.find((c) => c.id === collection)!;
  const done = target.slots.every((s) => owns(db, collection, s.playerId)) && !db.completed.some((c) => c.collection_id === collection);
  if (done) db.completed.push({ collection_id: collection, completed_at: iso() });
  return { created: true, completed: done };
}

function rollReward(db: PreviewDb, tier: ChestTier) {
  const focus = focusOf(db);
  const pool = DYNASTY_COLLECTIONS.filter((c) => c.kind === 'championship').flatMap((c) =>
    c.slots.map((s) => ({ collection: c.id, player: s.playerId, rarity: PLAYER_RARITY[s.playerId] ?? 'pro', isNew: !owns(db, c.id, s.playerId) })),
  );
  const counts = new Map<string, number>();
  pool.forEach((p) => counts.set(p.rarity, (counts.get(p.rarity) ?? 0) + 1));
  const base = pool.map((p) => ({
    item: p,
    w:
      (CHEST_REWARD_WEIGHTS[tier][p.rarity] / counts.get(p.rarity)!) *
      (p.isNew ? NEW_PLAYER_BIAS : 1) *
      (p.isNew && p.collection === focus ? FOCUS_MULTIPLIER : 1),
  }));
  const anyNew = pool.some((p) => p.isNew);
  const isProtected = anyNew && db.progress.dup_streak >= DEFAULT_CHEST_RULES.dupProtectionAfter;
  let pickFrom = base;
  if (isProtected) {
    const fresh = base.filter((x) => x.item.isNew);
    pickFrom = fresh.some((x) => x.w > 0) ? fresh : fresh.map((x) => ({ ...x, w: 1 }));
  }
  const item = weighted(pickFrom)!;
  return { item, isProtected, allOwned: !anyNew, focus: item.isNew && item.collection === focus };
}

type PreviewResult = { ok: true; data: unknown; error?: undefined } | { ok: false; error: string; data?: undefined };

export function previewDynastyCall(fn: string, args: Record<string, unknown> | undefined): PreviewResult {
  const db = load();
  const now = Date.now();
  if (fn === 'dynasty_state') return { ok: true, data: snapshot(db) };

  const chestId = String(args?.p_chest_id ?? '');
  const c = db.chests.find((x) => x.id === chestId);

  if (fn === 'dynasty_chest_start_unlock') {
    if (!c) return { ok: false, error: 'chest_not_found' };
    if (c.opened_at) return { ok: false, error: 'chest_opened' };
    if (c.unlock_started_at) return { ok: true, data: snapshot(db) };
    if (db.chests.filter((x) => statusOf(x, now) === 'unlocking').length >= DEFAULT_CHEST_RULES.maxUnlocking) return { ok: false, error: 'unlock_slot_busy' };
    c.unlock_started_at = iso(now);
    c.unlock_ends_at = iso(now + unlockSeconds() * 1000);
    c.unlocked_by = 'timer';
    save(db);
    return { ok: true, data: snapshot(db) };
  }

  if (fn === 'dynasty_chest_use_key') {
    const req = String(args?.p_request_id ?? '');
    if (db.key_requests.includes(req)) return { ok: true, data: { ...snapshot(db), already_applied: true } };
    if (!c) return { ok: false, error: 'chest_not_found' };
    if (c.opened_at) return { ok: false, error: 'chest_opened' };
    if (statusOf(c, now) === 'ready') return { ok: false, error: 'chest_ready' };
    if (db.keys < 1) return { ok: false, error: 'no_keys' };
    db.keys -= 1;
    db.key_requests.push(req);
    c.unlock_started_at = c.unlock_started_at ?? iso(now);
    c.unlock_ends_at = iso(now);
    c.unlocked_by = 'key';
    save(db);
    return { ok: true, data: { ...snapshot(db), already_applied: false } };
  }

  if (fn === 'dynasty_chest_open') {
    if (!c) return { ok: false, error: 'chest_not_found' };
    const reveal = (extra: Record<string, unknown>) => ({
      chest_id: c.id,
      tier: c.tier,
      collection_id: c.reward_collection_id,
      player_id: c.reward_player_id,
      is_new: c.reward_is_new,
      dup_streak: c.reward_dup_streak,
      ...extra,
    });
    if (c.opened_at) return { ok: true, data: { ...snapshot(db), reveal: reveal({ completed_now: false, already_opened: true }) } };
    if (statusOf(c, now) !== 'ready') return { ok: false, error: 'chest_locked' };
    const pick = rollReward(db, c.tier);
    const g = grant(db, pick.item.collection, pick.item.player, 'chest', c.id);
    db.progress.dup_streak = g.created ? 0 : db.progress.dup_streak + 1;
    if (g.completed && db.progress.focus === pick.item.collection) db.progress.focus = null;
    Object.assign(c, {
      opened_at: iso(now),
      reward_collection_id: pick.item.collection,
      reward_player_id: pick.item.player,
      reward_is_new: g.created,
      reward_dup_streak: db.progress.dup_streak,
    });
    save(db);
    return {
      ok: true,
      data: {
        ...snapshot(db),
        reveal: reveal({ protected: pick.isProtected, focus: pick.focus, all_owned: pick.allOwned, completed_now: g.completed, already_opened: false }),
      },
    };
  }

  if (fn === 'dynasty_set_focus') {
    const id = (args?.p_collection_id as string | null) ?? null;
    if (id) {
      const target = DYNASTY_COLLECTIONS.find((x) => x.id === id && x.kind === 'championship');
      if (!target) return { ok: false, error: 'focus_not_eligible' };
      if (db.completed.some((x) => x.collection_id === id)) return { ok: false, error: 'focus_completed' };
    }
    db.progress.focus = id;
    save(db);
    return { ok: true, data: snapshot(db) };
  }

  if (fn !== 'dynasty_sign_from_run') return { ok: false, error: 'unknown_function' };

  const runId = String(args?.p_client_run_id ?? '').trim();
  const collection = String(args?.p_collection_id ?? '');
  const player = String(args?.p_player_id ?? '');
  if (param('failSign') === '1') return { ok: false, error: 'Failed to fetch' };
  const run = db.runs.find((r) => r.client_run_id === runId);
  if (!run) return { ok: false, error: 'run_not_found' };
  const claim = db.claims.find((x) => x.client_run_id === runId);
  if (claim) {
    if (claim.collection_id === collection && claim.player_id === player) {
      return { ok: true, data: { ...snapshot(db), already_signed: true, signed: { collection_id: collection, player_id: player }, completed_now: false } };
    }
    return { ok: false, error: 'run_already_claimed' };
  }
  if (run.verified_value < MIN_RUN_VALUE) return { ok: false, error: 'run_not_qualified' };
  if (!run.lineup.includes(player)) return { ok: false, error: 'player_not_in_run' };
  const target = DYNASTY_COLLECTIONS.find((x) => x.id === collection && x.kind === 'championship');
  if (!target?.slots.some((s) => s.playerId === player)) return { ok: false, error: 'player_not_eligible' };
  if (owns(db, collection, player)) return { ok: false, error: 'already_owned' };

  const g = grant(db, collection, player, 'classic_run', runId);
  db.claims.push({ client_run_id: runId, collection_id: collection, player_id: player, claimed_at: iso() });
  if (g.completed && db.progress.focus === collection) db.progress.focus = null;
  save(db);
  return { ok: true, data: { ...snapshot(db), already_signed: false, signed: { collection_id: collection, player_id: player }, completed_now: g.completed } };
}
