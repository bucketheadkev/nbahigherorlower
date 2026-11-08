'use client';

import { useEffect, useState } from 'react';
import { buyKeys, loadKeyProducts, type KeyProduct } from '@/lib/purchases/keyPurchases';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { hapticLight, hapticTap } from '@/lib/tradeup/haptics';
import { KeyIcon } from './KeyIcon';

/**
 * Keys only: they open chests already earned in Classic, sooner. Rendered only when the shop is
 * configured (see lib/purchases/keyPurchases.ts), so nothing here can be a dead button.
 */
export function KeyShop({
  accountId,
  keys,
  locale,
  onBought,
  onClose,
}: {
  accountId: string;
  keys: number;
  locale: string;
  onBought: () => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<KeyProduct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadKeyProducts().then((p) => {
      if (live) setProducts(p);
    });
    return () => {
      live = false;
    };
  }, []);

  const buy = async (p: KeyProduct) => {
    if (busy) return;
    hapticLight();
    setBusy(p.productId);
    setNote(null);
    const res = await buyKeys(p.productId, accountId);
    setBusy(null);
    if (res.ok) {
      hapticTap();
      setNote(dc('keysAdded', locale, { n: p.keys }));
      onBought();
      return;
    }
    if (res.reason === 'cancelled') return;
    setNote(res.reason === 'pending' ? dc('purchasePending', locale) : dc('purchaseFailed', locale));
  };

  return (
    <div className="dyn-sheet" role="dialog" aria-modal="true" aria-label={dc('keyShop', locale)}>
      <button type="button" className="dyn-sheet__scrim" aria-label={dc('close', locale)} onClick={onClose} />
      <section className="dyn-sheet__panel">
        <span className="dyn-sheet__grip" aria-hidden />
        <header className="dyn-sheet__head">
          <div>
            <span className="dyn-offer__kicker">{dc('keyShop', locale)}</span>
            <strong className="dyn-sheet__title">
              <KeyIcon /> {dc('keysBalance', locale, { n: Math.max(0, keys) })}
            </strong>
            <p className="dyn-sheet__line">{dc('keyShopLine', locale)}</p>
          </div>
          <button type="button" className="dyn-sheet__close" aria-label={dc('close', locale)} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {products == null ? (
          <p className="dyn-offer__note">{dc('loading', locale)}</p>
        ) : products.length === 0 ? (
          <p className="dyn-offer__note">{dc('keyShopUnavailable', locale)}</p>
        ) : (
          <ul className="dyn-shop">
            {products.map((p) => (
              <li key={p.productId}>
                <button type="button" className="dyn-shop__item" disabled={busy != null} onClick={() => void buy(p)}>
                  <span className="dyn-shop__keys">
                    <KeyIcon /> {dc(p.keys === 1 ? 'oneKey' : 'manyKeys', locale, { n: p.keys })}
                  </span>
                  <span className="dyn-shop__price">{busy === p.productId ? '…' : p.displayPrice}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {note ? (
          <p className="dyn-offer__note" role="status">
            {note}
          </p>
        ) : null}
        <p className="dyn-chests__fine">{dc('keyShopFine', locale)}</p>
      </section>
    </div>
  );
}
