'use client';

import { useLocale } from '@/hooks/useLocale';

/** Shop hub destination — coming soon (tab required by official home nav). */
export function ShopScreen() {
  const { t } = useLocale();

  return (
    <div className="tradeup-shell tradeup-shell--hub shop-screen" aria-label={t('nav.shop')}>
      <div className="shop-screen__panel">
        <p className="shop-screen__eyebrow">{t('nav.shop')}</p>
        <h1 className="shop-screen__title">{t('shop.comingSoon')}</h1>
        <p className="shop-screen__copy">{t('shop.comingSoonCopy')}</p>
      </div>
    </div>
  );
}
