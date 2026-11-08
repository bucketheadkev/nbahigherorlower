'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ChestReveal, DynastyFailure, DynastyResult, DynastyState } from '@/lib/account/dynastyCloud';
import { PACK_RISER_PEAK_MS, playPackSound, preloadPackSounds, stopPackSounds } from '@/lib/tradeup/gameAudio';
import { hapticLight, hapticTap } from '@/lib/tradeup/haptics';
import { collectionById, DYNASTY_SLOT_COUNT } from '@/lib/tradeup/dynasty/catalog';
import { CHEST_TIER_COLOR, CHEST_TIER_NAME, chestArtId, type ChestTier } from '@/lib/tradeup/dynasty/chests';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { ArenaBackdrop, MysteryJersey } from '../franchise/ArenaParts';
import { ChestBase, ChestDefs, ChestLid, ChestMouth, chestGlowStyle, useChestIds } from '../franchise/Chest';
import { DynastyJersey } from './DynastyJersey';

type Phase = 'idle' | 'shake' | 'open' | 'rise' | 'mystery' | 'flip' | 'reveal';

/** ms after the tap. The reveal waits for the server if it hasn't answered by then. */
const STEPS: [Phase, number][] = [
  ['shake', 0],
  ['open', 420],
  ['rise', 1450],
  ['mystery', 2200],
  ['flip', 2650],
  ['reveal', 2840],
];
/** Rarer chests hold the mystery jersey a little longer. */
const SUSPENSE: Record<ChestTier, number> = { pro: 0, all_star: 0, superstar: 150, legend: 400, goat: 700 };

interface Props {
  chestId: string;
  tier: ChestTier;
  locale: string;
  dupProtectionAfter: number;
  open: (chestId: string) => Promise<DynastyResult<{ state: DynastyState; reveal: ChestReveal }>>;
  onClose: () => void;
}

/**
 * Opening one earned chest: tap, the lid lifts, a mystery jersey rises and flips into the player.
 * The server rolls and saves the player the moment the chest is tapped; the animation only shows it.
 */
export function DynastyChestOpening(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<Stage {...props} />, document.body);
}

