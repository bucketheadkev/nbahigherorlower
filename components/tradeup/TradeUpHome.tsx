'use client';

import { type PointerEvent as ReactPointerEvent, useMemo } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import {
  BILLION_GOAL,
  formatDollarsExact,
} from '@/lib/tradeup/billionDollar';
import { hapticLight } from '@/lib/tradeup/haptics';
import { getBestRosterValue } from '@/lib/tradeup/storage';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { LanguageToggle } from './LanguageToggle';
import { MoneyRain } from './MoneyRain';
import { BallionLogo } from './TradeUpLogo';
import { SoundSettings } from './SoundSettings';

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
}

/** $1B RUN home — premium sports composition. */
export function TradeUpHome({ onPlay, onHeadToHead }: TradeUpHomeProps) {
  const { resume } = useSound();
  const { t } = useLocale();
  const bestRun = useMemo(() => getBestRosterValue(), []);
  const bestIsBillion = bestRun >= BILLION_GOAL;

  const press = (fn: () => void) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resume();
    hapticLight();
    fn();
  };

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub run-home run-home--tabbed">
      <ArenaAtmosphere intensity="hub" />
      <MoneyRain />

      <div className="run-home__ui">
        <header className="run-home__top">
          <div className="run-home__brand">
            <BallionLogo size="sm" priority className="run-home__logo" />
            <p className="run-home__wordmark" aria-label="$1B Run">
              <span className="run-home__wordmark-green">$1B</span>
              <span className="run-home__wordmark-white"> RUN</span>
            </p>
          </div>
          <div className="run-home__toolbar">
            <LanguageToggle />
            <SoundSettings variant="gear" />
          </div>
        </header>

        {/* Space for gym hoop between brand bar and BUILD YOUR FIVE */}
        <div className="run-home__hoop-gap" aria-hidden />

        <div className="run-home__main">
          <section className="run-home__hero" aria-label={t('home.challengeLabel')}>
            <h1 className="run-home__title">{t('home.heroTitle')}</h1>
            <p className="run-home__subtitle">{t('home.heroSubtitle')}</p>
          </section>

          <div className="run-home__stage">
            <div
              className="run-home__modes run-home__modes--tiles"
              role="group"
              aria-label={t('home.modesLabel')}
            >
              <article className="home-tile home-tile--classic">
                <div className="home-tile__frame">
                  <span className="home-tile__edge" aria-hidden />
                  <span className="home-tile__accent" aria-hidden />
                  <strong className="home-tile__title">{t('home.classicTitle')}</strong>
                  <span className="home-tile__desc">{t('home.classicDesc')}</span>
                  <span className="home-tile__mark" aria-hidden>
                    $1B
                  </span>
                  <button
                    type="button"
                    className="home-tile__play ui-tap"
                    onPointerDown={press(onPlay)}
                  >
                    {t('home.playButton')}
                  </button>
                </div>
              </article>

              <article className="home-tile home-tile--h2h">
                <div className="home-tile__frame">
                  <span className="home-tile__edge" aria-hidden />
                  <span className="home-tile__accent" aria-hidden />
                  <strong className="home-tile__title">{t('home.h2hTitle')}</strong>
                  <span className="home-tile__desc">{t('home.h2hDesc')}</span>
                  <span className="home-tile__mark home-tile__mark--dual" aria-hidden>
                    <svg
                      className="home-tile__dual"
                      viewBox="0 0 64 64"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Left player */}
                      <circle cx="22" cy="18" r="9" />
                      <path d="M6.5 52.5c0-10.2 6.9-16.5 15.5-16.5S37.5 42.3 37.5 52.5V56H6.5v-3.5Z" />
                      {/* Right player */}
                      <circle cx="42" cy="18" r="9" />
                      <path d="M26.5 52.5c0-10.2 6.9-16.5 15.5-16.5S57.5 42.3 57.5 52.5V56H26.5v-3.5Z" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    className="home-tile__play ui-tap"
                    onPointerDown={press(onHeadToHead)}
                  >
                    {t('home.playButton')}
                  </button>
                </div>
              </article>
            </div>

            <div
              className={`run-home__best${bestIsBillion ? ' is-billion' : ''}`}
              aria-label={t('home.bestRunLabel')}
            >
              <span className="run-home__best-label">{t('home.bestRunLabel')}</span>
              <strong className="run-home__best-value">
                {bestRun > 0 ? formatDollarsExact(bestRun) : t('home.bestRunEmpty')}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
