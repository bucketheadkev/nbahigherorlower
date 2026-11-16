'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import { useXpProfile } from '@/hooks/useXpProfile';
import { hapticLight, hapticSuccess } from '@/lib/tradeup/haptics';
import {
  holdInterruptions,
  INTERRUPTIONS_CHANGED_EVENT,
  interruptionsHeld,
} from '@/lib/tradeup/interruptions';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import {
  consumePendingXpReveal,
  XP_REVEAL_READY_EVENT,
  type PendingXpReveal,
} from '@/lib/tradeup/xp';
import { RunCoinIcon } from './RunCoinIcon';
import { XpProgressBar } from './XpProgressBar';

type Phase = 'bar' | 'reward' | 'done';

/**
 * Post-run XP fill + coin reward — matches the reference recording:
 * slim striped bar with +XP, then compact Reward (coin + amount + Claim).
 * Plays via portal after Classic evaluation settles (or on hub if pending).
 * Does not rewrite Classic results layout.
 */
export function XpRewardHost({
  enabled,
  armWithoutSignal = false,
}: {
  enabled: boolean;
  /** When true (hub), arm after a short settle without waiting for Classic signal. */
  armWithoutSignal?: boolean;
}) {
  const { pendingReveals } = useXpProfile();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<PendingXpReveal | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!enabled) {
      setArmed(false);
      setActive(null);
      return;
    }
    const arm = () => setArmed(true);
    window.addEventListener(XP_REVEAL_READY_EVENT, arm);
    let timer = 0;
    if (armWithoutSignal) {
      // Let earnings/rank overlays claim first when returning home.
      timer = window.setTimeout(arm, 1100);
    }
    return () => {
      window.removeEventListener(XP_REVEAL_READY_EVENT, arm);
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, armWithoutSignal]);

  useEffect(() => {
    if (!enabled || !armed || active) return;
    const tryOpen = () => {
      if (interruptionsHeld()) return;
      const next = pendingReveals[0] ?? null;
      if (next) setActive(next);
    };
    tryOpen();
    window.addEventListener(INTERRUPTIONS_CHANGED_EVENT, tryOpen);
    return () => window.removeEventListener(INTERRUPTIONS_CHANGED_EVENT, tryOpen);
  }, [enabled, armed, pendingReveals, active]);

  useEffect(() => {
    if (!active) return;
    return holdInterruptions();
  }, [active]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {enabled && active ? (
        <XpRewardSequence
          key={active.id}
          item={active}
          onDone={() => {
            consumePendingXpReveal(active.id);
            setActive(null);
            setArmed(false);
          }}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** @deprecated name kept for TradeUpApp import stability during swap */
export function LevelUpHost(props: { enabled: boolean; armWithoutSignal?: boolean }) {
  return <XpRewardHost {...props} />;
}

function XpRewardSequence({ item, onDone }: { item: PendingXpReveal; onDone: () => void }) {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduceMotion ? 'reward' : 'bar');
  const leveled = item.toLevel > item.fromLevel;

  useEffect(() => {
    if (reduceMotion) {
      hapticSuccess();
      return;
    }
    hapticLight();
    const toReward = window.setTimeout(() => {
      setPhase('reward');
      hapticSuccess();
    }, 1250);
    return () => window.clearTimeout(toReward);
  }, [reduceMotion]);

  return (
    <motion.div
      className="xp-reward"
      role="dialog"
      aria-modal="true"
      aria-label={t('xp.rewardTitle')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <button type="button" className="xp-reward__scrim" aria-label={t('xp.skip')} onClick={onDone} />

      <div className="xp-reward__stack">
        {/* Slim XP module — reference style, not a giant level circle */}
        <motion.div
          className="xp-reward__module"
          initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {leveled ? (
            <p className="xp-reward__level-chip">
              {t('xp.level')} {item.fromLevel}
              <span aria-hidden> → </span>
              {item.toLevel}
            </p>
          ) : null}
          <XpProgressBar
            progress={{
              level: item.toLevel,
              xpIntoLevel: 0,
              xpForNext: 1,
              totalXp: item.toTotalXp,
              fill: 0,
            }}
            levelLabel={t('xp.level')}
            gainedXp={item.xpFromRun}
            animateFromTotalXp={item.fromTotalXp}
            animateToTotalXp={item.toTotalXp}
          />
        </motion.div>

        <AnimatePresence>
          {phase === 'reward' || phase === 'done' ? (
            <motion.div
              className="xp-reward__card"
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            >
              <p className="xp-reward__title">{t('xp.rewardTitle')}</p>
              <motion.div
                className="xp-reward__coin"
                initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
              >
                <RunCoinIcon size={72} />
              </motion.div>
              <motion.p
                className="xp-reward__amount"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.12 }}
              >
                +{item.coinsFromRun.toLocaleString('en-US')}
              </motion.p>
              <button
                type="button"
                className="xp-reward__claim"
                onClick={() => {
                  hapticLight();
                  onDone();
                }}
              >
                {t('xp.claim')}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
