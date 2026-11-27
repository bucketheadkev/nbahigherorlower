'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { usePerkInventory } from '@/hooks/usePerkInventory';
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
import { playUiTapSound, warmUiTapSound } from '@/lib/tradeup/gameAudio';
import { hapticLight, hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { ConfirmSpendSheet } from './ConfirmSpendSheet';
import { PERK_DEFS, type PerkId } from '@/lib/tradeup/perks';
import {
  PERK_BUNDLE_PRICE,
  PERK_BUNDLE_QTY,
  PERK_PACK_PRICE,
  PERK_PACK_QTY,
  addPerkCharges,
  buyPerkPack,
  buyUltimatePerkBundle,
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
              <em className="shop-owned__name">{perk.shopTitle}</em>
            </li>
          ))}
        </ul>
      </div>

      <article className="shop-ultimate">
        <span className="shop-ultimate__badge">Save ~19%</span>
        <h2 className="shop-ultimate__title">Ultimate Perks Bundle</h2>
        <p className="shop-ultimate__save">
          10 of each perk · normally 3,700 · now {PERK_BUNDLE_PRICE.toLocaleString('en-US')}
        </p>
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
  const inv = usePerkInventory();
  const permanent = account.status === 'permanent';
  const accountId = permanent ? account.profile.user_id : null;
  const [tab, setTab] = useState<ShopTab>('coins');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const configured = shopConfigured();
  /** Ignore the synthetic click after an already-handled pointerdown. */
  const tabHandledAt = useRef(0);
  const tabRef = useRef<ShopTab>(tab);
  tabRef.current = tab;
  /** Synchronous purchase lock — state alone can't stop two taps in the same frame. */
  const busyRef = useRef(false);
  /** Coin spends (perk packs / bundle) wait for an explicit confirm. */
  const [confirm, setConfirm] = useState<'bundle' | PerkId | null>(null);

  useEffect(() => {
    warmUiTapSound();
  }, []);

  const switchTab = useCallback((next: ShopTab) => {
    if (tabRef.current === next) return;
    tabRef.current = next;
    // Sound + haptic before paint so Perks→Coins never feels mute/laggy.
    playUiTapSound();
    hapticLight();
    setTab(next);
  }, []);

  const onTabPointerDown = useCallback(
    (next: ShopTab) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      tabHandledAt.current = performance.now();
      switchTab(next);
    },
    [switchTab],
  );

  const onTabClick = useCallback(
    (next: ShopTab) => () => {
      if (performance.now() - tabHandledAt.current < 450) return;
      switchTab(next);
    },
    [switchTab],
  );

  const watchAd = useCallback(() => {
    setMessage(`Watch ads for ${WATCH_AD_COINS} coins — coming soon.`);
  }, []);

  useEffect(() => {
    if (!configured || !accountId) return;
    void syncPendingPurchases().then((n) => {
      if (n > 0) getShopEntitlements();
    });
  }, [configured, accountId]);

  /*
   * Needs real-iPhone StoreKit QA (sandbox account): buy each coin pack + Starter Bundle, cancel sheet,
   * interrupted/pending (Ask to Buy) purchase, Restore Purchases, receipt→server verify, and relaunch
   * with an unfinished transaction (syncPendingPurchases). busyRef guards double-taps.
   */
  const purchase = useCallback(
    async (product: ShopCatalogProduct) => {
      if (busyRef.current) return;
      setMessage(null);
      if (!configured) {
        setMessage('Purchases unlock on iOS once StoreKit is configured.');
        return;
      }
      if (!accountId) {
        setMessage('Sign in to buy.');
        return;
      }
      busyRef.current = true;
      hapticTap();
      setBusyId(product.productId);
      try {
        const result = await buyProduct(product.productId, accountId);
        if (result.ok) {
          if (product.productId === PREMIUM_PRODUCT.productId) {
            // addPerkCharges dispatches oneb:perk-inventory → usePerkInventory refreshes.
            addPerkCharges('double_draft', PERK_PACK_QTY);
            addPerkCharges('player_swap', PERK_PACK_QTY);
          }
          hapticSuccess();
          setMessage('Purchase verified.');
        } else if (result.reason === 'cancelled') {
          setMessage(null);
        } else if (result.reason === 'unavailable') {
          setMessage('Store not available yet.');
        } else {
          setMessage('Could not verify purchase — nothing was charged.');
        }
      } finally {
        busyRef.current = false;
        setBusyId(null);
      }
    },
    [accountId, configured],
  );

  const buyPerk = useCallback((id: PerkId) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setMessage(null);
    setBusyId(`perk:${id}`);
    const ok = buyPerkPack(id);
    if (ok) {
      hapticSuccess();
    } else {
      setMessage('Not enough coins.');
    }
    busyRef.current = false;
    setBusyId(null);
  }, []);

  const buyBundle = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setMessage(null);
    setBusyId('perk:bundle');
    const ok = buyUltimatePerkBundle();
    if (ok) {
      hapticSuccess();
    } else {
      setMessage('Not enough coins.');
    }
    busyRef.current = false;
    setBusyId(null);
  }, []);

  const askBuyPerk = useCallback((id: PerkId) => {
    if (busyRef.current) return;
    hapticTap();
    setConfirm(id);
  }, []);

  const askBuyBundle = useCallback(() => {
    if (busyRef.current) return;
    hapticTap();
    setConfirm('bundle');
  }, []);

  const confirmSpend = useCallback(() => {
    const pending = confirm;
    setConfirm(null);
    if (pending === 'bundle') buyBundle();
    else if (pending) buyPerk(pending);
  }, [confirm, buyBundle, buyPerk]);

  const restore = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    hapticLight();
    setMessage(null);
    setBusyId('restore');
    try {
      const result = await restorePurchases();
      if (result.ok) setMessage('Purchases restored.');
      else setMessage('Restore unavailable until iOS StoreKit is connected.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }, []);

  const confirmCopy =
    confirm === 'bundle'
      ? {
          title: 'Ultimate Perks Bundle',
          copy: `Spend ${PERK_BUNDLE_PRICE.toLocaleString('en-US')} coins for ${PERK_BUNDLE_QTY} of each perk?`,
          label: `Spend ${PERK_BUNDLE_PRICE.toLocaleString('en-US')}`,
        }
      : confirm
        ? {
            title: PERK_DEFS.find((p) => p.id === confirm)?.shopTitle ?? 'Perk pack',
            copy: `Spend ${PERK_PACK_PRICE[confirm].toLocaleString('en-US')} coins for ${PERK_PACK_QTY} charges?`,
            label: `Spend ${PERK_PACK_PRICE[confirm].toLocaleString('en-US')}`,
          }
        : null;

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
            onPointerDown={onTabPointerDown('coins')}
            onClick={onTabClick('coins')}
          >
            {t('shop.coins')}
          </button>
          <span className="shop-tabs__rule" aria-hidden />
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'perks'}
            className={`shop-tabs__btn ui-tap${tab === 'perks' ? ' is-active' : ''}`}
            onPointerDown={onTabPointerDown('perks')}
            onClick={onTabClick('perks')}
          >
            {t('shop.perks')}
          </button>
        </div>

        {/* Tab visibility is CSS-only on the wrapper — panels are memoized and skip re-render. */}
        <div className={`shop-panels shop-panels--${tab}`}>
          <ShopCoinsPanel busyId={busyId} onWatch={watchAd} onPurchase={purchase} />
          <ShopPerksPanel
            busyId={busyId}
            coins={coins}
            inv={inv}
            onBuyPerk={askBuyPerk}
            onBuyBundle={askBuyBundle}
          />
        </div>

        <footer className="shop-ui__foot">
          <button
            type="button"
            className="shop-ui__restore"
            disabled={busyId != null}
            onClick={() => void restore()}
          >
            {busyId === 'restore' ? t('shop.restoring') : t('shop.restore')}
          </button>
          {message ? <p className="shop-ui__msg">{message}</p> : null}
        </footer>
      </div>

      <ConfirmSpendSheet
        open={confirmCopy != null}
        title={confirmCopy?.title ?? ''}
        copy={confirmCopy?.copy ?? ''}
        confirmLabel={confirmCopy?.label}
        onConfirm={confirmSpend}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
});
