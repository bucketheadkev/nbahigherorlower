'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Locale } from '@/lib/i18n/messages';
import { hapticTap } from '@/lib/tradeup/haptics';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { RolloverPanel } from '../run/RolloverPanel';
import { FINISH, topLegends, WELCOME, type ShowcaseLegend } from './introData';
import { pick } from './onboardingCopy';
import { EASE_OUT, TickerNumber } from './ticker';

const SCENE_IN = { opacity: 0, y: 24, scale: 0.98 };
const SCENE_SHOWN = { opacity: 1, y: 0, scale: 1 };
const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];
const SCENE_OUT = { opacity: 0, scale: 0.96, transition: { duration: 0.35, ease: EASE_IN } };

const SHOWCASE_COUNT = 5;
const ROW_STAGGER_S = 0.1;
const ROW_LEAD_S = 0.2;

/** Counts up from $0 after `delayMs`. */
function CountIn({
  value,
  delayMs,
  duration = 900,
  reduceMotion,
  className,
}: {
  value: number;
  delayMs: number;
  duration?: number;
  reduceMotion: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      return;
    }
    const id = window.setTimeout(() => setShown(value), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, reduceMotion, value]);
  return <TickerNumber className={className} value={shown} duration={duration} />;
}

function eraTag(legend: ShowcaseLegend): string {
  return `${legend.teamId} · ’${legend.era.slice(2)}`;
}

function LegendRow({ legend, index, reduceMotion }: { legend: ShowcaseLegend; index: number; reduceMotion: boolean }) {
  const accent = getTeamColors(legend.teamId).primary;
  const ink = contrastOnPrimary(accent);
  const delay = ROW_LEAD_S + index * ROW_STAGGER_S;
  return (
    <motion.li
      className={`classic-val__five-row intro-legend${index === 0 ? ' is-top' : ''}`}
      style={
        {
          '--row-accent': accent,
          '--row-ink': ink,
          '--row-i': index,
          backgroundColor: accent,
          color: ink,
        } as CSSProperties
      }
      initial={reduceMotion ? false : { opacity: 0, x: -22, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: EASE_OUT }}
    >
      <span className="classic-val__five-pos">{legend.position}</span>
      <strong className="classic-val__five-name">
        {legend.name}
        <span className="intro-legend__tag">{eraTag(legend)}</span>
      </strong>
      <em className="classic-val__five-value">
        <CountIn value={legend.value} delayMs={(delay + 0.15) * 1000} reduceMotion={reduceMotion} />
      </em>
    </motion.li>
  );
}

export function WelcomeScene({
  locale,
  reduceMotion,
  onNext,
}: {
  locale: Locale;
  reduceMotion: boolean;
  onNext: () => void;
}) {
  const legends = useMemo(() => topLegends(SHOWCASE_COUNT), []);
  const settle = ROW_LEAD_S + legends.length * ROW_STAGGER_S + 0.35;
  return (
    <motion.div
      key="welcome"
      className="intro__scene intro-welcome"
      initial={SCENE_IN}
      animate={SCENE_SHOWN}
      exit={SCENE_OUT}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      <div className="classic-val__five intro-welcome__board">
        <p className="classic-val__five-heading">{pick(WELCOME.heading, locale)}</p>
        <ul className="classic-val__five-list intro-legends">
          {legends.map((legend, index) => (
            <LegendRow key={legend.id} legend={legend} index={index} reduceMotion={reduceMotion} />
          ))}
        </ul>
      </div>
      <motion.div
        className="intro-welcome__foot"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : settle, duration: 0.5, ease: EASE_OUT }}
      >
        <p className="intro-welcome__line">{pick(WELCOME.line, locale)}</p>
        <button
          type="button"
          className="intro__cta"
          onClick={() => {
            hapticTap();
            onNext();
          }}
        >
          {pick(WELCOME.cta, locale)}
        </button>
      </motion.div>
    </motion.div>
  );
}

/**
 * Draft tray after the demo crosses $1B: the Rollover every Classic Run pays above $1B, then
 * Get Started. Nothing is stored or credited.
 */
export function DemoFinish({
  rollover,
  locale,
  reduceMotion,
  onFinish,
}: {
  rollover: number;
  locale: Locale;
  reduceMotion: boolean;
  onFinish: () => void;
}) {
  return (
    <motion.div
      key="finish"
      className="intro-finish"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <RolloverPanel amount={rollover} reduceMotion={reduceMotion} />
      <div className="intro-finish__row">
        <button
          type="button"
          className="intro__cta intro-finish__start is-ready"
          onClick={() => {
            hapticTap();
            onFinish();
          }}
        >
          {pick(FINISH.start, locale)}
        </button>
      </div>
    </motion.div>
  );
}
