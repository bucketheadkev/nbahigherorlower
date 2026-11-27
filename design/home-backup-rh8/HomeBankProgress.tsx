'use client';

import { useRef, type MouseEventHandler, type PointerEventHandler } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { ROLLOVER_GOAL } from '@/lib/tradeup/rollover';

gsap.registerPlugin(useGSAP);

interface HomeBankProgressProps {
  /** Opens Wall of Fame preview. */
  onOpenWall?: MouseEventHandler<HTMLButtonElement>;
  /** Opens Bank leaderboard (optional — card body). */
  onOpenBoard?: MouseEventHandler<HTMLButtonElement>;
  /** Home intro has started — the fill sweeps in once it is visible. */
  revealed?: boolean;
  onPressIn?: PointerEventHandler<HTMLButtonElement>;
  onPressOut?: PointerEventHandler<HTMLButtonElement>;
}

/**
 * Home Bank progress — WoF CTA opens wall preview; card can open Bank board.
 */
export function HomeBankProgress({
  onOpenWall,
  onOpenBoard,
  revealed = true,
  onPressIn,
  onPressOut,
}: HomeBankProgressProps) {
  const { t } = useLocale();
  const { state } = useAccountAuth();
  const balance = useBankBalance(state.status);
  const pending = balance == null;
  const fill = pending ? 0 : Math.min(1, Math.max(0, balance / ROLLOVER_GOAL));
  const hasFill = !pending && fill > 0.015;
  const rootRef = useRef<HTMLDivElement>(null);
  const swept = useRef(false);

  useGSAP(
    () => {
      const bar = rootRef.current?.querySelector<HTMLElement>('.rh7-bank__fill');
      if (!bar) return;
      const shown = hasFill ? Math.max(fill, 0.035) : 0;
      const x = -(1 - shown) * 100;
      if (!revealed) {
        gsap.set(bar, { xPercent: -100 });
        return;
      }
      if (getPrefersReducedMotion()) {
        gsap.set(bar, { xPercent: x });
        return;
      }
      gsap.to(bar, {
        xPercent: x,
        duration: swept.current ? 0.7 : 1.5,
        delay: swept.current ? 0 : 0.85,
        ease: 'expo.out',
        overwrite: 'auto',
      });
      swept.current = true;
    },
    { scope: rootRef, dependencies: [fill, hasFill, revealed] },
  );

  return (
    <div
      ref={rootRef}
      className={`rh7-bank${pending ? ' is-pending' : ''}${hasFill ? ' has-fill' : ''}`}
      aria-busy={pending}
    >
      <button
        type="button"
        className="rh7-bank__body rh7-press"
        aria-label={t('home.bankProgressLabel')}
        onClick={onOpenBoard}
        onPointerDown={onPressIn}
        onPointerUp={onPressOut}
        onPointerLeave={onPressOut}
        onPointerCancel={onPressOut}
      >
        <span className="rh7-bank__label">
          {t('home.bankMoneyBefore')}
          <span className="rh7-bank__goal-amt">{t('home.bankMoneyAmt')}</span>
          {t('home.bankMoneyAfter')}
        </span>
        <span className="rh7-bank__value">{pending ? '—' : formatCash(balance)}</span>
        <span className="rh7-bank__track" aria-hidden>
          <span className="rh7-bank__fill">
            <span className="rh7-bank__cap" />
          </span>
        </span>
      </button>

      <span className="rh7-bank__divider" aria-hidden />

      <div className="rh7-bank__wof-wrap">
        <button
          type="button"
          className="rh7-bank__wof rh7-press"
          aria-label={`${t('home.wallOfFame')}. ${t('home.wallOfFameBlurb')}`}
          onClick={onOpenWall}
          onPointerDown={onPressIn}
          onPointerUp={onPressOut}
          onPointerLeave={onPressOut}
          onPointerCancel={onPressOut}
        >
          <span className="rh7-bank__wof-label">{t('home.wallOfFame')}</span>
        </button>
        <span className="rh7-bank__wof-blurb">{t('home.wallOfFameBlurb')}</span>
      </div>
    </div>
  );
}
