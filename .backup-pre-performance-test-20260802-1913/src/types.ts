export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type Decade = '1960s' | '1970s' | '1980s' | '1990s' | '2000s' | '2010s' | '2020s';

export interface PlayerStats {
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  teams: string[];
  decade: Decade;
  primaryPosition: Position;
  positions: Position[];
  stats: PlayerStats;
  active: boolean;
}

export type QuestionType =
  | 'nameTeam'
  | 'statLine'
  | 'conference'
  | 'position'
  | 'era'
  | 'higherStat';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionOption {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  subtext?: string;
  options: QuestionOption[];
  correctId: string;
  playerId?: string;
}

export type GamePhase = 'welcome' | 'playing' | 'results';

export type AnswerFeedback = 'correct' | 'wrong' | 'timeout' | null;

export type AnswerTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface RunResult {
  tier: AnswerTier;
  tierHistory: AnswerTier[];
  questionsAnswered: number;
  bestStreak: number;
  headline: string;
}

export interface HighScore {
  tier: AnswerTier;
  streak: number;
  correct: number;
}

export interface GameState {
  phase: GamePhase;
  tierHistory: AnswerTier[];
  lastTier: AnswerTier | null;
  lives: number;
  streak: number;
  bestStreak: number;
  questionNumber: number;
  currentQuestion: Question | null;
  usedPlayerIds: Set<string>;
  feedback: AnswerFeedback;
  feedbackLocked: boolean;
}

export const SHOT_CLOCK_SECONDS = 24;
export const STARTING_LIVES = 3;
export const FEEDBACK_MS = 300;
