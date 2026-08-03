export const LINEUP_SIZE = 5;

export type FranchiseZone = 'collection' | 'starting' | 'bench';

export type UnlockStatus = 'new' | 'duplicate';

export interface FranchiseData {
  unlockedIds: string[];
  startingFive: (string | null)[];
  bench: (string | null)[];
}

export interface UnlockResult {
  status: UnlockStatus;
  playerId: string;
}

export interface FranchiseDropTarget {
  zone: FranchiseZone;
  slotIndex: number | null;
}
