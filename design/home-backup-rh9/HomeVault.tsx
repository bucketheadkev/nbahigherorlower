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

const R = 80;
const CIRC = 2 * Math.PI * R;
const TICKS = Array.from({ length: 40 }, (_, i) => i);

interface HomeVaultProps {
  /** Splash is gone — arc + counter run once the hero has landed. */
  revealed?: boolean;
  onOpenBoard?: MouseEventHandler<HTMLButtonElement>;
  onOpenWall?: MouseEventHandler<HTMLButtonElement>;
  onBallTap?: () => void;
  onPressIn?: PointerEventHandler<HTMLButtonElement>;
  onPressOut?: PointerEventHandler<HTMLButtonElement>;
}

/**
 * Home hero — the ball in a machined bezel. The green arc is Bank progress toward $1B.
 * Bank readout opens the Bank board; Wall of Fame opens the wall preview.
 */
export function HomeVault({
  revealed = true,
  onOpenBoard,
  onOpenWall,
  onBallTap,
  onPressIn,
  onPressOut,
}: HomeVaultProps) {
  const { t } = useLocale();
  const { state } = useAccountAuth();
  const balance = useBankBalance(state.status);
  const pending = balance == null;
  const fill = pending ? 0 : Math.min(1, Math.max(0, balance / ROLLOVER_GOAL));
  const hasFill = !pending && fill > 0.004;
  const shown = hasFill ? Math.max(fill, 0.012) : 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef({ v: 0 });
  const swept = useRef(false);

  const { contextSafe } = useGSAP(
    () => {
      const q = gsap.utils.selector(rootRef);
      const arc = q('.rh9-vault__arc');
      const tip = q('.rh9-vault__tip');
      const value = rootRef.current?.querySelector<HTMLElement>('.rh9-vault__value');
      const target = pending ? 0 : balance;
      const write = () => {
        if (value) value.textContent = pending ? '—' : formatCash(Math.round(countRef.current.v));
      };

      if (!revealed) {
        gsap.set(arc, { strokeDashoffset: CIRC, autoAlpha: 0 });
        gsap.set(tip, { rotation: 0, svgOrigin: '100 100', autoAlpha: 0 });
        countRef.current.v = 0;
        write();
        return;
      }
      if (getPrefersReducedMotion() || pending) {
        gsap.set(arc, { strokeDashoffset: CIRC * (1 - shown), autoAlpha: hasFill ? 1 : 0 });
        gsap.set(tip, { rotation: shown * 360, svgOrigin: '100 100', autoAlpha: hasFill ? 1 : 0 });
        countRef.current.v = target;
        write();
        return;
      }
      const first = !swept.current;
      swept.current = true;
      const delay = first ? 1.35 : 0;
      const duration = first ? 1.8 : 0.9;
      gsap.set(arc, { autoAlpha: hasFill ? 1 : 0, delay });
      gsap.to(arc, { strokeDashoffset: CIRC * (1 - shown), duration, delay, ease: 'expo.out', overwrite: 'auto' });
      gsap.to(tip, {
        rotation: shown * 360,
        svgOrigin: '100 100',
        autoAlpha: hasFill ? 1 : 0,
        duration,
        delay,
        ease: 'expo.out',
        overwrite: 'auto',
      });
      gsap.to(countRef.current, { v: target, duration, delay, ease: 'expo.out', onUpdate: write, overwrite: 'auto' });
    },
    { scope: rootRef, dependencies: [revealed, pending, balance, shown, hasFill] },
  );

  const bounceBall = contextSafe(() => {
    onBallTap?.();
    if (getPrefersReducedMotion()) return;
    const q = gsap.utils.selector(rootRef);
    const btn = rootRef.current?.querySelector('.rh9-vault__ball-btn');
    if (!btn) return;
    gsap
      .timeline()
      .to(btn, { scaleY: 0.9, scaleX: 1.06, duration: 0.08, ease: 'power2.out' })
      .to(btn, { y: -34, scaleY: 1.04, scaleX: 0.97, rotation: '+=40', duration: 0.26, ease: 'power2.out' })
      .to(btn, { y: 0, scaleY: 1, scaleX: 1, duration: 0.5, ease: 'bounce.out' });
  });

  return (
    <div ref={rootRef} className={`rh9-vault${hasFill ? ' has-fill' : ''}${pending ? ' is-pending' : ''}`}>
      <div className="rh9-vault__dial">
        <svg className="rh9-vault__svg" viewBox="0 0 200 200" aria-hidden>
          <defs>
            <linearGradient id="rh9-bezel" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.32" stopColor="#d3dbea" />
              <stop offset="0.5" stopColor="#7f8db0" />
              <stop offset="0.68" stopColor="#eef2f9" />
              <stop offset="1" stopColor="#97a5c4" />
            </linearGradient>
            <radialGradient id="rh9-well" cx="0.5" cy="0.42" r="0.6">
              <stop offset="0" stopColor="#0a2bb8" />
              <stop offset="0.7" stopColor="#011b96" />
              <stop offset="1" stopColor="#000a4a" />
            </radialGradient>
            <linearGradient id="rh9-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#13a865" />
              <stop offset="0.55" stopColor="#29e490" />
              <stop offset="1" stopColor="#7dffc0" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="99" fill="url(#rh9-bezel)" />
          <circle cx="100" cy="100" r="99.4" fill="none" stroke="rgba(0,6,55,0.55)" strokeWidth="0.8" />
          <circle cx="100" cy="100" r="91.5" fill="#000a4a" />
          <circle cx="100" cy="100" r="90.5" fill="url(#rh9-well)" />
          <g className="rh9-vault__ticks">
            {TICKS.map((i) => {
              const major = i % 4 === 0;
              return (
                <line
                  key={i}
                  x1="100"
                  y1={major ? 3.5 : 4.5}
                  x2="100"
                  y2={major ? 9.5 : 7.5}
                  stroke={major ? '#0a1f7a' : 'rgba(10,31,122,0.6)'}
                  strokeWidth={major ? 1.6 : 0.9}
                  strokeLinecap="round"
                  transform={`rotate(${i * 9} 100 100)`}
                />
              );
            })}
          </g>
          <g className="rh9-vault__glint">
            <path
              d="M75.4 8.2 A95 95 0 0 1 124.6 8.2"
              fill="none"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(0,6,55,0.85)" strokeWidth="5.5" />
          <circle cx="100" cy="100" r={R + 3.2} fill="none" stroke="rgba(150,182,255,0.28)" strokeWidth="0.6" />
          <circle
            className="rh9-vault__arc"
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="url(#rh9-arc)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC}
            opacity={0}
            transform="rotate(-90 100 100)"
          />
          <g className="rh9-vault__tip">
            <circle cx="100" cy={100 - R} r="6" fill="rgba(125,255,192,0.28)" />
            <circle cx="100" cy={100 - R} r="3" fill="#eafff5" />
          </g>
        </svg>

        <span className="rh9-vault__shadow" aria-hidden />
        <button
          type="button"
          className="rh9-vault__ball-btn"
          aria-hidden
          tabIndex={-1}
          onClick={bounceBall}
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
