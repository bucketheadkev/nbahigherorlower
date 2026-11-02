/**
 * Writes the GENERATED FRANCHISE V5 DATA block of
 * supabase/migrations/20261101_1_franchise_v5_chests.sql from lib/tradeup/franchise/config.ts,
 * lib/tradeup/franchise/cards.ts and lib/tradeup/ownership/config.ts (franchise prices):
 * paycheck settings, the chest catalog, franchise prices and every card's tier, score and fans.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/generate-franchise-v5.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardCatalog, cardSlug, FAME, GOAT_FANS } from '../lib/tradeup/franchise/cards';
import { CHESTS, PAYCHECK, SHOP_CHESTS, type ChestId } from '../lib/tradeup/franchise/config';
import { CHAMPIONSHIPS, compareFranchises, franchisePrice } from '../lib/tradeup/ownership/config';
import { TEAMS } from '../lib/tradeup/teams';

const FILE = join(process.cwd(), 'supabase/migrations/20261101_1_franchise_v5_chests.sql');
const BEGIN = '-- BEGIN GENERATED FRANCHISE V5 DATA (scripts/generate-franchise-v5.ts — do not edit by hand)';
const END = '-- END GENERATED FRANCHISE V5 DATA';
const esc = (s: string) => s.replace(/'/g, "''");

const cards = [...cardCatalog().values()].sort((a, b) => a.playerId.localeCompare(b.playerId));
const slugs = new Set(cards.map((c) => cardSlug(c.playerId)));
for (const slug of [...Object.keys(GOAT_FANS), ...Object.keys(FAME)]) {
  if (!slugs.has(slug)) throw new Error(`Curated player ${slug} is not in the card pool`);
}

for (const chest of Object.values(CHESTS)) {
  const total = chest.odds.reduce((sum, o) => sum + o.bps, 0);
  if (total !== 10_000) throw new Error(`${chest.id} odds add up to ${total} bps`);
}

const chestOrder: ChestId[] = ['starter', ...SHOP_CHESTS];
const chestRows = chestOrder.map((id, i) => {
  const c = CHESTS[id];
  const odds = JSON.stringify(c.odds.map((o) => ({ tier: o.tier, bps: o.bps, min_score_bp: Math.round((o.minScore ?? 0) * 10_000) })));
  return `  ('${c.id}', ${c.price}, ${c.picks}, '${c.guarantee}', '${odds}'::jsonb, ${i})`;
});

const priceRows = TEAMS.map((t) => ({ teamId: t.id, name: t.fullName, championships: CHAMPIONSHIPS[t.id] ?? 0 }))
  .sort(compareFranchises)
  .map((t, i) => `  ('${t.teamId}', ${franchisePrice(t.teamId)}, ${i + 1})`);

const cardRows = cards.map((c) => {
  const m = /^hist_(\d{4}s)_([A-Za-z]+)_/.exec(c.playerId);
  if (!m) throw new Error(`Unexpected player id ${c.playerId}`);
  return `  ('${esc(c.playerId)}', '${m[2]}', '${m[1]}', ARRAY[${c.eligible.map((p) => `'${p}'`).join(', ')}]::text[], '${c.tier}', ${c.scoreBp}, ${c.fans})`;
});

const block = `${BEGIN}
UPDATE public.franchise_settings SET pay_period_hours = ${PAYCHECK.periodHours}, pay_ppm = ${PAYCHECK.payPpm} WHERE id;

INSERT INTO public.franchise_chests (id, price, picks, guarantee, odds, sort) VALUES
${chestRows.join(',\n')}
ON CONFLICT (id) DO UPDATE
  SET price = EXCLUDED.price, picks = EXCLUDED.picks, guarantee = EXCLUDED.guarantee,
      odds = EXCLUDED.odds, sort = EXCLUDED.sort;

UPDATE public.franchise_catalog cat SET price = v.price, sort = v.sort
FROM (VALUES
${priceRows.join(',\n')}
) AS v (team_id, price, sort)
WHERE cat.team_id = v.team_id;

UPDATE public.franchise_player_pool SET card_tier = NULL, card_score_bp = NULL, card_fans = NULL WHERE card_tier IS NOT NULL;
INSERT INTO public.franchise_player_pool (player_id, team_id, era, eligible, card_tier, card_score_bp, card_fans) VALUES
${cardRows.join(',\n')}
ON CONFLICT (player_id) DO UPDATE
  SET eligible = EXCLUDED.eligible, card_tier = EXCLUDED.card_tier,
      card_score_bp = EXCLUDED.card_score_bp, card_fans = EXCLUDED.card_fans;
${END}`;

const sql = readFileSync(FILE, 'utf8');
const start = sql.indexOf(BEGIN);
const end = sql.indexOf(END);
if (start < 0 || end < 0) throw new Error('Generated block markers not found');
writeFileSync(FILE, sql.slice(0, start) + block + sql.slice(end + END.length));
console.log(`franchise v5: ${cards.length} cards, ${chestRows.length} chests, ${priceRows.length} prices`);
