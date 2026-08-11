'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { hapticHeavy, hapticLight } from '@/lib/tradeup/haptics';
import { BALLION_LOGO_SRC } from './TradeUpLogo';

interface HeatRevealLayerProps {
  width: number;
  height: number;
  reduceMotion?: boolean;
  disabled?: boolean;
  onFullyRevealed: () => void;
}

const REVEAL_MS = 880;
const AUTO_COMMIT_MS = 400;
const TRAIL_MAX = 10;

type HeatPoint = { x: number; y: number; born: number };

/**
 * Thermochromic Heat Reveal — coating clears from the finger contact point.
 * Uses canvas destination-out + rAF (no per-frame React state).
 */
export const HeatRevealLayer = memo(function HeatRevealLayer({
  width,
  height,
  reduceMotion = false,
  disabled = false,
  onFullyRevealed,
}: HeatRevealLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coatingReadyRef = useRef(false);
  const revealedRef = useRef(false);
  const holdingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startAtRef = useRef(0);
  const heldMsRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef(0);
  const autoFinishRef = useRef(false);
  const fingerRef = useRef<{ x: number; y: number } | null>(null);
  const trailRef = useRef<HeatPoint[]>([]);
  const seedRef = useRef(Math.random() * 1000);
  const hapticPulseAtRef = useRef<number[]>([220, 480, 680]);
  const hapticFiredRef = useRef(new Set<number>());
  const logoRef = useRef<HTMLImageElement | null>(null);
  const onRevealRef = useRef(onFullyRevealed);
  onRevealRef.current = onFullyRevealed;

  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;

  const paintCoating = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 2 || height < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Charcoal / graphite thermochromic base
    const base = ctx.createLinearGradient(0, 0, width * 0.2, height);
    base.addColorStop(0, '#1a222b');
    base.addColorStop(0.45, '#121820');
    base.addColorStop(1, '#0c1117');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    // Soft satin sheen
    const sheen = ctx.createLinearGradient(0, 0, width, height * 0.55);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(210,220,230,0.07)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);

    // Micro grain
    const grains = Math.floor((width * height) / 42);
    for (let i = 0; i < grains; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const a = 0.025 + Math.random() * 0.05;
      ctx.fillStyle =
        Math.random() > 0.55
          ? `rgba(255,255,255,${a})`
          : `rgba(0,0,0,${a * 1.35})`;
      ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
    }

    // Embossed Ballion B (subtle)
    const logo = logoRef.current;
    if (logo && logo.complete && logo.naturalWidth > 0) {
      const size = Math.min(width, height) * 0.34;
      const lx = (width - size) / 2;
      const ly = (height - size) * 0.38;
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.drawImage(logo, lx, ly, size, size);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#35e6a1';
      ctx.font = `800 ${Math.floor(Math.min(width, height) * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', width / 2, height * 0.42);
      ctx.restore();
    }

    // Edge vignette
    const edge = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.28,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, width, height);

    coatingReadyRef.current = true;
  }, [height, width]);

  useEffect(() => {
    const img = new window.Image();
    img.decoding = 'async';
    img.src = BALLION_LOGO_SRC;
    img.onload = () => {
      logoRef.current = img;
      if (!revealedRef.current) paintCoating();
    };
    logoRef.current = img;
  }, [paintCoating]);

  useEffect(() => {
    paintCoating();
    revealedRef.current = false;
    holdingRef.current = false;
    autoFinishRef.current = false;
    trailRef.current = [];
    fingerRef.current = null;
    heldMsRef.current = 0;
    hapticFiredRef.current.clear();
    seedRef.current = Math.random() * 1000;

    if (reduceMotion) {
      const t = window.setTimeout(() => {
        revealedRef.current = true;
        onRevealRef.current();
      }, 50);
      return () => window.clearTimeout(t);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [paintCoating, reduceMotion]);

  const finish = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    holdingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      const w = widthRef.current;
      const h = heightRef.current;
      // Final soft clear so no flecks remain
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    hapticHeavy();
    onRevealRef.current();
  }, []);

  const stampHeat = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      radius: number,
      strength: number,
    ) => {
      if (radius < 1 || strength <= 0) return;
      const seed = seedRef.current;
      // Warm transitional halo (lighter coating before full clear)
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const warmR = radius * 1.12;
      const warm = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, warmR);
      warm.addColorStop(0, 'rgba(90,102,112,0)');
      warm.addColorStop(0.55, `rgba(120,132,142,${0.1 * strength})`);
      warm.addColorStop(1, 'rgba(80,90,100,0)');
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.arc(cx, cy, warmR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Organic destination-out core (irregular multi-lobe)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const lobes = 5;
      for (let i = 0; i < lobes; i += 1) {
        const ang = seed * 0.7 + i * 1.35;
        const wobble = 0.78 + ((Math.sin(seed + i * 2.1) + 1) * 0.5) * 0.34;
        const ox = Math.cos(ang) * radius * 0.16 * wobble;
        const oy = Math.sin(ang * 1.17) * radius * 0.14 * wobble;
        const rr = radius * (0.62 + (i % 3) * 0.12) * wobble;
        const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
        const a0 = 0.55 * strength * (i === 0 ? 1 : 0.72);
        g.addColorStop(0, `rgba(0,0,0,${a0})`);
        g.addColorStop(0.45, `rgba(0,0,0,${0.32 * strength})`);
        g.addColorStop(0.78, `rgba(0,0,0,${0.1 * strength})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    [],
  );

  const tick = useCallback(
    (now: number) => {
      if (revealedRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !coatingReadyRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const last = lastTickRef.current || now;
      const dt = Math.min(40, now - last);
      lastTickRef.current = now;

      if (holdingRef.current || autoFinishRef.current) {
        heldMsRef.current += dt;
      } else {
        // Pause animation work until the next touch (progress is preserved).
        rafRef.current = 0;
        return;
      }

      const held = heldMsRef.current;
      // Ease: slow start, then surge (thermochromic feel)
      const raw = Math.min(1, held / REVEAL_MS);
      const progress = 1 - Math.pow(1 - raw, 2.15);

      const w = widthRef.current;
      const h = heightRef.current;
      const cover = Math.hypot(w, h) * 0.72;
      const finger = fingerRef.current;

      if (finger) {
        const radius = Math.max(8, cover * progress);
        stampHeat(ctx, finger.x, finger.y, radius, 0.85 + progress * 0.2);

        // Trail contributions (softer, smaller)
        for (const p of trailRef.current) {
          const age = (now - p.born) / 700;
          if (age > 1) continue;
          const tr = radius * (0.35 + (1 - age) * 0.35);
          stampHeat(ctx, p.x, p.y, tr, 0.35 * (1 - age));
        }
      }

      // Mid-reveal subtle haptic pulses (once each)
      for (const at of hapticPulseAtRef.current) {
        if (held >= at && !hapticFiredRef.current.has(at)) {
          hapticFiredRef.current.add(at);
          hapticLight();
        }
      }

      if (progress >= 0.995) {
        finish();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [finish, stampHeat],
  );

  const ensureRaf = useCallback(() => {
    if (revealedRef.current) return;
    if (rafRef.current) return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const localPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(widthRef.current, Math.max(0, e.clientX - rect.left)),
      y: Math.min(heightRef.current, Math.max(0, e.clientY - rect.top)),
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || revealedRef.current || reduceMotion) return;
    if (pointerIdRef.current != null) return; // first touch only
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;

    const p = localPoint(e);
    fingerRef.current = p;
    trailRef.current = [{ x: p.x, y: p.y, born: performance.now() }];
    holdingRef.current = true;
    autoFinishRef.current = false;

    if (!startAtRef.current) startAtRef.current = performance.now();
    hapticLight();
    ensureRaf();

    // Immediate tiny reaction under finger
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) stampHeat(ctx, p.x, p.y, 14, 0.7);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    if (revealedRef.current) return;
    const p = localPoint(e);
    fingerRef.current = p;
    const trail = trailRef.current;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 10) {
      trail.push({ x: p.x, y: p.y, born: performance.now() });
      if (trail.length > TRAIL_MAX) trail.shift();
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    holdingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    // If held long enough, finish automatically even after lift
    if (heldMsRef.current >= AUTO_COMMIT_MS && !revealedRef.current) {
      autoFinishRef.current = true;
      ensureRaf();
    }
  };

  if (width < 2 || height < 2) return null;

  return (
    <canvas
      ref={canvasRef}
      className="heat-reveal-layer"
      aria-label="Hold to reveal"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
});