function Stage({ chestId, tier, locale, dupProtectionAfter, open, onClose }: Props) {
  const id = useChestIds();
  const art = chestArtId(tier);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reveal, setReveal] = useState<ChestReveal | null>(null);
  const [failure, setFailure] = useState<DynastyFailure | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const timers = useRef<number[]>([]);
  const started = useRef(false);
  const result = useRef<Promise<DynastyResult<{ state: DynastyState; reveal: ChestReveal }>> | null>(null);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  useEffect(() => {
    preloadPackSounds();
    playPackSound('pack_appear');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'idle' || phase === 'reveal' || failure)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      timers.current.forEach((t) => window.clearTimeout(t));
      stopPackSounds();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = () => {
    if (started.current) return;
    started.current = true;
    hapticLight();
    playPackSound('pack_tap');
    result.current = open(chestId);
    const extra = SUSPENSE[tier];
    const flipAt = 2650 + extra;
    later(() => playPackSound('pack_riser'), Math.max(0, flipAt - PACK_RISER_PEAK_MS));
    for (const [next, at] of STEPS) {
      if (next === 'flip' || next === 'reveal') continue;
      later(() => setPhase(next), at);
    }
    // Hold on the mystery jersey until the server's answer is in, then flip.
    const minFlip = new Promise((resolve) => later(() => resolve(null), flipAt));
    void Promise.all([result.current, minFlip]).then(([res]) => {
      if (!res.ok) {
        stopPackSounds();
        setFailure(res.reason);
        return;
      }
      setPhase('flip');
      playPackSound('pack_whoosh');
      later(() => {
        setReveal(res.data.reveal);
        setPhase('reveal');
        hapticTap();
        if (tier === 'goat' || tier === 'legend') playPackSound('pack_goat');
      }, 190);
    });
  };

  const collection = reveal ? collectionById(reveal.collectionId) : undefined;
  const slot = collection?.slots.find((s) => s.playerId === reveal?.playerId);
  const tierName = CHEST_TIER_NAME[tier][locale === 'es' ? 'es' : 'en'];

  return (
    <div className="fx-root dyn-open-root">
      <div
        className={`pk fx-open pk--${phase} fx-open--${art} dyn-open dyn-open--${tier}`}
        style={{ ...chestGlowStyle(art), '--tier': CHEST_TIER_COLOR[tier] } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={dc('chestName', locale, { tier: tierName })}
      >
        <ChestDefs id={id} chest={art} />
        <ArenaBackdrop banners={false} />

        <div className="fx-open__top">
          <span className="fx-open__chip">{dc('chestName', locale, { tier: tierName }).toUpperCase()}</span>
        </div>
        {phase === 'idle' || failure ? (
          <button type="button" className="dyn-open__close" aria-label={dc('close', locale)} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

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
              <ChestLid id={id} chest={art} />
            </div>
          </div>

          <div className="pk-jersey" aria-hidden={phase !== 'reveal'}>
            <span className="pk-flash" />
            <div className="pk-jersey__flip">
              {reveal && collection && slot && phase === 'reveal' ? (
                <DynastyJersey name={slot.name} colors={collection.colors} look="owned" className="pk-shirt pk-shirt--team" />
              ) : (
                <MysteryJersey className="pk-shirt pk-shirt--mystery" />
              )}
            </div>
          </div>

          <div className="pk-chest pk-chest--front" aria-hidden>
            <div className="pk-chest__body">
              <ChestBase id={id} chest={art} />
            </div>
          </div>

          <button type="button" className="pk-tap" onClick={tap} disabled={phase !== 'idle'} aria-label={dc('tapToOpen', locale)}>
            <span className="pk-tap__label">{dc('tapToOpen', locale)}</span>
            <span className="pk-tap__icon">
              <span className="pk-tap__ripple" />
              <svg className="pk-tap__hand" viewBox="0 0 24 24" width="44" height="44" aria-hidden>
                <path
                  d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </button>

          <div className="pk-info" aria-live="polite">
            {failure ? (
              <div className="dyn-open__error" role="alert">
                <p>{failure === 'chest_locked' ? dc('chestStillLocked', locale) : dc('openFailed', locale)}</p>
                <button type="button" className="dyn-btn dyn-btn--ghost" onClick={onClose}>
                  {dc('close', locale)}
                </button>
              </div>
            ) : reveal && collection && slot && phase === 'reveal' ? (
              <>
                <div className="fx-info__plate">
                  <span className="fx-info__ring" aria-hidden />
                  <h2 className="pk-info__name">{slot.name}</h2>
                  <p className="pk-info__team">
                    {collection.season} {collection.team}
                  </p>
                </div>
                <p className="dyn-open__tags">
                  {reveal.isNew ? (
                    <span className="dyn-tag dyn-tag--new">{dc('newPlayer', locale)}</span>
                  ) : (
                    <span className="dyn-tag dyn-tag--dup">{dc('alreadyCollected', locale)}</span>
                  )}
                  {reveal.focus ? <span className="dyn-tag dyn-tag--focus">{dc('focusTag', locale)}</span> : null}
                </p>
                {!reveal.isNew ? (
                  <p className="dyn-open__note">
                    {reveal.allOwned
                      ? dc('allCollected', locale)
                      : reveal.dupStreak >= dupProtectionAfter
                        ? dc('protectionReady', locale)
                        : dc('protectionProgress', locale, { n: reveal.dupStreak, total: dupProtectionAfter })}
                  </p>
                ) : reveal.protected ? (
                  <p className="dyn-open__note">{dc('protectionUsed', locale)}</p>
                ) : null}
                <div className="fx-info__actions dyn-open__actions">
                  {reveal.completedNow ? (
                    <button
                      type="button"
                      className="dyn-btn dyn-btn--primary"
                      onClick={() => {
                        hapticLight();
                        setShowComplete(true);
                      }}
                    >
                      {dc('seeDynasty', locale)}
                    </button>
                  ) : (
                    <button type="button" className="dyn-btn dyn-btn--primary" onClick={onClose}>
                      {dc('continue', locale)}
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {showComplete && collection ? (
          <div className="dyn-complete" style={{ '--dyn-primary': collection.colors.primary, '--dyn-accent': collection.colors.accent } as CSSProperties}>
            <div className="dyn-complete__card">
              <span className="dyn-complete__kicker">{dc('complete', locale)}</span>
              <h2 className="dyn-complete__title">
                {collection.season} {collection.team}
              </h2>
              <ul className="dyn-complete__five">
                {collection.slots.slice(0, DYNASTY_SLOT_COUNT).map((s, i) => (
                  <li key={s.playerId} style={{ '--i': i } as CSSProperties}>
                    <DynastyJersey name={s.name} colors={collection.colors} look="owned" className="dyn-complete__jersey" />
                    <span>{s.name.split(' ').slice(-1)[0]}</span>
                  </li>
                ))}
              </ul>
              <p className="dyn-complete__line">{dc('completeForever', locale)}</p>
              <button type="button" className="dyn-btn dyn-btn--primary" onClick={onClose}>
                {dc('continue', locale)}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
