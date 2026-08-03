'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useSound } from '@/hooks/useSound';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getBestRosterValue } from '@/lib/tradeup/storage';
import { HomeBackground } from './home/HomeBackground';
import { TradeUpLogo } from './TradeUpLogo';

interface TradeUpHomeProps {
  onPlay: () => void;
  launching?: boolean;
}

export function TradeUpHome({ onPlay, launching = false }: TradeUpHomeProps) {
  const reduceMotion = useGameReducedMotion();
  const { resume, playAccept } = useSound();
  const [personalBest, setPersonalBest] = useState(0);

  useEffect(() => {
    setPersonalBest(getBestRosterValue());
  }, []);

  return (
    <div
      className={`tradeup-shell tradeup-shell--home tradeup-shell--hub${
        launching ? ' is-launching' : ''
      }`}
    >
      <HomeBackground interactive={!launching} />

      <main className="home-menu hub-scroll">
        <motion.div
          className="home-menu__stack home-menu__stack--play"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{
            opacity: launching ? 0.35 : 1,
            y: 0,
            scale: launching ? 0.98 : 1,
          }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="home-menu__brand">
            <TradeUpLogo size="hero" priority />
            <p className="home-menu__goal">Draft a roster worth $1,000,000,000.</p>
            {personalBest > 0 ? (
              <p className="home-menu__pb">
                Personal best <strong>{formatDollarsExact(personalBest)}</strong>
              </p>
            ) : null}
          </header>

          <motion.button
            type="button"
            className={`home-play-cta${launching ? ' is-launching' : ''}`}
            disabled={launching}
            onClick={() => {
              if (launching) return;
              resume();
              playAccept();
              onPlay();
            }}
            aria-label="Play"
            whileHover={
              reduceMotion || launching
                ? undefined
                : {
                    scale: 1.03,
                    transition: { type: 'spring', stiffness: 420, damping: 18 },
                  }
            }
            whileTap={
              reduceMotion || launching
                ? undefined
                : { scale: 0.97, transition: { duration: 0.08 } }
            }
          >
            <span className="home-play-cta__glow" aria-hidden />
            <span className="home-play-cta__wings" aria-hidden />
            <span className="home-play-cta__label">Play</span>
            <span className="home-play-cta__wings home-play-cta__wings--right" aria-hidden />
          </motion.button>

          <p className="home-menu__hint">
            Print franchise tickets, pick your five from the player list, then feed them into the value chamber.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
