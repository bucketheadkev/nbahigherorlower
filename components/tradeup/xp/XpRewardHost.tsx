'use client';

import { AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useXpProfile } from '@/hooks/useXpProfile';
import { consumePendingXpReveal, XP_REVEAL_READY_EVENT } from '@/lib/tradeup/xp';

/**
 * Legacy hub overlay host. Classic rewards now show on the evaluation screen;
 * any leftover queued reveals are drained silently (no coins-collected animation).
 */
export function XpRewardHost({
  enabled,
  armWithoutSignal = false,
  /** True while Classic/H2H is open — clears a stale hub overlay so it can’t cover the jumbotron. */
  inRun = false,
}: {
  enabled: boolean;
  /** When true (hub), arm after a short settle without waiting for Classic signal. */
  armWithoutSignal?: boolean;
  inRun?: boolean;
}) {
  const { pendingReveals } = useXpProfile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Silently clear any leftover queued reveals — no overlay.
  useEffect(() => {
    if (!enabled || inRun || pendingReveals.length === 0) return;
    for (const item of pendingReveals) consumePendingXpReveal(item.id);
  }, [enabled, inRun, pendingReveals]);

  // Keep the old arm signal path quiet so callers don't break.
  useEffect(() => {
    if (!enabled || inRun || !armWithoutSignal) return;
    const noop = () => undefined;
    window.addEventListener(XP_REVEAL_READY_EVENT, noop);
    return () => window.removeEventListener(XP_REVEAL_READY_EVENT, noop);
  }, [enabled, armWithoutSignal, inRun]);

  if (!mounted) return null;
  return createPortal(<AnimatePresence>{null}</AnimatePresence>, document.body);
}

/** @deprecated name kept for TradeUpApp import stability during swap */
export function LevelUpHost(props: { enabled: boolean; armWithoutSignal?: boolean }) {
  return <XpRewardHost {...props} />;
}
