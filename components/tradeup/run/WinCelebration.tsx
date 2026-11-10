'use client';

import { useEffect, useRef } from 'react';

const DURATION_MS = 3400;
const FADE_MS = 700;

/** Metallic confetti: each piece shows its light face, then its dark face, as it turns. */
const CONFETTI: Array<[string, string]> = [
  ['#ffe08a', '#b8861c'],
  ['#fff3c4', '#c9a443'],
  ['#ffffff', '#b9c2cf'],
  ['#f6cf62', '#9c6c10'],
];

interface Bill {
  x: number;
  y: number;
  vy: number;
  sway: number;
  swaySpeed: number;
  phase: number;
  tilt: number;
  rock: number;
  flip: number;
  flipSpeed: number;
  /** Depth: 1 is nearest. Far notes are smaller, slower and dimmer. */
  depth: number;
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  colors: [string, string];
}

const SHADE_LEVELS = 8;
const MAX_SHADE = 0.56;

/** The note pre-darkened in steps, so each falling bill is a single draw. */
function shadedSprites(base: HTMLCanvasElement): HTMLCanvasElement[] {
  return Array.from({ length: SHADE_LEVELS }, (_, i) => {
    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height;
    const g = c.getContext('2d')!;
    g.drawImage(base, 0, 0);
    g.fillStyle = `rgba(12, 22, 16, ${((MAX_SHADE * i) / (SHADE_LEVELS - 1)).toFixed(3)})`;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  });
}

