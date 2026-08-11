'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RewardedAdService,
  type RewardedAdResult,
  type RewardedAdState,
} from '@/lib/tradeup/ads/rewardedAdService';
import {
  REWARDED_ADS_UI_ENABLED,
  type RewardedAdPlacement,
} from '@/lib/tradeup/ads/adConfig';
import { hapticTap } from '@/lib/tradeup/haptics';

interface RewardedAdButtonProps {
  placement: RewardedAdPlacement;
  /** Short label, e.g. "Watch for Team Reroll" */
  label: string;
  /** Called only when the provider confirms a completed reward. */
  onRewarded: () => void;
  className?: string;
  /** Hide until ads go live */
  forceShow?: boolean;
}

function statusCopy(state: RewardedAdState): string {
  switch (state) {
    case 'loading':
    case 'initializing':
      return 'Loading ad…';
    case 'showing':
      return 'Playing ad…';
    case 'ready':
      return 'Ready';
    case 'unavailable':
    case 'failed':
      return 'Unavailable';
    case 'rewarded':
      return 'Reward earned';
    case 'dismissed':
      return 'Closed early';
    default:
      return 'Watch ad';
  }
}

/**
 * Reusable rewarded-ad control.
 * Never grants a reward unless RewardedAdService returns 'rewarded'.
 * Disabled while an ad is loading or playing.
 */
export function RewardedAdButton({
  placement,
  label,
  onRewarded,
  className = '',
  forceShow = false,
}: RewardedAdButtonProps) {
  const [state, setState] = useState<RewardedAdState>(() =>
    RewardedAdService.getState(),
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => RewardedAdService.subscribe(setState), []);

  const busy = RewardedAdService.isBusy();
  const disabled = busy || state === 'showing';

  const handlePress = useCallback(async () => {
    if (disabled) return;
    hapticTap();
    setMessage(null);

    const result: RewardedAdResult = await RewardedAdService.show(placement);
    if (result === 'rewarded') {
      onRewarded();
      setMessage('Reward unlocked');
      return;
    }
    if (result === 'busy') {
      setMessage('Ad in progress…');
      return;
    }
    if (result === 'dismissed') {
      setMessage('Finish the ad to earn the reward');
      return;
    }
    setMessage('Ad unavailable — try again later');
  }, [disabled, onRewarded, placement]);

  if (!REWARDED_ADS_UI_ENABLED && !forceShow) return null;

  return (
    <div className={`rewarded-ad-btn-wrap ${className}`.trim()}>
      <button
        type="button"
        className={`rewarded-ad-btn${disabled ? ' is-busy' : ''}`}
        disabled={disabled}
        onClick={() => void handlePress()}
        aria-busy={busy}
      >
        <span className="rewarded-ad-btn__kicker">{statusCopy(state)}</span>
        <span className="rewarded-ad-btn__label">{label}</span>
      </button>
      {message ? <p className="rewarded-ad-btn__msg">{message}</p> : null}
    </div>
  );
}
