const X_USERNAME_KEY = 'nba-higher-lower-x-username';

export function getXUsername(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(X_USERNAME_KEY) ?? '';
}

export function saveXUsername(username: string): string {
  if (typeof window === 'undefined') return '';
  const normalized = username.trim().replace(/^@+/, '').toLowerCase();
  localStorage.setItem(X_USERNAME_KEY, normalized);
  return normalized;
}

export function formatXHandle(username: string): string {
  if (!username) return '';
  return `@${username.replace(/^@+/, '')}`;
}

export async function submitLeaderboardScore(
  streak: number,
  mode: string,
): Promise<boolean> {
  const xUsername = getXUsername();
  if (!xUsername || streak < 1) return false;

  try {
    const response = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xUsername, streak, mode }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLeaderboard(limit = 10) {
  try {
    const response = await fetch(`/api/leaderboard?limit=${limit}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      entries?: Array<{ xUsername: string; bestStreak: number; mode: string; updatedAt: string }>;
    };
    return data.entries ?? [];
  } catch {
    return [];
  }
}
