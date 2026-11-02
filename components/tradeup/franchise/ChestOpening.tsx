'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { FOpen, FOpenCard } from '@/lib/account/franchiseV5Cloud';
import { hapticLight, hapticTap } from '@/lib/tradeup/haptics';
import { CHEST_NAME, FC, SLOT_NAME, TIER_COLOR, TIER_NAME, tx } from '@/lib/tradeup/franchise/copy';
import { fmtCash, fmtFans } from '@/lib/tradeup/franchise/format';
import type { CardTier } from '@/lib/tradeup/franchise/config';
import { playerView } from '@/lib/tradeup/franchise/players';
import { ArenaBackdrop, MysteryJersey, TeamJersey } from './ArenaParts';
import { ChestBase, ChestDefs, ChestLid, ChestMouth, chestGlowStyle, useChestIds } from './Chest';

type Phase = 'idle' | 'shake' | 'open' | 'prep' | 'rise' | 'mystery' | 'flip' | 'reveal' | 'exit';

/** ms after the tap for the first player. */
const FIRST: [Phase, number][] = [
  ['shake', 0],
  ['open', 420],
  ['rise', 1450],
  ['mystery', 2200],
  ['flip', 2650],
  ['reveal', 2840],
];
/** Rare pulls hold the mystery jersey a little longer; common ones stay quick. */
const SUSPENSE: Record<CardTier, number> = { pro: 0, all_star: 0, superstar: 150, legend: 450, goat: 800 };

function withSuspense(steps: [Phase, number][], tier: CardTier): [Phase, number][] {
  const extra = SUSPENSE[tier];
  return steps.map(([p, at]) => [p, p === 'flip' || p === 'reveal' ? at + extra : at]);
}

/** ms after "next" for each following Starter Chest player. */
const NEXT: [Phase, number][] = [
  ['exit', 0],
  ['prep', 260],
  ['rise', 700],
  ['mystery', 1400],
  ['flip', 1750],
  ['reveal', 1940],
];

