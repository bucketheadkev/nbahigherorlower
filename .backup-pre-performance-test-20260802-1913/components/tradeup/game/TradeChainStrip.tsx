'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { AnimatePresence, motion } from 'framer-motion';
import type { TradePlayer } from '@/lib/tradeup/types';

interface TradeChainStripProps {
  path: TradePlayer[];
  expanded?: boolean;
}

export function TradeChainStrip({ path, expanded = false }: TradeChainStripProps) {
  const reduceMotion = useGameReducedMotion();
  if (path.length === 0) return null;

  const visible = expanded || path.length <= 4 ? path : [path[0]!, ...path.slice(-3)];
  const truncated = !expanded && path.length > 4;

  return (
    <div
      className={`hub-chain${expanded ? ' hub-chain--expanded' : ''}`}
      aria-label={`Trade chain, ${path.length} players`}
    >
      <span className="hub-chain__label">Trade Chain · {path.length}</span>
      <ol className={`hub-chain__list${expanded ? ' hub-chain__list--story' : ''}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {truncated ? (
            <li className="hub-chain__ellipsis" aria-hidden>
              …
            </li>
          ) : null}
          {visible.map((player, index) => (
            <motion.li
              key={`${player.id}-${path.length}-${index}`}
              className="hub-chain__item"
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {(index > 0 || truncated) && (
                <span className="hub-chain__arrow" aria-hidden>
                  ↓
                </span>
              )}
              <span className="hub-chain__name">{player.name}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}
