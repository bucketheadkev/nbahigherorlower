import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';

/** Reaction emojis per position round — always three choices (no 👏 / 🙌 / 🤣). */
export const H2H_EMOJI_SETS: readonly (readonly string[])[] = [
  ['🐐', '👑', '🔥'],
  ['🎯', '🏆', '⭐'],
  ['💰', '🚀', '🎉'],
  ['💎', '😮', '😂'],
  ['🔥', '⭐', '💎'],
] as const;

const EMOJIS_PER_ROUND = 3;

const POSITION_ORDER: H2HPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function emojiSetForPosition(position: H2HPosition): readonly string[] {
  const idx = POSITION_ORDER.indexOf(position);
  const safe = idx < 0 ? 0 : idx;
  const set = [...H2H_EMOJI_SETS[safe % H2H_EMOJI_SETS.length]].slice(0, EMOJIS_PER_ROUND);
  while (set.length < EMOJIS_PER_ROUND) {
    set.push(H2H_EMOJI_SETS[0]![set.length % H2H_EMOJI_SETS[0]!.length]!);
  }
  if (set.length >= EMOJIS_PER_ROUND && set.every((emoji) => emoji === set[0])) {
    set[EMOJIS_PER_ROUND - 1] = set[0] === '🔥' ? '🎯' : '🔥';
  }
  return set;
}
