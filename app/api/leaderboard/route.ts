import { getLeaderboardEntries, sortLeaderboard, upsertLeaderboardEntry } from '@/lib/leaderboardStore';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 50);

  const entries = sortLeaderboard(await getLeaderboardEntries(), limit);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      xUsername?: string;
      streak?: number;
      mode?: string;
    };

    const xUsername = body.xUsername?.trim();
    const streak = body.streak ?? 0;
    const mode = body.mode?.trim() || 'all';

    if (!xUsername || streak < 1) {
      return NextResponse.json({ error: 'Invalid submission' }, { status: 400 });
    }

    await upsertLeaderboardEntry(xUsername, streak, mode);
    const entries = sortLeaderboard(await getLeaderboardEntries(), 10);

    return NextResponse.json({ ok: true, entries });
  } catch {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }
}
