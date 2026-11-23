'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticHeavy, hapticSuccess, hapticTap, hapticWarning } from '@/lib/tradeup/haptics';
import { payTriviaBonus } from '@/lib/tradeup/trivia/bankTrivia';
import {
  pickTriviaQuestion,
  TIMER_SECONDS,
  triviaBonusFor,
  type TriviaDifficulty,
  type TriviaQuestion,
} from '@/lib/tradeup/trivia';
import { tickTriviaCountdown } from '@/lib/tradeup/trivia/timerSafety';

type Phase = 'pick' | 'ready' | 'play' | 'result';

interface ClassicTriviaSheetProps {
  open: boolean;
  runRef: string;
  onDone: () => void;
}

/**
 * Full-page post–$1B Trivia. Difficulty first, then the question on the same page.
 * Win → gold burst. Miss / timeout → red sink.
 */
export function ClassicTriviaSheet({ open, runRef, onDone }: ClassicTriviaSheetProps) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [difficulty, setDifficulty] = useState<TriviaDifficulty | null>(null);
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const [seconds, setSeconds] = useState(TIMER_SECONDS);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(false);
  const [bonus, setBonus] = useState(0);
  const [readyVisible, setReadyVisible] = useState(false);
  const [fxOn, setFxOn] = useState(false);
  const timerRef = useRef<number | null>(null);
  const usedIds = useRef<string[]>([]);
  /** Sheet dismissed (Skip / Continue) — onDone once. */
  const doneRef = useRef(false);
  /** Answer or timeout already settled — finish() once (sync, not via setState). */
  const settledRef = useRef(false);
  const difficultyRef = useRef<TriviaDifficulty | null>(null);
  const questionRef = useRef<TriviaQuestion | null>(null);
  const finishRef = useRef<(choiceIndex: number | null) => void>(() => {});

  difficultyRef.current = difficulty;
  questionRef.current = question;

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      setPhase('pick');
      setDifficulty(null);
      setQuestion(null);
      setSeconds(TIMER_SECONDS);
      setPicked(null);
      setCorrect(false);
      setBonus(0);
      setReadyVisible(false);
      setFxOn(false);
      doneRef.current = false;
      settledRef.current = false;
      clearTimer();
      return;
    }
    doneRef.current = false;
    settledRef.current = false;
  }, [open]);

  const closeSafe = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    onDone();
  };

  useEffect(() => {
    if (phase !== 'ready' || !question) return;
    setReadyVisible(false);
    const show = window.setTimeout(() => setReadyVisible(true), 80);
    const start = window.setTimeout(() => {
      setPhase('play');
      setSeconds(TIMER_SECONDS);
    }, 900);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(start);
    };
  }, [phase, question]);

  useEffect(() => {
    if (phase !== 'result') return;
    setFxOn(false);
    const id = window.requestAnimationFrame(() => setFxOn(true));
    return () => window.cancelAnimationFrame(id);
  }, [phase, correct]);

  const chooseDifficulty = (d: TriviaDifficulty) => {
    hapticTap();
    const q = pickTriviaQuestion(d, usedIds.current);
    if (!q) {
      closeSafe();
      return;
    }
    usedIds.current = [...usedIds.current, q.id].slice(-80);
    settledRef.current = false;
    setDifficulty(d);
    setQuestion(q);
    setPicked(null);
    setPhase('ready');
  };

  const finish = (choiceIndex: number | null) => {
    // Sync guard — never rely on phase state alone (stale closures / double taps / timer).
    if (settledRef.current || doneRef.current) return;
    settledRef.current = true;
    clearTimer();

    const d = difficultyRef.current;
    const q = questionRef.current;
    if (!d || !q) {
      closeSafe();
      return;
    }
    const isCorrect = choiceIndex != null && choiceIndex === q.correctIndex;
    setPicked(choiceIndex);
    setCorrect(isCorrect);
    const paid = payTriviaBonus(runRef, d, isCorrect);
    setBonus(paid);
    if (isCorrect) {
      hapticHeavy();
      window.setTimeout(() => hapticSuccess(), 220);
    } else {
      hapticWarning();
    }
    setPhase('result');
  };
  finishRef.current = finish;

  useEffect(() => {
    if (phase !== 'play') return;
    settledRef.current = false;
    setSeconds(TIMER_SECONDS);

    // Countdown lives outside setState updaters so expiration never calls finish inside one.
    let remaining = TIMER_SECONDS;
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const { next, expired } = tickTriviaCountdown(remaining);
      remaining = next;
      setSeconds(next);
      if (!expired) return;
      clearTimer();
      // Timeout result — outside the updater; settle guard ensures once-only.
      finishRef.current(null);
    }, 1000);

    return () => {
      clearTimer();
    };
  }, [phase]);

  if (!open || typeof document === 'undefined') return null;

  const resultClass = correct ? ' is-win' : ' is-lose';

  return createPortal(
    <div
      className={`trivia-page${phase === 'result' ? resultClass : ''}${fxOn ? ' is-fx' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trivia-title"
    >
      <div className="trivia-page__bg" aria-hidden />
      <div className="trivia-page__fx" aria-hidden>
        {phase === 'result' && correct ? (
          <>
            <span className="trivia-page__burst" />
            <span className="trivia-page__burst trivia-page__burst--2" />
            <span className="trivia-page__spark trivia-page__spark--a" />
            <span className="trivia-page__spark trivia-page__spark--b" />
            <span className="trivia-page__spark trivia-page__spark--c" />
          </>
        ) : null}
        {phase === 'result' && !correct ? (
          <>
            <span className="trivia-page__bleed" />
            <span className="trivia-page__sink" />
          </>
        ) : null}
      </div>

      <div className="trivia-page__body">
        {phase === 'pick' ? (
          <div className="trivia-page__panel trivia-page__panel--pick">
            <p className="trivia-page__eyebrow">Bonus Trivia</p>
            <h1 id="trivia-title" className="trivia-page__title">
              Pick your difficulty
            </h1>
            <p className="trivia-page__copy">
              Correct = extra Bank Money. Wrong keeps your rollover.
            </p>
            <div className="trivia-page__diffs">
              {(
                [
                  ['easy', 'Easy', triviaBonusFor('easy')],
                  ['medium', 'Medium', triviaBonusFor('medium')],
                  ['hard', 'Hard', triviaBonusFor('hard')],
                ] as const
              ).map(([id, label, amount]) => (
                <button
                  key={id}
                  type="button"
                  className={`trivia-diff trivia-diff--${id}`}
                  onClick={() => chooseDifficulty(id)}
                >
                  <strong>{label}</strong>
                  <em>+{formatCash(amount)}</em>
                </button>
              ))}
            </div>
            <button type="button" className="trivia-page__skip" onClick={closeSafe}>
              Skip
            </button>
          </div>
        ) : null}

        {(phase === 'ready' || phase === 'play') && question ? (
          <div className="trivia-page__panel trivia-page__panel--play">
            <div className="trivia-page__meta">
              <span className="trivia-page__diff-tag">{difficulty}</span>
              <span
                className={`trivia-page__timer${phase === 'play' && seconds <= 5 ? ' is-low' : ''}`}
              >
                {phase === 'play' ? `${seconds}s` : 'Get ready'}
              </span>
            </div>
            <h1 id="trivia-title" className="trivia-page__prompt">
              {question.prompt}
            </h1>
            <div
              className={`trivia-page__choices${readyVisible || phase === 'play' ? ' is-shown' : ''}`}
            >
              {question.choices.map((choice, i) => (
                <button
                  key={`${question.id}-${i}`}
                  type="button"
                  className="trivia-choice"
                  disabled={phase !== 'play'}
                  onClick={() => finish(i)}
                >
                  <span className="trivia-choice__letter">{String.fromCharCode(65 + i)}</span>
                  <span>{choice}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {phase === 'result' && question ? (
          <div className={`trivia-page__panel trivia-page__panel--result${resultClass}`}>
            <p className="trivia-page__eyebrow">{correct ? 'Correct' : 'No bonus'}</p>
            <h1 id="trivia-title" className="trivia-page__title">
              {correct ? `+${formatCash(bonus)}` : 'Rollover kept'}
            </h1>
            <p className="trivia-page__copy">
              {correct
                ? 'Extra Bank Money added.'
                : picked == null
                  ? 'Time ran out — no trivia bonus.'
                  : `Answer was ${question.choices[question.correctIndex]}.`}
            </p>
            <button type="button" className="trivia-page__continue" onClick={closeSafe}>
              Continue
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
