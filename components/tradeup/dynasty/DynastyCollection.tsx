'use client';

import type { CSSProperties } from 'react';
import type { DynastyState } from '@/lib/account/dynastyCloud';
import { collectionById, DYNASTY_COLLECTIONS } from '@/lib/tradeup/dynasty/catalog';
import { CHEST_TIER_COLOR, CHEST_TIER_NAME } from '@/lib/tradeup/dynasty/chests';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { DynastyJersey } from './DynastyJersey';

/** Every collected player, newest first: who, which title team, and how he was acquired. */
export function DynastyCollection({ state, locale }: { state: DynastyState; locale: string }) {
  const rows = [...state.owned]
    .filter((o) => collectionById(o.collectionId))
    .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));
  const total = DYNASTY_COLLECTIONS.filter((c) => c.kind === 'championship').reduce((n, c) => n + c.slots.length, 0);
  const lang = locale === 'es' ? 'es' : 'en';

  if (rows.length === 0) {
    return (
      <section className="dyn-panel">
        <strong>{dc('collectionEmpty', locale)}</strong>
        <p>{dc('collectionEmptyLine', locale)}</p>
      </section>
    );
  }

  return (
    <div className="dyn-collection">
      <p className="dyn-collection__summary">
        {dc('signed', locale, { n: rows.length, total })}
        <span aria-hidden> · </span>
        {dc('dynasties', locale, { n: state.completed.length, total: DYNASTY_COLLECTIONS.filter((c) => c.kind === 'championship').length })}
      </p>
      <ul className="dyn-collection__list">
        {rows.map((o) => {
          const col = collectionById(o.collectionId)!;
          const slot = col.slots.find((s) => s.playerId === o.playerId);
          if (!slot) return null;
          const how =
            o.source === 'classic_run'
              ? dc('viaRun', locale)
              : o.source === 'chest'
                ? dc('viaChest', locale, { tier: o.chestTier ? CHEST_TIER_NAME[o.chestTier][lang] : '' }).replace('  ', ' ')
                : dc('viaGrant', locale);
          return (
            <li
              key={`${o.collectionId}:${o.playerId}`}
              className="dyn-collection__row"
              style={{ '--dyn-primary': col.colors.primary, '--tier': o.chestTier ? CHEST_TIER_COLOR[o.chestTier] : '#4d9bff' } as CSSProperties}
            >
              <DynastyJersey name={slot.name} colors={col.colors} look="owned" className="dyn-collection__jersey" />
              <span className="dyn-collection__copy">
                <strong>{slot.name}</strong>
                <em>
                  {col.season} {col.team} · {slot.position}
                </em>
              </span>
              <span className={`dyn-collection__how dyn-collection__how--${o.source}`}>{how}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
