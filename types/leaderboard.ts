export interface LeaderboardEntry {
  id: string;
  xUsername: string;
  bestStreak: number;
  mode: string;
  updatedAt: string;
}

export interface LeaderboardSubmitPayload {
  xUsername: string;
  streak: number;
  mode: string;
}
