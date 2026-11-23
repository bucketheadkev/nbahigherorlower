'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { useXpProfile } from '@/hooks/useXpProfile';
import {
  COIN_PACKS,
  PREMIUM_PRODUCT,
  WATCH_AD_COINS,
  buyProduct,
  getShopEntitlements,
  restorePurchases,
  shopConfigured,
  syncPendingPurchases,
  type ShopCatalogProduct,
} from '@/lib/purchases';
import { PERK_DEFS, type PerkId } from '@/lib/tradeup/perks';
import {
  PERK_BUNDLE_PRICE,
  PERK_BUNDLE_QTY,
  PERK_PACK_PRICE,
  PERK_PACK_QTY,
  addPerkCharges,
  buyPerkPack,
  buyUltimatePerkBundle,
  getPerkInventory,
  type PerkInventory,
} from '@/lib/tradeup/perkInventory';
import { RunCoinIcon } from './xp/RunCoinIcon';
import { ShopAtmosphere } from './shop/ShopAtmosphere';
import { ShopCoinPile } from './shop/ShopCoinPile';
import { ShopGoldCoin, ShopGoldCoinSprite } from './shop/ShopGoldCoin';
import { ShopPerkIcon } from './shop/ShopPerkIcon';

type ShopTab = 'coins' | 'perks';

const PACKS = [...COIN_PACKS];
const BEST_PACK_ID = PACKS.reduce((best, p) => ((p.coins ?? 0) > (best.coins ?? 0) ? p : best)).productId;

