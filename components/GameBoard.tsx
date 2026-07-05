'use client';

import { getComparisonCopy } from '@/lib/categories';
import type { FeedbackState, Guess, RoundState } from '@/types/game';

interface GameBoardProps {
  round: RoundState;
  feedback: FeedbackState;
  canGuess: boolean;
  revealHidden?: boolean;
  onGuess: (guess: Guess) => void;
}

export function GameBoard({
  round,
  feedback,
  canGuess,
  revealHidden = false,
  onGuess,
}: GameBoardProps) {
  const showAnswer = revealHidden || feedback !== 'idle';
  const copy = getComparisonCopy(round.hiddenPlayer, round.revealedPlayer, round.category);

  const panelClass =
    feedback === 'correct'
      ? 'game-question-panel game-question-panel--correct'
      : feedback === 'wrong'
        ? 'game-question-panel game-question-panel--wrong'
        : 'game-question-panel';

  return (
    <div className="game-board">
      <div className={panelClass}>
        <span className="game-category-badge">{copy.categoryLabel}</span>

        <p className="game-known-stat">
          <span className="game-known-label">We know:</span>
          {copy.revealedAnchor}
        </p>

        <h2 className="game-question">{copy.question}</h2>

        {showAnswer ? (
          <div className="game-answer-reveal animate-stat-reveal">
            <span className="game-answer-label">
              {feedback === 'correct' ? 'Correct!' : feedback === 'wrong' ? 'Actual answer:' : 'Answer:'}
            </span>
            <p className="game-answer-text">{copy.hiddenReveal}</p>
          </div>
        ) : (
          <p className="game-prompt">Tap the answer you think is right</p>
        )}
      </div>

      <div className="game-choice-stack">
        <button
          type="button"
          disabled={!canGuess}
          onClick={() => onGuess('higher')}
          className="game-choice-btn game-choice-btn--up disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copy.higherButton}
        </button>
        <button
          type="button"
          disabled={!canGuess}
          onClick={() => onGuess('lower')}
          className="game-choice-btn game-choice-btn--down disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copy.lowerButton}
        </button>
      </div>
    </div>
  );
}
