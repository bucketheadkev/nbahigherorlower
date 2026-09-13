'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { hapticSuccess } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

/** Entire on-screen life, including enter and exit. */
const LIFE_MS = 2000;
const ENTER_MS = 140;
const EXIT_MS = 160;

interface ChallengeCompleteToastProps {
  challengeId: string;
  completed: number;
  total: number;
  onDismiss: () => void;
}

function challengeTitleKey(id: string): MessageKey {
  return `challenge.${id}.title` as MessageKey;
}

/**
 * Single top-of-screen achievement banner. One at a time for exactly 2 seconds.
 */
export function ChallengeCompleteToast({
  challengeId,
  completed,
  total,
  onDismiss,
}: ChallengeCompleteToastProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const reduceMotion = getPrefersReducedMotion();
  const title = t(challengeTitleKey(challengeId));
  const heading = t('challenges.unlocked');
  const countLabel = t('challenges.progress', {
    done: completed,
    total,
  });

  useEffect(() => {
    let cancelled = false;
    hapticSuccess();
    setVisible(false);
    setLeaving(false);

    const enter = window.setTimeout(() => {
      if (!cancelled) setVisible(true);
    }, reduceMotion ? 0 : 16);
    const leaveAt = window.setTimeout(() => {
      if (!cancelled) setLeaving(true);
    }, LIFE_MS - (reduceMotion ? 0 : EXIT_MS));
    const doneAt = window.setTimeout(() => {
      if (!cancelled) onDismissRef.current();
    }, LIFE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(enter);
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
    };
  }, [challengeId, reduceMotion]);

  return (
    <div
      className={`challenge-toast${visible ? ' is-visible' : ''}${
        leaving ? ' is-leaving' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-label={`${heading}. ${title}. ${countLabel}`}
    >
      <div className="challenge-toast__card">
        <p className="challenge-toast__count">{countLabel}</p>
        <span className="challenge-toast__icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3.6l2.05 4.16 4.6.67-3.33 3.24.79 4.58L12 14.08 7.89 16.25l.79-4.58L5.35 8.43l4.6-.67L12 3.6z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className="challenge-toast__copy">
          <p className="challenge-toast__kicker">{heading}</p>
          <p className="challenge-toast__title">{title}</p>
        </div>
      </div>
    </div>
  );
}
