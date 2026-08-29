/**
 * Bake audited primaryPosition values into lib/tradeup/rosters.ts.
 * Run: node scripts/bake-primary-positions.mjs
 */
import fs from 'node:fs';

const ROSTER_PATH = 'lib/tradeup/rosters.ts';

/** Explicit primary-position audit. Overrides the positional arg in each p() call. */
const PRIMARY_BY_ID = {
  // --- Existing SG corrections (was PG in import) ---
  mccollum: 'SG',
  alexander_w: 'SG',
  aaron_wiggins: 'SG',
  hield: 'SG',
  daniels: 'SG',
  white: 'SG',
  mann: 'SG',
  allen: 'SG',
  powell: 'SG',
  mitchell: 'SG',
  strus: 'SG',
  huerter: 'SG',
  joe: 'SG',
  herro: 'SG',
  trent_jr: 'SG',
  beaupre: 'SG',
  simons: 'SG',
  edgecombe: 'SG',
  bateman: 'SG',
  tre_johnson: 'SG',
  klay_thompson: 'SG',
  christie: 'SG',
  braun: 'SG',
  strawther: 'SG',
  bogdanovic: 'SG',
  reed_sheppard: 'SG',
  mathurin: 'SG',
  dick: 'SG',
  reaves: 'SG',
  grimes: 'SG',
  hardy: 'SG',
  'caldwell-pope': 'SG',
  anthony_edwards: 'SG',
  green_j: 'SG',
  divincenzo: 'SG',
  dosunmu: 'SG',
  shannon: 'SG',
  poole: 'SG',
  hawkins: 'SG',
  dort: 'SG',
  caruso: 'SG',
  wallace: 'SG',
  booker: 'SG',
  green_jalen: 'SG',
  luke_kennard: 'SG',
  thybulle: 'SG',
  shaedon_sharpe: 'SG',
  lavine: 'SG',
  monk: 'SG',
  vassell: 'SG',
  okogie: 'SG',
  svi_mykhailiuk: 'SG',

  // Additional PG→SG (true shooting guards mislabeled as PG)
  harden: 'SG',
  holiday: 'SG',
  tim_jr: 'SG',
  moses_moody: 'SG',
  payton_ii: 'SG',
  melton: 'SG',
  merrill: 'SG',
  podz: 'SG',
  sheppard: 'SG',
  lawson: 'SG',
  branham: 'SG',
  caris_levert: 'SG',
  garrett_temple: 'SG',
  howard: 'SG',
  tre_mann: 'SG',
  white_c: 'SG',

  // PG→SF / wing
  watson: 'SF',
  jaylon_tyson: 'SF',
  baylor_scheierman: 'SF',
  drake_powell: 'SF',
  gonzalez: 'SF',
  will_riley: 'SF',
  konchar: 'SF',

  // PG→PF
  kenrich_williams: 'PF',

  // SG→SF (true small forwards)
  brown: 'SF',
  hart: 'SF',

  // --- Existing PF corrections (was SF) ---
  johnson_j: 'PF',
  julius_randle: 'PF',
  grant_williams: 'PF',
  williams_p: 'PF',
  mobley: 'PF',
  williams_jazz: 'PF',
  siakam: 'PF',
  toppin: 'PF',
  jarace_walker: 'PF',
  giannis: 'PF',
  portis: 'PF',
  kuzma_was: 'PF',
  banchero: 'PF',
  isaac: 'PF',
  davis: 'PF',
  aldama: 'PF',
  washington: 'PF',
  gordon: 'PF',
  najee: 'PF',
  daron_ii: 'PF',
  green: 'PF',
  smith: 'PF',
  eason: 'PF',
  hachimura: 'PF',
  vanderbilt: 'PF',
  kleber: 'PF',
  laravia: 'PF',
  grant: 'PF',
  hendricks: 'PF',
  williamson: 'PF',
  ryan_dunn: 'PF',
  murray_k: 'PF',
  harris_t: 'PF',
  harrison_barnes: 'PF',
  markkanen: 'PF',
  jackson: 'PF',
  kevin_love: 'PF',

  // Additional SF→PF
  barnes: 'PF',
  clowney: 'PF',
  guerschon_yabusele: 'PF',
  wade: 'PF',
  trendon_watford: 'PF',
  jovic: 'PF',
  finney: 'PF',
  royce_oneale: 'PF',
  barlow: 'PF',
  collin_murray_boyles: 'PF',
  'collin_murray-boyles': 'PF',

  // --- Existing C corrections ---
  okongwu: 'C',
  moritz_wagner: 'C',
  gafford: 'C',
  bagley: 'C',
  looney: 'C',
  isaiah_stewart: 'C',
  beringer: 'C',
  derik_queen: 'C',
  jaylin_williams: 'C',
  sabonis: 'C',
  eubanks: 'C',
  isaiah_jackson: 'C',
  kelly_olynyk: 'C',
  wemby: 'C',

  // Additional SF→C (true centers mislabeled as SF)
  collins: 'C',
  jackson_d: 'C',
  jalen_smith: 'C',
  paul_reed: 'C',

  // --- Existing SF corrections (wings who were PG) ---
  ausar_thompson: 'SF',
  oconnor: 'SF',
  nesmith: 'SF',
  bridges_m: 'SF',
  coulibaly: 'SF',
  bey: 'SF',
  williams_j: 'SF',
  bailey: 'SF',
};

