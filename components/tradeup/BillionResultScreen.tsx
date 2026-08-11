'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BILLION_GOAL,
  formatDollars,
  formatDollarsExact,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import type { SeasonRecord } from '@/lib/tradeup/lineupSeason';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import {
  WORLD_POOL_SIZE,
  formatWorldRank,
} from '@/lib/tradeup/worldLeaderboard';
import { BallionWordmark } from './BallionWordmark';

interface BillionResultScreenProps {
  kind: 'won' | 'lost';
  teamValue: number;
  /** Players in PG → C slot order. */
  roster: ValuedPlayer[];
  seasonRecord: SeasonRecord | null;
  personalBest: number;
  isNewPersonalBest: boolean;
  /** 1-based world leaderboard place for this run. */
  worldRank: number;
  onExit: () => void;
}

function buildShareText(
  kind: 'won' | 'lost',
  teamValue: number,
  record: SeasonRecord | null,
  worldRank: number,
) {
  const recordBit = record ? ` (${record.wins}–${record.losses})` : '';
  const rankBit = worldRank > 0 ? ` World rank ${formatWorldRank(worldRank)}.` : '';
  if (kind === 'won') {
    return `I just built a ${formatDollarsExact(teamValue)} NBA roster${recordBit} and cleared $1B on Ballion.${rankBit}`;
  }
  return `Ran it back to ${formatDollarsExact(teamValue)}${recordBit} on Ballion — still chasing $1B.${rankBit}`;
}

async function renderSharePng(node: HTMLElement): Promise<Blob | null> {
  try {
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#06070b',
    });
    return blob;
  } catch {
    return null;
  }
}

/**
 * Ultra-fast live W–L spinner that lands on the projected season record.
 * This is the focal point of the result screen.
 */
