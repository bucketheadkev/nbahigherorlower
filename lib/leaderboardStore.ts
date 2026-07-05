import type { LeaderboardEntry } from '@/types/leaderboard';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data', 'leaderboard.json');
const REDIS_KEY = 'nba-higher-lower:leaderboard';

async function readFileEntries(): Promise<LeaderboardEntry[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFileEntries(entries: LeaderboardEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

async function readRedisEntries(): Promise<LeaderboardEntry[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(`${url}/get/${REDIS_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { result?: string | null };
  if (!data.result) return [];
  try {
    const parsed = JSON.parse(data.result) as LeaderboardEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRedisEntries(entries: LeaderboardEntry[]): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  const response = await fetch(`${url}/set/${REDIS_KEY}/${encodeURIComponent(JSON.stringify(entries))}`, {
    headers: { Authorization: `Bearer ${token}` },
    method: 'POST',
    cache: 'no-store',
  });

  return response.ok;
}

export async function getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  const redisEntries = await readRedisEntries();
  if (redisEntries !== null) return redisEntries;
  return readFileEntries();
}

export async function saveLeaderboardEntries(entries: LeaderboardEntry[]): Promise<void> {
  const savedToRedis = await writeRedisEntries(entries);
  if (!savedToRedis) {
    await writeFileEntries(entries);
  }
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '').toLowerCase();
}

export async function upsertLeaderboardEntry(
  xUsername: string,
  streak: number,
  mode: string,
): Promise<LeaderboardEntry[]> {
  const username = normalizeUsername(xUsername);
  if (!username || streak < 1) return getLeaderboardEntries();

  const entries = await getLeaderboardEntries();
  const existingIndex = entries.findIndex((entry) => entry.xUsername === username);

  if (existingIndex >= 0 && streak <= entries[existingIndex].bestStreak) {
    return entries;
  }

  const nextEntry: LeaderboardEntry = {
    id: existingIndex >= 0 ? entries[existingIndex].id : `${username}-${Date.now()}`,
    xUsername: username,
    bestStreak: existingIndex >= 0 ? Math.max(streak, entries[existingIndex].bestStreak) : streak,
    mode,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.push(nextEntry);
  }

  await saveLeaderboardEntries(entries);
  return entries;
}

export function sortLeaderboard(entries: LeaderboardEntry[], limit = 10): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => b.bestStreak - a.bestStreak || a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, limit);
}

export function normalizeXUsername(username: string): string {
  return normalizeUsername(username);
}
