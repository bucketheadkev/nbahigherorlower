import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcriptPath =
  'C:/Users/swang/.cursor/projects/c-Users-swang-nba-perfect-run/agent-transcripts/0eb58c67-3766-4ba9-bd5a-228a78b31677/0eb58c67-3766-4ba9-bd5a-228a78b31677.jsonl';
const transcript = fs.readFileSync(transcriptPath, 'utf8');

const line = transcript.split('\n').find((l) => l.includes("p('tatum'"));
if (!line) throw new Error('seed line not found');
const obj = JSON.parse(line);
const write = obj.message.content.find(
  (c) => c.type === 'tool_use' && c.name === 'Write' && c.input?.path?.includes('rosters.ts'),
);
let text = write.input.contents;
// Remove broken tail from early transcript version
const cut = text.indexOf('\n\n// Fix invalid entry');
if (cut !== -1) {
  text = text.slice(0, cut);
}
text = text.replace(/\n  p\('davis_g'[^\n]+\n/, '\n');
// Append standard exports from current project
text += `

export const ALL_PLAYERS: TradePlayer[] = ROSTER.filter((pl) => pl.id !== 'davis_g' && pl.id !== 'clark_r');

const TRADE_POOL_MIN_VALUE = 22;

export function getPlayersByTeam(teamId: string): TradePlayer[] {
  return ALL_PLAYERS.filter((pl) => pl.teamId === teamId);
}

export function getTeamTradePool(teamId: string): TradePlayer[] {
  const roster = getPlayersByTeam(teamId);
  const starters = roster
    .filter((pl) => pl.isStarter)
    .sort((a, b) => b.tradeValue - a.tradeValue)
    .slice(0, 5);

  const starterIds = new Set(starters.map((pl) => pl.id));
  const rotation = roster
    .filter((pl) => !starterIds.has(pl.id) && pl.tradeValue >= TRADE_POOL_MIN_VALUE)
    .sort((a, b) => b.tradeValue - a.tradeValue);

  let bench = rotation.slice(0, 5);
  if (starters.length + bench.length < 10) {
    const extra = roster
      .filter((pl) => !starterIds.has(pl.id) && !bench.some((b) => b.id === pl.id))
      .sort((a, b) => b.tradeValue - a.tradeValue);
    bench = [...bench, ...extra].slice(0, 10 - starters.length);
  }

  return [...starters, ...bench].slice(0, 10);
}

export function getPlayerById(id: string): TradePlayer | undefined {
  return ALL_PLAYERS.find((pl) => pl.id === id);
}

export function getLowValueStarters(): TradePlayer[] {
  return ALL_PLAYERS.filter((pl) => pl.tradeValue >= 18 && pl.tradeValue <= 32);
}
`;

fs.writeFileSync(path.join(__dirname, 'rosters.seed.txt'), text);
console.log('Wrote seed', text.length, 'bytes');
