'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { claimRankRewards, type RankRewardItem } from '@/lib/account/rankRewards';
import { BANK_CHANGED_EVENT, formatCash } from '@/lib/tradeup/bank';
import { playFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import { hapticLight, hapticSuccess } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { nextRank, RANKS, rankName } from '@/lib/tradeup/rank/config';
import { RankEmblem } from './RankEmblem';

type Copy = { en: string; es: string };

const COPY = {
  kicker: { en: 'RANK UP', es: 'SUBISTE DE RANGO' },
  added: { en: 'added to your Bank', es: 'sumados a tu Banco' },
  next: { en: 'Next reward', es: 'Próximo premio' },
  nextLine: { en: '{rank} · {amount} at a {bank} Bank', es: '{rank} · {amount} con un Banco de {bank}' },
  top: { en: 'Every rank reward collected.', es: 'Todos los premios de rango cobrados.' },
  collect: { en: 'COLLECT', es: 'COBRAR' },
} satisfies Record<string, Copy>;

const pick = (copy: Copy, locale: string) => (locale === 'es' ? copy.es : copy.en);

/** Wait for a burst of Bank changes (a run's payouts) to settle before asking again. */
const SETTLE_MS = 1200;

/**
 * Pays rank-up rewards as soon as a rank is reached and celebrates them. Runs on the hub; every
 * reward is credited once by the server (or this device for guests) before it is shown.
 */
export function RankRewardHost({ enabled }: { enabled: boolean }) {
  const { state: account } = useAccountAuth();
  const [items, setItems] = useState<RankRewardItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!enabled || account.status === 'loading') return;
    const permanent = account.status === 'permanent';
    let cancelled = false;
    let timer = 0;
    const claim = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      const result = await claimRankRewards(permanent);
      busyRef.current = false;
      if (!cancelled && result.ok && result.items.length > 0) {
        setItems((current) => [...current, ...result.items]);
      }
    };
    void claim();
    const onBank = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void claim(), SETTLE_MS);
    };
    window.addEventListener(BANK_CHANGED_EVENT, onBank);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(BANK_CHANGED_EVENT, onBank);
    };
  }, [account.status, enabled]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {enabled && items.length > 0 ? <RankUp key="rankup" items={items} onClose={() => setItems([])} /> : null}
    </AnimatePresence>,
    document.body,
  );
}

function RankUp({ items, onClose }: { items: RankRewardItem[]; onClose: () => void }) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const top = RANKS.filter((r) => items.some((i) => i.rankId === r.id)).at(-1) ?? RANKS[0]!;
  const total = items.reduce((sum, i) => sum + i.reward, 0);
  const following = nextRank(top);

  useEffect(() => {
    hapticSuccess();
    playFinalTotalSettleSound();
  }, []);

  return (
    <motion.div
      className="rankup"
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.kicker, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      style={{ '--rank-color': top.color, '--rank-deep': top.deep } as CSSProperties}
    >
      <motion.div
        className="rankup__card"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      >
        <span className="rankup__halo" aria-hidden />
        <RankEmblem rank={top} size={112} className="rankup__emblem" />
        <p className="rankup__kicker">{pick(COPY.kicker, locale)}</p>
        <h2 className="rankup__name">{rankName(top, locale)}</h2>
        <p className="rankup__amount">+{formatCash(total)}</p>
        <p className="rankup__added">{pick(COPY.added, locale)}</p>
        {items.length > 1 ? (
          <ul className="rankup__list">
            {RANKS.filter((r) => items.some((i) => i.rankId === r.id)).map((r) => (
              <li key={r.id} style={{ '--step-color': r.color } as CSSProperties}>
                <RankEmblem rank={r} size={20} />
                <span>{rankName(r, locale)}</span>
                <b>+{formatCash(r.reward)}</b>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="rankup__next">
          {following ? (
            <>
              <span>{pick(COPY.next, locale)}</span>
              {pick(COPY.nextLine, locale)
                .replace('{rank}', rankName(following, locale))
                .replace('{amount}', `+${formatCash(following.reward)}`)
                .replace('{bank}', formatCash(following.minBank))}
            </>
          ) : (
            pick(COPY.top, locale)
          )}
        </p>
        <button
          type="button"
          className="rankup__cta"
          onClick={() => {
            hapticLight();
            onClose();
          }}
        >
          {pick(COPY.collect, locale)}
        </button>
      </motion.div>
    </motion.div>
  );
}