function TapHand() {
  return (
    <svg className="pk-tap__hand" viewBox="0 0 24 24" width="44" height="44" aria-hidden>
      <path
        d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ChestOpening({
  open,
  locale,
  copiesOf,
  salePriceOf,
  onDone,
  onAdd,
  onKeep,
}: {
  open: FOpen;
  locale: string;
  /** How many cards of this exact player version the account owns (including this pull). */
  copiesOf: (playerId: string) => number;
  salePriceOf: (tier: CardTier) => number;
  /** Starter Chest finished (all five seen). */
  onDone: () => void;
  onAdd: (card: FOpenCard) => void;
  onKeep: () => void;
}) {
  const id = useChestIds();
  const starter = open.chestId === 'starter';
  const [phase, setPhase] = useState<Phase>('idle');
  const [index, setIndex] = useState(0);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const run = useCallback((steps: [Phase, number][], before?: () => void) => {
    clear();
    for (const [next, at] of steps) {
      timers.current.push(
        window.setTimeout(() => {
          if (next === 'prep') before?.();
          setPhase(next);
          if (next === 'reveal') {
            hapticTap();
            busy.current = false;
          }
        }, at),
      );
    }
  }, []);

  const tap = () => {
    if (phase !== 'idle' || busy.current) return;
    busy.current = true;
    hapticLight();
    run(withSuspense(FIRST, open.cards[0]!.tier));
  };

  const next = () => {
    if (busy.current || phase !== 'reveal') return;
    if (index >= open.cards.length - 1) {
      busy.current = true;
      onDone();
      return;
    }
    busy.current = true;
    hapticLight();
    run(withSuspense(NEXT, open.cards[index + 1]!.tier), () => setIndex((i) => i + 1));
  };

  const once = (fn: () => void) => () => {
    if (busy.current) return;
    busy.current = true;
    fn();
  };

  const card = open.cards[index];
  if (!card) return null;
  const view = playerView(card.playerId);
  const revealed = phase === 'reveal' || phase === 'exit';
  const last = index >= open.cards.length - 1;

  return (
    <div
      className={`pk fx-open pk--${phase}${starter ? ' fx-open--starter' : ''} fx-open--${card.tier}`}
      style={chestGlowStyle(open.chestId)}
      role="dialog"
      aria-modal="true"
      aria-label={`${tx(CHEST_NAME[open.chestId], locale)} ${tx(FC.chest, locale)}`}
    >
      <ChestDefs id={id} chest={open.chestId} />
      <ArenaBackdrop />

      <div className="fx-open__top">
        <span className="fx-open__chip">
          {tx(CHEST_NAME[open.chestId], locale)} {tx(FC.chest, locale)}
        </span>
        {starter ? (
          <span className="fx-open__dots" aria-label={`${index + 1} / ${open.cards.length}`}>
            {open.cards.map((c, i) => (
              <i key={c.cardId} className={i < index || (i === index && revealed) ? 'is-done' : i === index ? 'is-now' : ''} />
            ))}
          </span>
        ) : null}
      </div>

      <div className="pk-scene">
        <div className="pk-halo" aria-hidden />
        <span className="fx-burst" aria-hidden />
        <span className="fx-reveal-rays" aria-hidden />

        <div className="pk-chest" aria-hidden>
          <span className="pk-chest__ring" />
          <span className="pk-chest__pulse" />
          <div className="pk-chest__body">
            <span className="pk-rays pk-rays--gold" />
            <span className="pk-rays pk-rays--blue" />
            <ChestMouth id={id} />
            <ChestLid id={id} chest={open.chestId} />
          </div>
        </div>

        <div className="pk-jersey" key={index} aria-hidden={!revealed}>
          <span className="pk-flash" />
          {starter && card.slot ? <span className="fx-open__slot">{tx(SLOT_NAME[card.slot], locale)}</span> : null}
          <div className="pk-jersey__flip">
            {revealed ? <TeamJersey key="team" playerId={card.playerId} className="pk-shirt pk-shirt--team" /> : <MysteryJersey key="mystery" className="pk-shirt pk-shirt--mystery" />}
          </div>
        </div>

        <div className="pk-chest pk-chest--front" aria-hidden>
          <div className="pk-chest__body">
            <ChestBase id={id} chest={open.chestId} />
          </div>
        </div>

        <button type="button" className="pk-tap" onClick={tap} disabled={phase !== 'idle'} aria-label={tx(FC.tapToOpen, locale)}>
          <span className="pk-tap__label">{tx(FC.tapToOpen, locale)}</span>
          <span className="pk-tap__icon">
            <span className="pk-tap__ripple" />
            <TapHand />
          </span>
        </button>

        <div className="pk-info" aria-live="polite">
          {revealed ? (
            <>
              <div className="fx-info__plate">
                <span className="fx-info__ring" aria-hidden />
                <h2 className="pk-info__name">{view.name}</h2>
                <p className="pk-info__team">{view.teamName}</p>
              </div>
              <p className="fx-info__meta">
                <span className="fx-tier fx-tier--lg" style={{ '--tier': TIER_COLOR[card.tier] } as CSSProperties}>
                  {tx(TIER_NAME[card.tier], locale)}
                </span>
                <span className="fx-info__fans">
                  <strong>{fmtFans(card.fans)}</strong> {tx(FC.fansUnit, locale)}
                </span>
                <span className="fx-info__era">{view.era}</span>
              </p>
              {copiesOf(card.playerId) > 1 && salePriceOf(card.tier) > 0 ? (
                <p className="fx-info__dup">{tx(FC.duplicate, locale, { amount: fmtCash(salePriceOf(card.tier)) })}</p>
              ) : null}
              {starter ? (
                <button type="button" className="fx-btn fx-btn--primary fx-info__btn" onClick={next}>
                  {last ? tx(FC.goHome, locale) : `${tx(FC.next, locale)}  ${index + 2}/${open.cards.length}`}
                </button>
              ) : (
                <div className="fx-info__actions">
                  <button type="button" className="fx-btn fx-btn--primary" onClick={once(() => onAdd(card))}>
                    {tx(FC.addToLineup, locale)}
                  </button>
                  <button type="button" className="fx-btn fx-btn--ghost" onClick={once(onKeep)}>
                    {tx(FC.keep, locale)}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
