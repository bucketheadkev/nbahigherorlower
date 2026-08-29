'use client';

import { useLocale } from '@/hooks/useLocale';

/** Compact EN / ES toggle for the home toolbar. */
export function LanguageToggle() {
  const { locale, toggleLocale, t } = useLocale();

  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={toggleLocale}
      aria-label={locale === 'en' ? t('lang.switchToEs') : t('lang.switchToEn')}
      title={locale === 'en' ? t('lang.switchToEs') : t('lang.switchToEn')}
    >
      <span className="lang-toggle__track" aria-hidden>
        <span
          className={`lang-toggle__pill${locale === 'es' ? ' is-es' : ''}`}
        />
      </span>
      <span className="lang-toggle__labels" aria-hidden>
        <em className={locale === 'en' ? 'is-active' : undefined}>EN</em>
        <em className={locale === 'es' ? 'is-active' : undefined}>ES</em>
      </span>
    </button>
  );
}
