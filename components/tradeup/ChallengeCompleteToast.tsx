'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { hapticSuccess } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

const SHOW_MS = 2000;
const EXIT_MS = 320;

interface ChallengeCompleteToastProps {
  challengeId: string;
  onDismiss: () => void;
}

function challengeTitleKey(id: string): MessageKey {
  return `challenge.${id}.title` as MessageKey;
}

/**
 * Smooth celebration bubble when a Classic challenge unlocks after final total.
 * Rendered inside the game shell (not body portal) so phone-embed / iOS keep it on-screen.
 */
export function ChallengeCompleteToast({
  challengeId,
  onDismiss,
}: ChallengeCompleteToastProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const reduceMotion = getPrefersReducedMotion();
  const title = t(challengeTitleKey(challengeId));

  useEffect(() => {
    hapticSuccess();
    setVisible(false);
    setLeaving(false);
    const enter = window.setTimeout(() => setVisible(true), reduceMotion ? 0 : 30);
    const leaveAt = window.setTimeout(() => setLeaving(true), SHOW_MS);
    const doneAt = window.setTimeout(
      () => onDismissRef.current(),
      SHOW_MS + (reduceMotion ? 40 : EXIT_MS),
    );
    return () => {
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
      aria-label={`${t('challenges.unlocked')}: ${title}`}
    >
      <div className="challenge-toast__card">
        <span className="challenge-toast__check" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.18" />
            <path
              d="M7.2 12.4 10.3 15.4 16.8 8.6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="challenge-toast__copy">
          <p className="challenge-toast__kicker">{t('challenges.unlocked')}</p>
          <p className="challenge-toast__title">{title}</p>
        </div>
      </div>
    </div>
  );
}
