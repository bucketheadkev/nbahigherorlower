'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
}

const COLORS = ['#34d399', '#6ee7b7', '#a7f3d0', '#fbbf24', '#ffffff'];

export function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) return;
    const next: Particle[] = Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 120 - 40,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
    }));
    setParticles(next);
    const t = setTimeout(() => setParticles([]), 900);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className="confetti-root" aria-hidden>
      <AnimatePresence>
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="confetti-piece"
            style={{ backgroundColor: p.color }}
            initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            animate={{
              opacity: 0,
              x: p.x,
              y: p.y,
              rotate: p.rotation,
              scale: 0.4,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
