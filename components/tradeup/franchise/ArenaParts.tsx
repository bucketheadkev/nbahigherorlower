'use client';

import { memo, type CSSProperties } from 'react';
import { playerView } from '@/lib/tradeup/franchise/players';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { JerseyShape } from '../draft/CourtJersey';
import { ChestDefs, ChestEmblem, useChestIds } from './Chest';

/** Dark navy arena: crowd, rafters lights, polished floor, two hanging 1B RUN banners. */
export const ArenaBackdrop = memo(function ArenaBackdrop({ banners = true }: { banners?: boolean }) {
  const id = useChestIds();
  return (
    <div className="fx-arena" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fx-arena__photo" src="/images/pack/arena-bg.jpg" alt="" decoding="async" />
      <span className="fx-arena__beam" />
      <span className="fx-arena__vignette" />
      {banners ? (
        <>
          <ChestDefs id={id} chest="starter" />
          {(['left', 'right'] as const).map((side) => (
            <div key={side} className={`fx-banner fx-banner--${side}`}>
              <span className="fx-banner__rod" />
              <div className="fx-banner__cloth">
                <svg viewBox="-30 -42 60 92" className="fx-banner__emblem">
                  <ChestEmblem id={id} />
                </svg>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
});

/**
 * Classic Run's flat tank top with the player's initials. By default it wears the colors of the
 * NBA team he was pulled from; `wearTeam` dresses him in another team's primary and alternate
 * (the owned franchise, on the starting five only).
 */
export const TeamJersey = memo(function TeamJersey({
  playerId,
  wearTeam,
  className = '',
}: {
  playerId: string;
  wearTeam?: string;
  className?: string;
}) {
  const v = playerView(playerId);
  const colors = wearTeam ? getTeamColors(wearTeam) : null;
  const style = {
    '--slot-primary': colors?.primary ?? v.primary,
    '--slot-accent': colors?.accent ?? v.accent,
    '--slot-ink': colors ? contrastOnPrimary(colors.primary) : v.ink,
  } as CSSProperties;
  return (
    <span className={`jersey is-filled fx-jersey ${className}`} style={style} aria-hidden>
      <JerseyShape />
      <span className="jersey__text jersey__text--initials fx-jersey__initials">{v.initials}</span>
    </span>
  );
});

/** Dark mystery jersey (same shape) with a white question mark. */
export function MysteryJersey({ className = '' }: { className?: string }) {
  return (
    <span className={`jersey fx-jersey fx-jersey--mystery ${className}`} aria-hidden>
      <JerseyShape />
      <span className="fx-jersey__mark">?</span>
    </span>
  );
}
