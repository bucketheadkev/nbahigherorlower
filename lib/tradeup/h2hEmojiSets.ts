import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';

/** Reaction emojis per position round — rotates each slot. */
export const H2H_EMOJI_SETS: readonly (readonly string[])[] = [
  ['🐐', '👑', '👏', '😂'],
  ['🔥', '🎯'],
  ['🏆', '⭐', '🙌'],
  ['💰', '🚀', '🤣'],
  ['🎉', '💎', '😮'],
] as const;

const POSITION_ORDER: H2HPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function emojiSetForPosition(position: H2HPosition): readonly string[] {
  const idx = POSITION_ORDER.indexOf(position);
  const safe = idx < 0 ? 0 : idx;
  return H2H_EMOJI_SETS[safe % H2H_EMOJI_SETS.length];
}
