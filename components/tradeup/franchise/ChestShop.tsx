'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { FChest, FFailure, FState } from '@/lib/account/franchiseV5Cloud';
import { SHOP_CHESTS, type ChestId } from '@/lib/tradeup/franchise/config';
import { CHEST_NAME, FC, TIER_COLOR, TIER_NAME, tx } from '@/lib/tradeup/franchise/copy';
import { fmtCash } from '@/lib/tradeup/franchise/format';
import { hapticLight } from '@/lib/tradeup/haptics';
import { ArenaBackdrop } from './ArenaParts';
import { ChestArt, ChestLabel, chestGlowStyle } from './Chest';
import { BackButton, BankChip } from './FranchiseChrome';

const ARM_MS = 250;

function guaranteeText(chest: FChest, locale: string): string {
  return chest.id === 'goat' ? tx(FC.highLegend, locale) : tx(FC.orBetter, locale, { tier: tx(TIER_NAME[chest.guarantee], locale) });
}

function ChestSheet({
  chest,
  state,
  locale,
  onClose,
  onBuy,
  onPlayClassic,
}: {
  chest: FChest;
  state: FState;
  locale: string;
  onClose: () => void;
  onBuy: (chest: ChestId) => Promise<FFailure | null>;
  onPlayClassic: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(performance.now());
  const short = Math.max(0, chest.price - state.bank);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const buy = async () => {
    if (busy || short > 0 || performance.now() - openedAt.current < ARM_MS) return;
    hapticLight();
    setBusy(true);
    setError(null);
    const failure = await onBuy(chest.id);
    if (failure) {
      setBusy(false);
      setError(failure === 'offline' ? tx(FC.offline, locale) : failure === 'insufficient' ? tx(FC.needMore, locale, { amount: fmtCash(short || 1) }) : tx(FC.errorGeneric, locale));
    }
  };

  return (
    <div className="fx-sheet-wrap" role="dialog" aria-modal="true" aria-label={`${tx(CHEST_NAME[chest.id], locale)} ${tx(FC.chest, locale)}`}>
      <button type="button" className="fx-scrim" aria-label={tx(FC.close, locale)} onClick={() => !busy && onClose()} />
      <div className="fx-sheet fx-chest-sheet" style={chestGlowStyle(chest.id)}>
        <div className="fx-chest-sheet__hero">
          <ChestArt chest={chest.id} className="fx-chest-sheet__art" />
          <div className="fx-chest-sheet__title">
            <ChestLabel chest={chest.id} name={tx(CHEST_NAME[chest.id], locale)} sub={tx(FC.chest, locale)} />
            <p>
              {guaranteeText(chest, locale)} · {tx(FC.onePlayer, locale)}
            </p>
          </div>
        </div>
        <ul className="fx-odds" aria-label={tx(FC.odds, locale)}>
          {chest.odds.map((o) => (
            <li key={`${o.tier}${o.minScoreBp}`} style={{ '--tier': TIER_COLOR[o.tier] } as CSSProperties}>
              <span>
                <i aria-hidden />
                {tx(TIER_NAME[o.tier], locale)}
                {o.minScoreBp > 0 ? ' +' : ''}
              </span>
              <span className="fx-odds__bar" aria-hidden>
                <b style={{ width: `${o.bps / 100}%` }} />
              </span>
              <strong>{(o.bps / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%</strong>
            </li>
          ))}
        </ul>
        <dl className="fx-ledger">
          <div>
            <dt>{tx(FC.chestPrice, locale)}</dt>
            <dd>{fmtCash(chest.price)}</dd>
          </div>
          <div>
            <dt>{tx(FC.yourBank, locale)}</dt>
            <dd className={short > 0 ? 'is-short' : 'is-ok'}>{fmtCash(state.bank)}</dd>
          </div>
        </dl>
        {short > 0 ? (
          <>
            <p className="fx-note is-short">{tx(FC.needMore, locale, { amount: fmtCash(short) })}</p>
            <button type="button" className="fx-btn fx-btn--ghost" onClick={onPlayClassic}>
              {tx(FC.playClassic, locale)}
            </button>
          </>
        ) : (
          <button type="button" className="fx-btn fx-btn--primary" disabled={busy} onClick={() => void buy()}>
            {busy ? tx(FC.opening, locale) : `${tx(FC.buyOpen, locale)} · ${fmtCash(chest.price)}`}
          </button>
        )}
        {error ? <p className="fx-note is-short">{error}</p> : null}
        <button type="button" className="fx-link" onClick={() => !busy && onClose()}>
          {tx(FC.back, locale)}
        </button>
      </div>
    </div>
  );
}

export function ChestShop({
  state,
  locale,
  onBack,
  onBuy,
  onPlayClassic,
}: {
  state: FState;
  locale: string;
  onBack: () => void;
  onBuy: (chest: ChestId) => Promise<FFailure | null>;
  onPlayClassic: () => void;
}) {
  const [open, setOpen] = useState<ChestId | null>(null);
  const chest = state.chests.find((c) => c.id === open) ?? null;
  return (
    <div className="fx-screen fx-shop">
      <ArenaBackdrop banners={false} />
      <header className="fx-topbar">
        <BackButton label={tx(FC.back, locale)} onClick={onBack} />
        <BankChip amount={state.bank} />
      </header>
      <div className="fx-scroll fx-shop__scroll">
        <div className="fx-heading">
          <h1 className="fx-title">{tx(FC.shopTitle, locale)}</h1>
          <p className="fx-sub">{tx(FC.shopSub, locale)}</p>
        </div>
        <ul className="fx-shop__list">
          {SHOP_CHESTS.map((id, rank) => {
            const c = state.chests.find((x) => x.id === id);
            if (!c) return null;
            const afford = state.bank >= c.price;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`fx-chest-row${afford ? '' : ' is-locked'}`}
                  style={{ ...chestGlowStyle(id), '--rank': rank } as CSSProperties}
                  onClick={() => {
                    hapticLight();
                    setOpen(id);
                  }}
                >
                  <ChestArt chest={id} className="fx-chest-row__art" />
                  <span className="fx-chest-row__copy">
                    <strong>
                      {tx(CHEST_NAME[id], locale)} {tx(FC.chest, locale)}
                    </strong>
                    <em>{guaranteeText(c, locale)}</em>
                  </span>
                  <span className="fx-chest-row__price">
                    <strong>{fmtCash(c.price)}</strong>
                    <em>{tx(FC.openChest, locale)} ›</em>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {chest ? (
        <ChestSheet chest={chest} state={state} locale={locale} onClose={() => setOpen(null)} onBuy={onBuy} onPlayClassic={onPlayClassic} />
      ) : null}
    </div>
  );
}