const VALID = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

let src = fs.readFileSync(ROSTER_PATH, 'utf8');

// Collect every player id + current position arg
const players = [];
for (const match of src.matchAll(
  /p\(\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'\s*,\s*'([^']+)'\s*,\s*'([A-Z/]+)'/g,
)) {
  players.push({
    id: match[1],
    name: match[2].replace(/\\'/g, "'"),
    team: match[3],
    raw: match[4],
    index: match.index,
    full: match[0],
  });
}

const missingAudit = [];
const invalid = [];
const multi = [];
const finalById = {};

for (const player of players) {
  if (player.raw.includes('/')) multi.push(player);
  const primary = PRIMARY_BY_ID[player.id] ?? player.raw;
  if (!VALID.has(primary)) {
    invalid.push({ ...player, primary });
  }
  if (!(player.id in PRIMARY_BY_ID) && !VALID.has(player.raw)) {
    missingAudit.push(player);
  }
  finalById[player.id] = primary;
}

if (invalid.length || multi.length) {
  console.error('Invalid or multi-position values found:', { invalid, multi });
  process.exit(1);
}

// Rewrite each position argument to the audited primary
let next = src;
for (const player of players) {
  const primary = finalById[player.id];
  const needle = `p('${player.id}', '${player.name.replace(/'/g, "\\'")}', '${player.team}', '${player.raw}'`;
  // Names in file may use escaped quotes; rebuild from actual match
  const from = player.full.replace(/'([A-Z/]+)'$/, `'${primary}'`);
  // Safer: replace only the 4th quoted arg after the known id
  const pattern = new RegExp(
    `(p\\(\\s*'${player.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*,\\s*'(?:\\\\'|[^'])*'\\s*,\\s*'[^']+'\\s*,\\s*)'([A-Z/]+)'`,
  );
  if (!pattern.test(next)) {
    console.error('Failed to locate player for rewrite:', player.id);
    process.exit(1);
  }
  next = next.replace(pattern, `$1'${primary}'`);
}

// Replace override block + p() helper with primaryPosition-aware constructor
const helperStart = next.indexOf('/**\n * The imported roster historically');
const helperEnd = next.indexOf('export const ROSTER');
if (helperStart < 0 || helperEnd < 0) {
  console.error('Could not locate helper block');
  process.exit(1);
}

const newHelper = `const CANONICAL_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function p(
  id: string,
  name: string,
  teamId: string,
  primaryPosition: Position,
  age: number,
  stats: PlayerStats,
  tradeValue: number,
  isStarter: boolean,
  isFranchise = false,
): TradePlayer {
  if (!(CANONICAL_POSITIONS as readonly string[]).includes(primaryPosition)) {
    throw new Error(\`Invalid primaryPosition "\${primaryPosition}" for player \${id}\`);
  }
  if (primaryPosition.includes('/')) {
    throw new Error(\`Multi-position primaryPosition "\${primaryPosition}" for player \${id}\`);
  }

  const hiddenEliteOffer = isHiddenEliteOfferId(id);
  const hiddenValue = isHiddenValueId(id);
  return {
    id,
    name,
    teamId,
    primaryPosition,
    /** @deprecated Use primaryPosition — kept equal for legacy UI reads. */
    position: primaryPosition,
    age,
    stats,
    tradeValue,
    isStarter,
    isFranchise,
    ...(hiddenEliteOffer ? { hiddenEliteOffer: true } : {}),
    ...(hiddenValue ? { hiddenValue: true } : {}),
  };
}

`;

next = next.slice(0, helperStart) + newHelper + next.slice(helperEnd);

fs.writeFileSync(ROSTER_PATH, next);

const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
for (const id of Object.keys(finalById)) counts[finalById[id]] += 1;

console.log(
  JSON.stringify(
    {
      total: players.length,
      counts,
      auditedOverrides: Object.keys(PRIMARY_BY_ID).length,
      sga: finalById.sga,
      jokic: finalById.jokic,
      sample: {
        booker: finalById.booker,
        brown: finalById.brown,
        giannis: finalById.giannis,
        wemby: finalById.wemby,
        harden: finalById.harden,
        barnes: finalById.barnes,
      },
    },
    null,
    2,
  ),
);
