export interface Player {
  id: string;
  name: string;
  team: string;
  imageUrl: string;
  careerPoints: number;
  careerAssists: number;
  careerRebounds: number;
  careerBlocks: number;
  careerSteals: number;
  championships: number;
  allStars: number;
  mvps: number;
  draftPick: number;
  heightInches: number;
  age: number;
  careerEarnings: number;
  instagramFollowers: number;
}

export type GameMode =
  | 'careerPoints'
  | 'careerAssists'
  | 'careerRebounds'
  | 'careerBlocks'
  | 'careerSteals'
  | 'championships'
  | 'allStars'
  | 'mvps'
  | 'draftPick'
  | 'height'
  | 'age'
  | 'careerEarnings'
  | 'instagramFollowers'
  | 'random'
  | 'fullRun';

export type StatCategory = Exclude<GameMode, 'random' | 'fullRun'>;

export type Guess = 'higher' | 'lower';

export type GamePhase = 'playing' | 'revealing' | 'correct' | 'wrong' | 'gameOver';

export type LoseReason = 'wrong' | 'timeout';

export type FeedbackState = 'idle' | 'correct' | 'wrong';

export interface RoundState {
  revealedPlayer: Player;
  hiddenPlayer: Player;
  category: StatCategory;
  categoryLabel: string;
}

export interface GameState {
  phase: GamePhase;
  streak: number;
  bestStreak: number;
  round: RoundState | null;
  lastGuess: Guess | null;
  wasCorrect: boolean | null;
  loseReason: LoseReason | null;
  recentMatchups: string[];
  streakPop: boolean;
  secondsLeft: number;
  gameOverSecondsLeft: number;
}
