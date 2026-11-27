'use client';

import {
  useRef,
  type MouseEventHandler,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { ROLLOVER_GOAL } from '@/lib/tradeup/rollover';

gsap.registerPlugin(useGSAP);

/** Upward flick that counts as a tip-off (px of travel, or px/ms of release speed). */
const TIP_DISTANCE = 64;
const TIP_SPEED = 0.55;
const TAP_SLOP = 8;

interface HomeVaultProps {
  /** Splash is gone — counter + rail run once the hero has landed. */
  revealed?: boolean;
  /** Blocks the ball while Home is already launching a run. */
  locked?: boolean;
  onOpenBoard?: MouseEventHandler<HTMLButtonElement>;
  onOpenWall?: MouseEventHandler<HTMLButtonElement>;
  /** Ball was flicked upward — start a Classic run. */
  onTipOff?: () => void;
  /** Ball hit the floor during a dribble — `gain` is 1 for the hard bounce, lower for the rebound. */
  onDribble?: (gain: number) => void;
  onPressIn?: PointerEventHandler<HTMLButtonElement>;
  onPressOut?: PointerEventHandler<HTMLButtonElement>;
}

/**
 * Home hero — the game ball on the centre circle. Tap to dribble, flick up to tip off a run.
 * Bank readout (amount + rail toward $1B) opens the Bank board; Wall of Fame opens the wall preview.
 */
export function HomeVault({
  revealed = true,
  locked = false,
  onOpenBoard,
  onOpenWall,
  onTipOff,
  onDribble,
  onPressIn,
  onPressOut,
}: HomeVaultProps) {
  const { t } = useLocale();
  const { state } = useAccountAuth();
  const balance = useBankBalance(state.status);
  const pending = balance == null;
  const fill = pending ? 0 : Math.min(1, Math.max(0, balance / ROLLOVER_GOAL));
  const hasFill = !pending && fill > 0.004;
  const shown = hasFill ? Math.max(fill, 0.02) : 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef({ v: 0 });
  const swept = useRef(false);
  const drag = useRef<{ id: number; y0: number; t0: number; y: number; t: number; vy: number } | null>(null);
  const flying = useRef(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const { contextSafe } = useGSAP(
    () => {
      const q = gsap.utils.selector(rootRef);
      const rail = q('.rh9-vault__rail-fill');
      const value = rootRef.current?.querySelector<HTMLElement>('.rh9-vault__value');
      const target = pending ? 0 : balance;
      const write = () => {
        if (value) value.textContent = pending ? '—' : formatCash(Math.round(countRef.current.v));
      };

      if (!revealed) {
        gsap.set(rail, { xPercent: -100, x: 0 });
        countRef.current.v = 0;
        write();
        return;
      }
      if (getPrefersReducedMotion() || pending) {
        gsap.set(rail, { xPercent: -(1 - shown) * 100, x: 0 });
        countRef.current.v = target;
        write();
        return;
      }
      const first = !swept.current;
      swept.current = true;
      const delay = first ? 1.35 : 0;
      const duration = first ? 1.8 : 0.9;
      gsap.to(rail, { xPercent: -(1 - shown) * 100, x: 0, duration, delay, ease: 'expo.out', overwrite: 'auto' });
      gsap.to(countRef.current, { v: target, duration, delay, ease: 'expo.out', onUpdate: write, overwrite: 'auto' });
    },
    { scope: rootRef, dependencies: [revealed, pending, balance, shown] },
  );

  const parts = () => {
    const root = rootRef.current;
    return {
      btn: root?.querySelector<HTMLElement>('.rh9-vault__ball-btn') ?? null,
      ball: root?.querySelector<HTMLElement>('.rh9-vault__ball') ?? null,
      pool: root?.querySelector<HTMLElement>('.rh9-vault__pool') ?? null,
    };
  };

  /*
   * Gravity-correct dribble: quad-in falls, quad-out rises, squash only at floor contact.
   * One live timeline — a new tap kills the old one and continues from wherever the ball is,
   * so rapid taps never stack competing tweens (the old jitter).
   */
  const dribbleTl = useRef<gsap.core.Timeline | null>(null);
  const dribble = contextSafe(() => {
    const { btn, ball, pool } = parts();
    if (getPrefersReducedMotion() || !btn || !ball || !pool) {
      onDribble?.(1);
      hapticLight();
      return;
    }
    dribbleTl.current?.kill();
    const contact = (gain: number, heavy: boolean) => () => {
      onDribble?.(gain);
      if (heavy) hapticLight();
    };
    gsap.killTweensOf([btn, pool]);
    dribbleTl.current = gsap
      .timeline()
      .to(btn, { y: 10, scaleX: 1, scaleY: 1, duration: 0.09, ease: 'power2.in' }, 0)
      .add(contact(1, true), 0.09)
      .to(btn, { scaleX: 1.08, scaleY: 0.9, duration: 0.045, ease: 'power1.out' }, 0.09)
      .to(btn, { y: -54, duration: 0.3, ease: 'power2.out' }, 0.135)
      .to(btn, { scaleX: 1, scaleY: 1, duration: 0.16, ease: 'sine.out' }, 0.135)
      .to(btn, { y: 6, duration: 0.27, ease: 'power2.in' }, 0.435)
      .add(contact(0.3, false), 0.705)
      .to(btn, { scaleX: 1.04, scaleY: 0.95, duration: 0.04, ease: 'power1.out' }, 0.705)
      .to(btn, { y: -11, duration: 0.15, ease: 'power2.out' }, 0.745)
      .to(btn, { scaleX: 1, scaleY: 1, duration: 0.1, ease: 'sine.out' }, 0.745)
      .to(btn, { y: 0, duration: 0.14, ease: 'power2.in' }, 0.895)
      .to(pool, { scale: 1.08, autoAlpha: 1, duration: 0.09, ease: 'power2.in' }, 0)
      .to(pool, { scale: 0.62, autoAlpha: 0.5, duration: 0.3, ease: 'power2.out' }, 0.135)
      .to(pool, { scale: 1.04, autoAlpha: 1, duration: 0.27, ease: 'power2.in' }, 0.435)
      .to(pool, { scale: 0.92, autoAlpha: 0.88, duration: 0.15, ease: 'power2.out' }, 0.745)
      .to(pool, { scale: 1, autoAlpha: 1, duration: 0.14, ease: 'power2.in' }, 0.895)
      .to(ball, { rotation: '+=36', duration: 0.9, ease: 'power2.out' }, 0.09);
  });

  const springBack = contextSafe(() => {
    const { btn, pool } = parts();
    gsap.to(btn, { y: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
    gsap.to(pool, { scale: 1, autoAlpha: 1, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
  });

  const tipOff = contextSafe(() => {
    flying.current = true;
    dribbleTl.current?.kill();
    hapticMedium();
    const { btn, ball, pool } = parts();
    if (getPrefersReducedMotion() || !btn || !ball || !pool) {
      onTipOff?.();
      flying.current = false;
      return;
    }
    const rise = -(btn.getBoundingClientRect().bottom + 40);
    gsap
      .timeline({
        onComplete: () => {
          gsap.set(btn, { y: -260, scale: 1 });
          gsap.set(pool, { scale: 0.3, autoAlpha: 0 });
          gsap
            .timeline({ delay: 0.9, onComplete: () => void (flying.current = false) })
            .to(btn, { y: 0, duration: 0.9, ease: 'bounce.out' })
            .to(pool, { scale: 1, autoAlpha: 1, duration: 0.9, ease: 'bounce.out' }, 0);
        },
      })
      .to(btn, { y: rise, scale: 0.56, duration: 0.5, ease: 'power2.in', overwrite: 'auto' })
      .to(ball, { rotation: '-=540', duration: 0.5, ease: 'power1.in' }, 0)
      .to(pool, { scale: 0.3, autoAlpha: 0, duration: 0.35, ease: 'power2.out', overwrite: 'auto' }, 0)
      .add(() => onTipOff?.(), 0.16);
  });

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || flying.current || lockedRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = performance.now();
    drag.current = { id: e.pointerId, y0: e.clientY, t0: now, y: e.clientY, t: now, vy: 0 };
  };

  const onMove = contextSafe((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.vy = d.vy * 0.4 + ((e.clientY - d.y) / dt) * 0.6;
    d.y = e.clientY;
    d.t = now;
    if (getPrefersReducedMotion()) return;
    const dy = e.clientY - d.y0;
    const { btn, pool } = parts();
    const y = dy < 0 ? Math.max(-130, dy * 0.62) : dy * 0.14;
    const lift = Math.min(1, Math.max(0, -y / 130));
    gsap.set(btn, { y, scale: 1 + lift * 0.05 });
    gsap.set(pool, { scale: 1 - lift * 0.35, autoAlpha: 1 - lift * 0.45 });
  });

  const onUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dy = e.clientY - d.y0;
    const quick = performance.now() - d.t0 < 320;
    if (!lockedRef.current && (dy < -TIP_DISTANCE || (dy < -20 && d.vy < -TIP_SPEED))) {
      tipOff();
    } else if (Math.abs(dy) < TAP_SLOP && quick) {
      dribble();
    } else {
      springBack();
    }
  };

  const onCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    springBack();
  };

  return (
    <div ref={rootRef} className={`rh9-vault${hasFill ? ' has-fill' : ''}${pending ? ' is-pending' : ''}`}>
      <div className="rh9-vault__dial">
        <span className="rh9-vault__pool" aria-hidden>
          <span className="rh9-vault__shadow" />
        </span>
        <button
          type="button"
          className="rh9-vault__ball-btn"
          aria-label={t('home.tipOffHint')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="rh9-vault__orb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="rh9-vault__ball"
              src="/images/home-v9/rh9-ball.webp"
              alt=""
              width={720}
              height={720}
              draggable={false}
            />
            <span className="rh9-vault__ball-light" />
          </span>
        </button>
      </div>

      <button
        type="button"
        className="rh9-vault__readout rh9-press"
        aria-label={t('home.bankProgressLabel')}
        onClick={onOpenBoard}
        onPointerDown={onPressIn}
        onPointerUp={onPressOut}
        onPointerLeave={onPressOut}
        onPointerCancel={onPressOut}
      >
        <span className="rh9-vault__label">
          {t('home.bankMoneyBefore')}
          <span className="rh9-vault__goal">{t('home.bankMoneyAmt')}</span>
          {t('home.bankMoneyAfter')}
        </span>
        <span className="rh9-vault__value">{pending ? '—' : formatCash(0)}</span>
        <span className="rh9-vault__rail" aria-hidden>
          <span className="rh9-vault__rail-fill" />
        </span>
      </button>

      <div className="rh9-vault__wof-wrap">
        <button
          type="button"
          className="rh9-vault__wof rh9-press"
          aria-label={`${t('home.wallOfFame')}. ${t('home.wallOfFameBlurb')}`}
          onClick={onOpenWall}
          onPointerDown={onPressIn}
          onPointerUp={onPressOut}
          onPointerLeave={onPressOut}
          onPointerCancel={onPressOut}
        >
          <span className="rh9-vault__wof-face" aria-hidden />
          <span className="rh9-vault__wof-label">{t('home.wallOfFame')}</span>
        </button>
        <span className="rh9-vault__wof-blurb">{t('home.wallOfFameBlurb')}</span>
      </div>
    </div>
  );
}
