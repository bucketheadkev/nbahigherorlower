'use client';

import { getStatValue } from '@/lib/categories';
import { formatStatValue } from '@/lib/formatters';
import type { FeedbackState, Player, StatCategory } from '@/types/game';

interface PlayerCardProps {
  player: Player;
  category: StatCategory;
  categoryLabel: string;
  revealed: boolean;
  feedback?: FeedbackState;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function PlayerCard({
  player,
  category,
  categoryLabel,
  revealed,
  feedback = 'idle',
}: PlayerCardProps) {
  const value = formatStatValue(getStatValue(player, category), category);

  const feedbackClass =
    feedback === 'correct'
      ? 'animate-correct-pulse border-emerald-400/40'
      : feedback === 'wrong'
        ? 'animate-wrong-shake border-red-400/40'
        : 'border-white/[0.08]';

  return (
    <article className={`glass-card card-enter flex flex-1 flex-col items-center gap-4 p-5 sm:p-6 ${feedbackClass}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] sm:h-20 sm:w-20">
        <span className="text-lg font-semibold text-white/80 sm:text-xl">{getInitials(player.name)}</span>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-tight text-white sm:text-2xl">{player.name}</h2>
        <p className="mt-1 text-xs font-medium text-white/40">{player.team}</p>
      </div>

      <div className="w-full border-t border-white/[0.06] pt-4 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">{categoryLabel}</p>
        <div className={`mt-2 min-h-[3rem] ${revealed ? 'animate-stat-reveal' : ''}`}>
          {revealed ? (
            <p className="stat-number text-3xl font-bold tabular-nums text-white sm:text-4xl">{value}</p>
          ) : (
            <p className="stat-number text-3xl font-bold tabular-nums text-white/20 sm:text-4xl">???</p>
          )}
        </div>
      </div>
    </article>
  );
}
