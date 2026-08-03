import { useEffect, useRef } from 'react';
import type { AnswerFeedback, AnswerTier, Question } from '../types';
import { useShotClock } from '../hooks/useShotClock';
import {
  getCorrectCount,
  getNextTier,
  getTierProgress,
  TIER_LABELS,
} from '../engine/scoring';
import { ShotClockBar } from './ShotClockBar';
import { TierBadge } from './TierBadge';
import './GameScreen.css';

interface Props {
  question: Question;
  runTier: AnswerTier;
  tierHistory: AnswerTier[];
  lastTier: AnswerTier | null;
  lives: number;
  streak: number;
  feedback: AnswerFeedback;
  onAnswer: (optionId: string, secondsLeft: number, pause: () => void) => void;
  onTimeout: (pause: () => void) => void;
}

const TYPE_LABELS: Record<string, string> = {
  nameTeam: 'Team ID',
  statLine: 'Stat Line',
  conference: 'Conference',
  position: 'Position',
  era: 'Era',
  higherStat: 'Head to Head',
};

export function GameScreen({
  question,
  runTier,
  tierHistory,
  lastTier,
  lives,
  streak,
  feedback,
  onAnswer,
  onTimeout,
}: Props) {
  const pauseRef = useRef<() => void>(() => {});

  const { secondsLeft, pause } = useShotClock({
    active: feedback === null,
    onTimeout: () => onTimeout(pauseRef.current),
    resetKey: question.id,
  });

  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  const isBinary = question.options.length === 2;
  const correctCount = getCorrectCount(tierHistory);
  const nextTier = getNextTier(runTier);
  const tierProgress = getTierProgress(tierHistory);
  const lastWasCorrect = lastTier !== null && lastTier !== 'F';

  return (
    <div className={`game-screen ${feedback ? `game-screen-${feedback}` : ''}`}>
      <div className="game-hud">
        <div className="hud-stat hud-rank">
          <span className="hud-label">Rank</span>
          <TierBadge tier={runTier} size="lg" />
          {nextTier && tierHistory.length > 0 && (
            <div className="tier-meter">
              <div className="tier-meter-fill" style={{ width: `${tierProgress * 100}%` }} />
            </div>
          )}
          {nextTier && tierHistory.length > 0 && (
            <span className="tier-next">→ {nextTier}</span>
          )}
        </div>

        <div className="hud-stat hud-correct">
          <span className="hud-label">Correct</span>
          <span className="hud-correct-value">{correctCount}</span>
          {streak >= 2 && <span className="hud-streak-mini">{streak} streak</span>}
        </div>

        <div className="hud-stat hud-lives">
          <span className="hud-label">Lives</span>
          <span className="hud-hearts" aria-label={`${lives} lives remaining`}>
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < lives ? 'heart-full' : 'heart-empty'}>
                ♥
              </span>
            ))}
          </span>
        </div>
      </div>

      {tierHistory.length > 0 && (
        <div className="tier-trail" aria-label="Recent answer grades">
          {tierHistory.slice(-8).map((t, i) => (
            <TierBadge key={`${i}-${t}`} tier={t} size="sm" />
          ))}
        </div>
      )}

      {lastTier && feedback && (
        <div className="tier-flash">
          <TierBadge tier={lastTier} size="xl" label={TIER_LABELS[lastTier]} pulse />
          <p className="tier-flash-sub">
            {lastWasCorrect
              ? 'Correct — rank blends speed + answers'
              : 'Miss — keep stacking correct answers'}
          </p>
        </div>
      )}

      <ShotClockBar secondsLeft={secondsLeft} />

      <div className="question-card card">
        <span className="question-type">{TYPE_LABELS[question.type] ?? question.type}</span>
        <h2 className="question-prompt">{question.prompt}</h2>
        {question.subtext && <p className="question-subtext">{question.subtext}</p>}
      </div>

      <div className={`answer-grid ${isBinary ? 'answer-grid-binary' : ''}`}>
        {question.options.map((option) => (
          <button
            key={option.id}
            className="answer-btn"
            disabled={feedback !== null}
            onClick={() => onAnswer(option.id, secondsLeft, pause)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