function RecordSpinGenerator({
  wins,
  losses,
  reduceMotion,
}: {
  wins: number;
  losses: number;
  reduceMotion: boolean;
}) {
  const [displayWins, setDisplayWins] = useState(reduceMotion ? wins : 0);
  const [displayLosses, setDisplayLosses] = useState(reduceMotion ? losses : 0);
  const [phase, setPhase] = useState<'spinning' | 'landing' | 'locked'>(
    reduceMotion ? 'locked' : 'spinning',
  );
  const perfect = wins === 82 && losses === 0;

  useEffect(() => {
    if (reduceMotion) {
      setDisplayWins(wins);
      setDisplayLosses(losses);
      setPhase('locked');
      return;
    }

    let frame = 0;
    const spinMs = 2200;
    const landMs = 480;
    const started = performance.now();
    let raf = 0;
    let landTimer: number | null = null;

    const tick = (now: number) => {
      const elapsed = now - started;
      frame += 1;

      if (elapsed < spinMs) {
        // Blazing-fast slot scramble — every frame picks fresh digits.
        const w = Math.floor(Math.random() * 83);
        setDisplayWins(w);
        setDisplayLosses(82 - w);
        // Occasional perfect tease while spinning.
        if (frame % 17 === 0) {
          setDisplayWins(82);
          setDisplayLosses(0);
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      setPhase('landing');
      // Ease onto the true record with a few decelerating flips.
      let step = 0;
      const landSteps = 8;
      const landTick = () => {
        step += 1;
        if (step >= landSteps) {
          setDisplayWins(wins);
          setDisplayLosses(losses);
          setPhase('locked');
          return;
        }
        const mix = step / landSteps;
        const w = Math.round(wins + (Math.random() - 0.5) * (1 - mix) * 18);
        const clamped = Math.max(0, Math.min(82, w));
        setDisplayWins(clamped);
        setDisplayLosses(82 - clamped);
        landTimer = window.setTimeout(landTick, 28 + step * 36);
      };
      landTick();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (landTimer !== null) window.clearTimeout(landTimer);
    };
  }, [wins, losses, reduceMotion]);

  return (
    <div
      className={`billion-result__spin${phase === 'spinning' ? ' is-spinning' : ''}${
        phase === 'locked' ? ' is-locked' : ''
      }${perfect && phase === 'locked' ? ' is-perfect' : ''}`}
      aria-label={
        phase === 'locked'
          ? `Season projection ${wins} wins and ${losses} losses`
          : 'Generating 82-game season projection'
      }
      aria-live={phase === 'locked' ? 'polite' : 'off'}
    >
      <p className="billion-result__spin-label">
        {phase === 'locked' ? '82-game projection' : 'Generating season…'}
      </p>
      <div className="billion-result__spin-board">
        <span className="billion-result__spin-digit billion-result__spin-digit--wins">
          {displayWins}
        </span>
        <span className="billion-result__spin-dash" aria-hidden>
          –
        </span>
        <span className="billion-result__spin-digit billion-result__spin-digit--losses">
          {displayLosses}
        </span>
      </div>
      {phase === 'locked' ? (
        <p className="billion-result__spin-footer">
          {perfect ? 'Perfect season' : `${Math.round((wins / 82) * 1000) / 10}% win rate`}
        </p>
      ) : (
        <p className="billion-result__spin-footer billion-result__spin-footer--live">
          Live generator
        </p>
      )}
    </div>
  );
}

export function BillionResultScreen({
  kind,
  teamValue,
  roster,
  seasonRecord,
  personalBest,
  isNewPersonalBest,
  worldRank,
  onExit,
}: BillionResultScreenProps) {
  const reduceMotion = getPrefersReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const [sharing, setSharing] = useState(false);
  const isWin = kind === 'won';
  const shortfall = Math.max(0, BILLION_GOAL - teamValue);
  const topFive = worldRank > 0 && worldRank <= 5;
  const topHundred = worldRank > 0 && worldRank <= 100;

  const handleShareX = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    const text = buildShareText(kind, teamValue, seasonRecord, worldRank);
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

    try {
      const node = cardRef.current;
      const blob = node ? await renderSharePng(node) : null;
      if (blob) {
        const file = new File([blob], 'trade-up-billion.png', { type: 'image/png' });
        if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            text,
            title: 'Ballion',
          });
          setSharing(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trade-up-billion.png';
        a.click();
        URL.revokeObjectURL(url);
      }
      window.open(intent, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(intent, '_blank', 'noopener,noreferrer');
    } finally {
      setSharing(false);
    }
  }, [kind, seasonRecord, sharing, teamValue, worldRank]);

  return (
    <motion.main
      className={`billion-result billion-result--${kind}`}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.section
        ref={cardRef}
        className="billion-result__card"
        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="billion-result__glow" aria-hidden />

        <div className="billion-result__topbar">
          <BallionWordmark />
          {isNewPersonalBest ? (
            <span className="billion-result__pb-banner">New Personal Best</span>
          ) : null}
        </div>

        {worldRank > 0 ? (
          <motion.div
            className={`billion-result__world${topFive ? ' is-elite' : ''}${
              topHundred && !topFive ? ' is-hot' : ''
            }`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08, duration: 0.45 }}
            aria-label={`World rank ${worldRank}`}
          >
            <p className="billion-result__world-eyebrow">World rank</p>
            <p className="billion-result__world-rank">{formatWorldRank(worldRank)}</p>
            <p className="billion-result__world-sub">
              of {WORLD_POOL_SIZE.toLocaleString('en-US')} GMs
              {topFive
                ? ' · Featured board'
                : topHundred
                  ? ' · Top 100'
                  : ''}
            </p>
          </motion.div>
        ) : null}

        <p className="billion-result__eyebrow">
          {isWin ? 'Dynasty locked' : 'Season projected'}
        </p>
        <h2 className="billion-result__title">
          {isWin ? 'Billion Dollar Dynasty' : 'Short of a Billion'}
        </h2>

        {/* Team value — big, right above the generator */}
        <motion.div
          className="billion-result__value-block"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <span className="billion-result__value-label">Team value</span>
          <strong className="billion-result__value">{formatDollarsExact(teamValue)}</strong>
          {isWin ? (
            <p className="billion-result__surplus">
              Cleared {formatDollars(BILLION_GOAL)}
              {teamValue > BILLION_GOAL
                ? ` · +${formatDollars(teamValue - BILLION_GOAL)} over`
                : ''}
            </p>
          ) : (
            <p className="billion-result__shortfall">
              {formatDollars(shortfall)} shy of {formatDollars(BILLION_GOAL)}
            </p>
          )}
        </motion.div>

        {/* Focal point: live 82-game record spin */}
        {seasonRecord ? (
          <RecordSpinGenerator
            wins={seasonRecord.wins}
            losses={seasonRecord.losses}
            reduceMotion={reduceMotion}
          />
        ) : (
          <div className="billion-result__spin billion-result__spin--empty">
            <p className="billion-result__spin-label">82-game projection</p>
            <div className="billion-result__spin-board">
              <span className="billion-result__spin-digit">—</span>
              <span className="billion-result__spin-dash">–</span>
              <span className="billion-result__spin-digit">—</span>
            </div>
          </div>
        )}

        <div className="billion-result__pb-row">
          <span>Personal best</span>
          <strong>{formatDollarsExact(Math.max(personalBest, teamValue))}</strong>
        </div>

        <div className="billion-result__generator" aria-label="Starting five">
          <p className="billion-result__generator-label">Your five</p>
          <ul className="billion-result__roster">
            {LINEUP_POSITIONS.map((pos, index) => (
              <li key={pos}>
                <span>{pos}</span>
                <strong>{roster[index]?.name ?? '—'}</strong>
                <em>{roster[index] ? formatDollars(roster[index]!.dollarValue) : ''}</em>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      <motion.div
        className="billion-result__actions"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <button
          type="button"
          className="tu-btn tu-btn--primary billion-result__share"
          onClick={handleShareX}
          disabled={sharing}
        >
          {sharing ? 'Preparing…' : 'Share to X'}
        </button>
        <button type="button" className="tu-btn tu-btn--secondary" onClick={onExit}>
          Home
        </button>
      </motion.div>
    </motion.main>
  );
}
