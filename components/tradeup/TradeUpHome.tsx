'use client';

import { type PointerEvent as ReactPointerEvent } from 'react';
import { useSound } from '@/hooks/useSound';
import { hapticLight } from '@/lib/tradeup/haptics';
import { SoundSettings } from './SoundSettings';

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
}

/**
 * $1B RUN home — minimal sport UI: title + two primary mode buttons.
 */
export function TradeUpHome({ onPlay, onHeadToHead }: TradeUpHomeProps) {
  const { resume } = useSound();

  const press = (fn: () => void) => (e: ReactPointerEvent) => {
    e.preventDefault();
    resume();
    hapticLight();
    fn();
  };

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub run-home run-home--tabbed">
      <div className="run-home__arena" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="run-home__arena-img"
          src="/images/home-gym-navy.png?v=1"
          alt=""
          decoding="async"
        />
        <div className="run-home__arena-wash" />
      </div>

      <div className="run-home__ui">
        <header className="run-home__top">
          <p className="run-home__brand">$1B RUN</p>
          <SoundSettings variant="gear" />
        </header>

        <div className="run-home__main">
          <section className="run-home__hero" aria-label="Challenge">
            <h1 className="run-home__title">BUILD YOUR $1B FIVE</h1>
            <p className="run-home__subtitle">Draft five players. Reach $1 billion.</p>
          </section>

          <div className="run-home__modes" role="group" aria-label="Game modes">
            <button
              type="button"
              className="run-btn run-btn--primary"
              onPointerDown={press(onPlay)}
            >
              <strong>CLASSIC RUN</strong>
              <span>Build a five worth $1 billion</span>
            </button>

            <button
              type="button"
              className="run-btn run-btn--secondary"
              onPointerDown={press(onHeadToHead)}
            >
              <strong>1V1</strong>
              <span>Build a better five than your opponent</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
