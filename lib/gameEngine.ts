import { PLAYERS } from '@/data/players';
import { getCategoryLabel, getStatValue } from '@/lib/categories';
import type { Guess, Player, RoundState, StatCategory } from '@/types/game';

const MAX_RECENT_MATCHUPS = 8;
const MAX_REROLL_ATTEMPTS = 50;

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getMatchupKey(
  revealedId: string,
  hiddenId: string,
  category: StatCategory,
): string {
  return `${revealedId}-${hiddenId}-${category}`;
}

export function isRecentMatchup(
  recentMatchups: string[],
  revealedId: string,
  hiddenId: string,
  category: StatCategory,
): boolean {
  const key = getMatchupKey(revealedId, hiddenId, category);
  return recentMatchups.includes(key);
}

function getComparableRange(category: StatCategory, revealedValue: number): number {
  switch (category) {
    case 'careerPoints':
      return Math.max(3000, revealedValue * 0.25);
    case 'careerAssists':
    case 'careerRebounds':
      return Math.max(500, revealedValue * 0.3);
    case 'careerBlocks':
    case 'careerSteals':
      return Math.max(200, revealedValue * 0.35);
    case 'championships':
    case 'mvps':
      return 3;
    case 'allStars':
      return 4;
    case 'draftPick':
      return 12;
    case 'height':
      return 6;
    case 'age':
      return 8;
    case 'careerEarnings':
      return revealedValue * 0.35;
    case 'instagramFollowers':
      return revealedValue * 0.4;
    default:
      return revealedValue * 0.3;
  }
}

function pickHiddenPlayer(
  revealed: Player,
  category: StatCategory,
  recentMatchups: string[],
  excludeIds: string[] = [],
): Player {
  const revealedValue = getStatValue(revealed, category);
  const range = getComparableRange(category, revealedValue);

  const pool = PLAYERS.filter(
    (p) => p.id !== revealed.id && !excludeIds.includes(p.id),
  );

  let candidates = pool.filter((p) => {
    const value = getStatValue(p, category);
    return (
      value !== revealedValue &&
      Math.abs(value - revealedValue) <= range &&
      !isRecentMatchup(recentMatchups, revealed.id, p.id, category)
    );
  });

  if (candidates.length === 0) {
    candidates = pool.filter((p) => {
      const value = getStatValue(p, category);
      return (
        value !== revealedValue &&
        !isRecentMatchup(recentMatchups, revealed.id, p.id, category)
      );
    });
  }

  if (candidates.length === 0) {
    candidates = pool.filter((p) => getStatValue(p, category) !== revealedValue);
  }

  if (candidates.length === 0) {
    return pickRandom(pool.filter((p) => p.id !== revealed.id));
  }

  return pickRandom(candidates);
}

function pickStartingRevealed(category: StatCategory, recentMatchups: string[]): Player {
  for (let attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt += 1) {
    const revealed = pickRandom(PLAYERS);
    const hidden = pickHiddenPlayer(revealed, category, recentMatchups);
    if (
      hidden &&
      getStatValue(hidden, category) !== getStatValue(revealed, category) &&
      !isRecentMatchup(recentMatchups, revealed.id, hidden.id, category)
    ) {
      return revealed;
    }
  }
  return pickRandom(PLAYERS);
}

export function createRoundForCategory(
  category: StatCategory,
  recentMatchups: string[],
  fixedRevealed?: Player,
): RoundState {
  for (let attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt += 1) {
    const revealed = fixedRevealed ?? pickStartingRevealed(category, recentMatchups);
    const hidden = pickHiddenPlayer(revealed, category, recentMatchups);

    if (getStatValue(hidden, category) !== getStatValue(revealed, category)) {
      return {
        revealedPlayer: revealed,
        hiddenPlayer: hidden,
        category,
        categoryLabel: getCategoryLabel(category),
      };
    }
  }

  const revealed = pickRandom(PLAYERS);
  const hidden = pickHiddenPlayer(revealed, category, recentMatchups, [revealed.id]);

  return {
    revealedPlayer: revealed,
    hiddenPlayer: hidden,
    category,
    categoryLabel: getCategoryLabel(category),
  };
}

export function getCorrectGuess(revealed: Player, hidden: Player, category: StatCategory): Guess {
  const revealedValue = getStatValue(revealed, category);
  const hiddenValue = getStatValue(hidden, category);
  return hiddenValue > revealedValue ? 'higher' : 'lower';
}

export function checkGuess(
  guess: Guess,
  revealed: Player,
  hidden: Player,
  category: StatCategory,
): boolean {
  return guess === getCorrectGuess(revealed, hidden, category);
}

export function buildNextRoundAfterCorrect(
  nextCategory: StatCategory,
  currentRound: RoundState,
  recentMatchups: string[],
): { round: RoundState; recentMatchups: string[] } {
  const category = nextCategory;
  const revealed = currentRound.hiddenPlayer;
  const key = getMatchupKey(revealed.id, currentRound.revealedPlayer.id, currentRound.category);

  let updatedRecent = [...recentMatchups, key];
  if (updatedRecent.length > MAX_RECENT_MATCHUPS) {
    updatedRecent = updatedRecent.slice(-MAX_RECENT_MATCHUPS);
  }

  let hidden = pickHiddenPlayer(revealed, category, updatedRecent, [currentRound.revealedPlayer.id]);

  for (let attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt += 1) {
    if (getStatValue(hidden, category) !== getStatValue(revealed, category)) break;
    hidden = pickHiddenPlayer(revealed, category, updatedRecent, [
      currentRound.revealedPlayer.id,
      hidden.id,
    ]);
  }

  const round: RoundState = {
    revealedPlayer: revealed,
    hiddenPlayer: hidden,
    category,
    categoryLabel: getCategoryLabel(category),
  };

  const newKey = getMatchupKey(round.revealedPlayer.id, round.hiddenPlayer.id, round.category);
  updatedRecent = [...updatedRecent, newKey].slice(-MAX_RECENT_MATCHUPS);

  return { round, recentMatchups: updatedRecent };
}

export function getRandomStartingPlayers(): Player[] {
  return shuffle(PLAYERS);
}

export const PLAYER_COUNT = PLAYERS.length;