/** A US $100 note at its real 2.35:1 proportion, drawn once at device resolution. */
function billSprite(dpr: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const ink = '#3f5a47';

  const paper = g.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#e2e6d8');
  paper.addColorStop(0.5, '#cfd7c4');
  paper.addColorStop(1, '#b9c4ad');
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);

  // Engraved frame and fine guilloche lines.
  const m = h * 0.07;
  g.strokeStyle = ink;
  g.globalAlpha = 0.85;
  g.lineWidth = Math.max(0.6, h * 0.035);
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.globalAlpha = 0.22;
  g.lineWidth = Math.max(0.4, h * 0.018);
  for (let i = 1; i < 7; i += 1) {
    const y = m + ((h - m * 2) * i) / 7;
    g.beginPath();
    g.moveTo(m * 2, y);
    g.bezierCurveTo(w * 0.3, y - h * 0.08, w * 0.7, y + h * 0.08, w - m * 2, y);
    g.stroke();
  }

  // Portrait in an oval frame.
  g.globalAlpha = 1;
  const ox = w * 0.56;
  g.beginPath();
  g.ellipse(ox, h / 2, h * 0.27, h * 0.34, 0, 0, Math.PI * 2);
  g.fillStyle = '#e8ebe0';
  g.fill();
  g.lineWidth = Math.max(0.6, h * 0.03);
  g.strokeStyle = ink;
  g.stroke();
  g.fillStyle = 'rgba(63, 90, 71, 0.55)';
  g.beginPath();
  g.ellipse(ox, h * 0.44, h * 0.1, h * 0.12, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(ox, h * 0.74, h * 0.19, h * 0.12, 0, Math.PI, Math.PI * 2);
  g.fill();

  // Seal and the security ribbon.
  g.beginPath();
  g.arc(w * 0.22, h * 0.56, h * 0.13, 0, Math.PI * 2);
  g.fillStyle = 'rgba(63, 110, 79, 0.45)';
  g.fill();
  g.fillStyle = 'rgba(70, 120, 190, 0.55)';
  g.fillRect(w * 0.37, m, h * 0.06, h - m * 2);

  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${h * 0.26}px "Times New Roman", Georgia, serif`;
  g.fillText('100', w * 0.14, h * 0.26);
  g.font = `700 ${h * 0.34}px "Times New Roman", Georgia, serif`;
  g.fillText('100', w * 0.84, h * 0.66);
  return c;
}

/**
 * The $1B moment: notes pour down, thickest along the sides, with a light burst of gold confetti,
 * on one canvas at device resolution. The parent layers it behind the total and the names and
 * applies the shake. Pointer-transparent; fades out fully and then reports done.
 */
export function WinCelebration({ reduceMotion = false, onDone }: { reduceMotion?: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // 2x is sharp for moving paper and keeps the fill rate light on 3x phones.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const unit = Math.min(W / 390, 1.6);
    const billW = 44 * unit;
    const billH = billW / 2.35;
    const sprites = shadedSprites(billSprite(dpr, billW, billH));
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const bills: Bill[] = Array.from({ length: reduceMotion ? 0 : 74 }, () => {
      const side = Math.random() < 0.6;
      const depth = side ? rand(0.6, 1) : rand(0.5, 0.75);
      const x = side
        ? Math.random() < 0.5
          ? rand(-0.03, 0.24)
          : rand(0.76, 1.03)
        : rand(0.24, 0.76);
      return {
        x: x * W,
        y: rand(-1.15, -0.04) * H,
        vy: rand(330, 520) * unit * depth,
        sway: rand(10, 26) * unit * depth,
        swaySpeed: rand(1.6, 2.8),
        phase: rand(0, Math.PI * 2),
        tilt: rand(-0.5, 0.5),
        rock: rand(0.25, 0.6),
        flip: rand(0, Math.PI * 2),
        flipSpeed: rand(2.2, 4.4),
        depth,
      };
    }).sort((a, b) => a.depth - b.depth);

    const pieces: Piece[] = [];
    const burst = (fromX: number, dir: number, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const speed = rand(560, 1040) * unit;
        const a = (rand(60, 82) * Math.PI) / 180;
        pieces.push({
          x: fromX,
          y: H + 10,
          vx: Math.cos(a) * speed * dir,
          vy: -Math.sin(a) * speed,
          w: rand(4, 7) * unit,
          h: rand(7, 11) * unit,
          angle: rand(0, Math.PI * 2),
          spin: rand(-8, 8),
          flip: rand(0, Math.PI * 2),
          flipSpeed: rand(7, 13),
          colors: CONFETTI[Math.floor(Math.random() * CONFETTI.length)]!,
        });
      }
    };
    const cannon = reduceMotion ? 18 : 42;
    burst(-10, 1, cannon);
    burst(W + 10, -1, cannon);

    let raf = 0;
    let last = performance.now();
    const start = last;
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > DURATION_MS - FADE_MS ? Math.max(0, (DURATION_MS - t) / FADE_MS) : 1;

      for (const b of bills) {
        b.y += b.vy * dt;
        b.phase += b.swaySpeed * dt;
        b.flip += b.flipSpeed * dt;
        if (b.y > H + billW) continue;
        const x = b.x + Math.sin(b.phase) * b.sway;
        // Paper rocks side to side as it falls rather than spinning, and turns over now and then.
        const angle = b.tilt + Math.sin(b.phase * 0.9) * b.rock;
        const face = Math.cos(b.flip);
        const s = b.depth;
        ctx.save();
        ctx.globalAlpha = fade * (0.55 + 0.45 * b.depth);
        ctx.translate(x, b.y);
        ctx.rotate(angle);
        ctx.scale(s, s * Math.max(0.1, Math.abs(face)));
        // The face turned from the light reads darker; distant notes sit back in the haze.
        const shade = (face < 0 ? 0.3 : 0.12 * (1 - face)) + (1 - b.depth) * 0.35;
        const level = Math.min(SHADE_LEVELS - 1, Math.round((shade / MAX_SHADE) * (SHADE_LEVELS - 1)));
        ctx.drawImage(sprites[level]!, -billW / 2, -billH / 2, billW, billH);
        ctx.restore();
      }

      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 980 * unit * dt;
        p.vx *= 1 - 1.6 * dt;
        p.vy *= 1 - 1.15 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        p.flip += p.flipSpeed * dt;
        if (p.y > H + 30) continue;
        const face = Math.cos(p.flip);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(1, Math.max(0.12, Math.abs(face)));
        ctx.fillStyle = face > 0 ? p.colors[0] : p.colors[1];
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (t < DURATION_MS) raf = requestAnimationFrame(tick);
      else {
        ctx.clearRect(0, 0, W, H);
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // One celebration per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="cr__party" aria-hidden />;
}