/** Heavy coin piles — memoized so Perks↔Coins never rebuilds SVG trees. */
const ShopCoinsPanel = memo(function ShopCoinsPanel({
  busyId,
  onWatch,
  onPurchase,
}: {
  busyId: string | null;
  onWatch: () => void;
  onPurchase: (product: ShopCatalogProduct) => void;
}) {
  return (
    <section className="shop-panel shop-panel--coins" aria-label="Coin packs">
      <article className="shop-starter">
        <span className="shop-starter__tag shop-starter__tag--left">Welcome Offer</span>
        <span className="shop-starter__tag shop-starter__tag--right">Best Deal</span>
        <h2 className="shop-starter__title">Starter Bundle</h2>
        <div className="shop-starter__loot">
          <div className="shop-starter__item">
            <span className="shop-starter__ico shop-starter__ico--ads" aria-hidden>
              <span className="shop-starter__ads-mark">ADS</span>
              <span className="shop-starter__ads-ban" />
            </span>
            <em>Off</em>
          </div>
          <div className="shop-starter__item">
            <span className="shop-starter__ico shop-starter__ico--coin" aria-hidden>
              <ShopGoldCoin />
            </span>
            <em>{(PREMIUM_PRODUCT.coins ?? 500).toLocaleString('en-US')}</em>
          </div>
          <div className="shop-starter__item">
            <ShopPerkIcon id="double_draft" size="sm" />
            <em>x{PERK_PACK_QTY}</em>
          </div>
          <div className="shop-starter__item">
            <ShopPerkIcon id="player_swap" size="sm" />
            <em>x{PERK_PACK_QTY}</em>
          </div>
        </div>
        <button
          type="button"
          className="shop-buy shop-buy--wide"
          disabled={busyId != null}
          onClick={() => onPurchase(PREMIUM_PRODUCT)}
        >
          {busyId === PREMIUM_PRODUCT.productId ? '…' : PREMIUM_PRODUCT.displayPrice}
        </button>
      </article>

      <div className="shop-dots" aria-hidden>
        <span className="shop-dots__dot is-on" />
        <span className="shop-dots__dot" />
      </div>

      <div className="shop-coin-grid">
        <article className="shop-pack shop-pack--ad">
          <div className="shop-pack__art">
            <ShopCoinPile coins={WATCH_AD_COINS} />
          </div>
          <strong className="shop-pack__qty">{WATCH_AD_COINS}</strong>
          <button
            type="button"
            className="shop-buy shop-buy--watch ui-tap"
            disabled={busyId != null}
            onClick={onWatch}
          >
            Watch Ad
          </button>
        </article>
        {PACKS.map((p) => {
          const amount = p.coins ?? 0;
          const isBest = p.productId === BEST_PACK_ID;
          return (
            <article key={p.productId} className={`shop-pack${isBest ? ' shop-pack--best' : ''}`}>
              {isBest ? <span className="shop-pack__badge">Best Value</span> : null}
              <div className="shop-pack__art">
                <ShopCoinPile coins={amount} />
              </div>
              <strong className="shop-pack__qty">{amount.toLocaleString('en-US')}</strong>
              <button
                type="button"
                className="shop-buy ui-tap"
                disabled={busyId != null}
                onClick={() => onPurchase(p)}
              >
                {busyId === p.productId ? '…' : p.displayPrice}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
});

const ShopPerksPanel = memo(function ShopPerksPanel({
  busyId,
  coins,
  inv,
  onBuyPerk,
  onBuyBundle,
}: {
  busyId: string | null;
  coins: number;
  inv: PerkInventory;
  onBuyPerk: (id: PerkId) => void;
  onBuyBundle: () => void;
}) {
  return (
    <section className="shop-panel shop-panel--perks" aria-label="Perks">
      <div className="shop-owned">
        <p className="shop-owned__label">Your Perks</p>
        <ul className="shop-owned__row">
          {PERK_DEFS.map((perk) => (
            <li key={perk.id} className="shop-owned__item">
              <ShopPerkIcon id={perk.id} size="lg" />
              <span className="shop-owned__badge">{inv[perk.id]}</span>
            </li>
          ))}
        </ul>
      </div>

      <article className="shop-ultimate">
        <span className="shop-ultimate__badge">Most Popular</span>
        <h2 className="shop-ultimate__title">Ultimate Perks Bundle</h2>
        <div className="shop-ultimate__loot">
          {PERK_DEFS.map((perk, i) => (
            <div key={perk.id} className="shop-ultimate__slot">
              {i > 0 ? <span className="shop-ultimate__plus">+</span> : null}
              <div className="shop-ultimate__item">
                <ShopPerkIcon id={perk.id} size="md" />
                <em>{PERK_BUNDLE_QTY}</em>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="shop-buy shop-buy--wide shop-buy--coin"
          disabled={busyId != null || coins < PERK_BUNDLE_PRICE}
          onClick={onBuyBundle}
        >
          <RunCoinIcon size={20} tone="gold" />
          {busyId === 'perk:bundle' ? '…' : PERK_BUNDLE_PRICE.toLocaleString('en-US')}
        </button>
      </article>

      <div className="shop-perk-packs">
        {PERK_DEFS.map((perk) => {
          const price = PERK_PACK_PRICE[perk.id];
          return (
            <article key={perk.id} className={`shop-perk-pack shop-perk-pack--${perk.id}`}>
              <strong className="shop-perk-pack__title">{perk.shopTitle}</strong>
              <ShopPerkIcon id={perk.id} size="lg" />
              <em className="shop-perk-pack__qty">x{PERK_PACK_QTY}</em>
              <button
                type="button"
                className="shop-buy shop-buy--coin"
                disabled={busyId != null || coins < price}
                onClick={() => onBuyPerk(perk.id)}
              >
                <RunCoinIcon size={16} tone="gold" />
                {busyId === `perk:${perk.id}` ? '…' : price.toLocaleString('en-US')}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
});

/**
 * Premium Shop — reference storefront.
 * Memoized (no props) so hub tab changes on website don't rebuild coin SVGs.
 */
export const ShopScreen = memo(function ShopScreen() {
  const { t } = useLocale();
  const { state: account } = useAccountAuth();
  const { coins } = useXpProfile();
  const permanent = account.status === 'permanent';
  const accountId = permanent ? account.profile.user_id : null;
  const [tab, setTab] = useState<ShopTab>('coins');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inv, setInv] = useState<PerkInventory>(() => getPerkInventory());
  const configured = shopConfigured();

  const switchTab = useCallback((next: ShopTab) => {
    setTab((prev) => (prev === next ? prev : next));
  }, []);

  const watchAd = useCallback(() => {
    setMessage(`Watch ads for ${WATCH_AD_COINS} coins — coming soon.`);
  }, []);

  const refreshInv = useCallback(() => setInv(getPerkInventory()), []);

  useEffect(() => {
    refreshInv();
    const onInv = () => refreshInv();
    window.addEventListener('oneb:perk-inventory', onInv);
    window.addEventListener('storage', onInv);
    return () => {
      window.removeEventListener('oneb:perk-inventory', onInv);
      window.removeEventListener('storage', onInv);
    };
  }, [refreshInv]);

  useEffect(() => {
    if (!configured || !accountId) return;
    void syncPendingPurchases().then((n) => {
      if (n > 0) getShopEntitlements();
    });
  }, [configured, accountId]);

  const purchase = useCallback(
    async (product: ShopCatalogProduct) => {
      setMessage(null);
      if (!configured) {
        setMessage('Purchases unlock on iOS once StoreKit is configured.');
        return;
      }
      if (!accountId) {
        setMessage('Sign in to buy.');
        return;
      }
      setBusyId(product.productId);
      try {
        const result = await buyProduct(product.productId, accountId);
        if (result.ok) {
          if (product.productId === PREMIUM_PRODUCT.productId) {
            addPerkCharges('double_draft', PERK_PACK_QTY);
            addPerkCharges('player_swap', PERK_PACK_QTY);
            refreshInv();
          }
          setMessage('Purchase verified.');
        } else if (result.reason === 'cancelled') {
          setMessage(null);
        } else if (result.reason === 'unavailable') {
          setMessage('Store not available yet.');
        } else {
          setMessage('Could not verify purchase — nothing was charged.');
        }
      } finally {
        setBusyId(null);
      }
    },
    [accountId, configured, refreshInv],
  );

  const buyPerk = useCallback(
    (id: PerkId) => {
      setMessage(null);
      setBusyId(`perk:${id}`);
      const ok = buyPerkPack(id);
      if (ok) {
        refreshInv();
        setMessage(null);
      } else {
        setMessage('Not enough coins.');
      }
      setBusyId(null);
    },
    [refreshInv],
  );

  const buyBundle = useCallback(() => {
    setMessage(null);
    setBusyId('perk:bundle');
    const ok = buyUltimatePerkBundle();
    if (ok) refreshInv();
    else setMessage('Not enough coins.');
    setBusyId(null);
  }, [refreshInv]);

  const restore = useCallback(async () => {
    setMessage(null);
    setBusyId('restore');
    try {
      const result = await restorePurchases();
      if (result.ok) setMessage('Purchases restored.');
      else setMessage('Restore unavailable until iOS StoreKit is connected.');
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div className="tradeup-shell tradeup-shell--hub shop-screen" aria-label={t('nav.shop')}>
      <ShopGoldCoinSprite />
      <ShopAtmosphere />

      <div className="shop-ui">
        <div className="shop-tabs" role="tablist" aria-label="Shop sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'coins'}
            className={`shop-tabs__btn ui-tap${tab === 'coins' ? ' is-active' : ''}`}
            onClick={() => switchTab('coins')}
          >
            Coins
          </button>
          <span className="shop-tabs__rule" aria-hidden />
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'perks'}
            className={`shop-tabs__btn ui-tap${tab === 'perks' ? ' is-active' : ''}`}
            onClick={() => switchTab('perks')}
          >
            Perks
          </button>
        </div>

        {/* Tab visibility is CSS-only on the wrapper — panels are memoized and skip re-render. */}
        <div className={`shop-panels shop-panels--${tab}`}>
          <ShopCoinsPanel busyId={busyId} onWatch={watchAd} onPurchase={purchase} />
          <ShopPerksPanel
            busyId={busyId}
            coins={coins}
            inv={inv}
            onBuyPerk={buyPerk}
            onBuyBundle={buyBundle}
          />
        </div>

        <footer className="shop-ui__foot">
          <button
            type="button"
            className="shop-ui__restore"
            disabled={busyId != null}
            onClick={() => void restore()}
          >
            {busyId === 'restore' ? 'Restoring…' : 'Restore'}
          </button>
          {message ? <p className="shop-ui__msg">{message}</p> : null}
        </footer>
      </div>
    </div>
  );
});
