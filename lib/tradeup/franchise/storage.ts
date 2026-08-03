import { LINEUP_SIZE, type FranchiseData } from './types';

const FRANCHISE_KEY = 'tradeup_franchise';

export function createEmptyFranchise(): FranchiseData {
  return {
    unlockedIds: [],
    startingFive: Array.from({ length: LINEUP_SIZE }, () => null),
    bench: Array.from({ length: LINEUP_SIZE }, () => null),
  };
}

function normalizeFranchise(raw: Partial<FranchiseData>): FranchiseData {
  const empty = createEmptyFranchise();
  const startingFive = Array.from({ length: LINEUP_SIZE }, (_, i) => raw.startingFive?.[i] ?? null);
  const bench = Array.from({ length: LINEUP_SIZE }, (_, i) => raw.bench?.[i] ?? null);
  const unlockedIds = Array.isArray(raw.unlockedIds) ? [...new Set(raw.unlockedIds)] : [];

  for (const id of [...startingFive, ...bench]) {
    if (id && !unlockedIds.includes(id)) {
      unlockedIds.push(id);
    }
  }

  return { unlockedIds, startingFive, bench };
}

export function loadFranchise(): FranchiseData {
  if (typeof window === 'undefined') return createEmptyFranchise();
  try {
    const stored = localStorage.getItem(FRANCHISE_KEY);
    if (!stored) return createEmptyFranchise();
    return normalizeFranchise(JSON.parse(stored) as Partial<FranchiseData>);
  } catch {
    return createEmptyFranchise();
  }
}

export function saveFranchise(data: FranchiseData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FRANCHISE_KEY, JSON.stringify(data));
}
