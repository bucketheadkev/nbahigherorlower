'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useLocale } from '@/hooks/useLocale';
import {
  getGuideContent,
  GUIDE_NAV,
  type GuideExample,
  type GuideIcon,
  type GuideId,
  type GuideSection,
} from '@/lib/i18n/guides';
import { formatCash } from '@/lib/tradeup/bank';
import { BILLION_GOAL, TIER_DOLLAR_BANDS } from '@/lib/tradeup/billionDollar';
import { hapticTap } from '@/lib/tradeup/haptics';
import { teamRowStyle } from '@/lib/tradeup/teamColors';
import { TEAMS } from '@/lib/tradeup/teams';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import type { Position } from '@/lib/tradeup/types';
import { FINAL_TOTAL, KOBE, LEBRON, LEBRON_LAL, seatedValue, type IntroPlayer } from './onboarding/introData';

interface SettingsGuidePageProps {
  guideId: GuideId;
  onBack: () => void;
}

const TIER_ORDER: PlayerTier[] = ['F', 'D', 'C', 'B', 'A', 'S', 'GOAT'];

const ICON_PATHS: Record<GuideIcon, ReactNode> = {
  spin: (
    <>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5v3.2h-3.2" />
    </>
  ),
  pick: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  place: <path d="M8.5 4h7l1 2.6 2.5 1.4-.9 3.4-1.6-.4V20H7.5v-9l-1.6.4L5 8l2.5-1.4L8.5 4Z" />,
  move: (
    <>
      <path d="M5 8.5h13l-3-3" />
      <path d="M19 15.5H6l3 3" />
    </>
  ),
  value: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M14.6 9.3c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2.1c1.5.3 2.6 1 2.6 2.1s-1.1 2-2.6 2c-1.2 0-2.2-.5-2.7-1.4M12 6.5v11" />
    </>
  ),
  rollover: (
    <>
      <path d="M4 16.5 9.5 11l3.5 3.5L20 7.5" />
      <path d="M15.5 7.5H20V12" />
    </>
  ),
  bonus: <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" />,
  achievement: (
    <>
      <circle cx="12" cy="9.5" r="5" />
      <path d="m9 14-1.5 6.5L12 18l4.5 2.5L15 14" />
    </>
  ),
  franchise: (
    <>
      <path d="M3.5 19.5h17M5 19.5V11c0-2 3.1-3.5 7-3.5s7 1.5 7 3.5v8.5" />
      <path d="M9.5 19.5v-4h5v4M5 11.5c1.6 1 4.2 1.5 7 1.5s5.4-.5 7-1.5" />
    </>
  ),
  leaderboard: (
    <>
      <path d="M5 19.5v-6h4v6M10 19.5V6.5h4v13M15 19.5v-9h4v9" />
      <path d="M3.5 19.5h17" />
    </>
  ),
  wall: (
    <>
      <path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 5.5H4.5v1.2a3 3 0 0 0 3.2 3M16.5 5.5h3v1.2a3 3 0 0 1-3.2 3M12 13v3.5M8.5 20h7M9.5 16.5h5" />
    </>
  ),
};

function GuideGlyph({ icon }: { icon: GuideIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON_PATHS[icon]}
    </svg>
  );
}

function PlayerCard({
  player,
  slot,
  tag,
  tone,
}: {
  player: IntroPlayer;
  slot: Position;
  tag?: string;
  tone?: 'good' | 'warn';
}) {
  const team = TEAMS.find((entry) => entry.id === player.teamId);
  return (
    <li className="run-ledger__player-row sgx-card" style={teamRowStyle(player.teamId) as CSSProperties}>
      <span className="run-ledger__pos">{slot}</span>
      <span className="run-ledger__meta">
        <strong>{player.name}</strong>
        <em>
          {team?.name ?? player.teamId} · {player.era}
        </em>
      </span>
      <span className="sgx-card__right">
        <span className="run-ledger__val">{formatCash(seatedValue(player, slot))}</span>
        {tag ? <span className={`sgx-card__tag sgx-card__tag--${tone ?? 'good'}`}>{tag}</span> : null}
      </span>
    </li>
  );
}

function Example({ example, locale }: { example: GuideExample; locale: string }) {
  const nav = GUIDE_NAV[locale as keyof typeof GUIDE_NAV] ?? GUIDE_NAV.en;
  if (example === 'versions') {
    return (
      <ul className="sgx-cards">
        <PlayerCard player={LEBRON} slot={LEBRON.primaryPosition} />
        <PlayerCard player={LEBRON_LAL} slot={LEBRON_LAL.primaryPosition} />
      </ul>
    );
  }
  if (example === 'position') {
    return (
      <ul className="sgx-cards">
        <PlayerCard player={KOBE} slot="SG" tag={nav.fullValue} tone="good" />
        <PlayerCard player={KOBE} slot="SF" tag={nav.fullValue} tone="good" />
      </ul>
    );
  }
  return (
    <dl className="sgx-ledger">
      <div className="sgx-ledger__row">
        <dt>{nav.teamValue}</dt>
        <dd>{formatCash(FINAL_TOTAL)}</dd>
      </div>
      <div className="sgx-ledger__row">
        <dt>{nav.goal}</dt>
        <dd>{formatCash(BILLION_GOAL)}</dd>
      </div>
      <div className="sgx-ledger__row sgx-ledger__row--bank">
        <dt>{nav.toBank}</dt>
        <dd>+{formatCash(Math.max(0, FINAL_TOTAL - BILLION_GOAL))}</dd>
      </div>
    </dl>
  );
}

function Section({ section, locale }: { section: GuideSection; locale: string }) {
  switch (section.kind) {
    case 'steps':
      return (
        <section className="sgx-block" aria-label={section.label}>
          <p className="sgx-label">{section.label}</p>
          <ol className="sgx-steps">
            {section.items.map((item, i) => (
              <li key={item.title} className="sgx-step">
                <span className="sgx-step__icon">
                  <GuideGlyph icon={item.icon} />
                  <span className="sgx-step__n">{i + 1}</span>
                </span>
                <span className="sgx-row__copy">
                  <strong>{item.title}</strong>
                  <span>{item.line}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      );
    case 'list':
      return (
        <section className="sgx-block" aria-label={section.label}>
          <p className="sgx-label">{section.label}</p>
          <ul className="sgx-panel">
            {section.items.map((item) => (
              <li key={item.title} className={`sgx-row sgx-row--${item.icon}`}>
                <span className="sgx-row__icon">
                  <GuideGlyph icon={item.icon} />
                </span>
                <span className="sgx-row__copy">
                  <strong>{item.title}</strong>
                  <span>{item.line}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'example':
      return (
        <section className="sgx-block" aria-label={section.label}>
          <p className="sgx-label">{section.label}</p>
          <div className="sgx-panel sgx-panel--example">
            <p className="sgx-example__title">{section.title}</p>
            <p className="sgx-example__line">{section.line}</p>
            <Example example={section.example} locale={locale} />
          </div>
        </section>
      );
    case 'modes':
      return (
        <section className="sgx-block" aria-label={section.label}>
          <p className="sgx-label">{section.label}</p>
          <div className="sgx-modes">
            {section.items.map((mode) => (
              <article key={mode.title} className="sgx-mode">
                <span className="sgx-mode__mark" aria-hidden>
                  {mode.mark}
                </span>
                <strong>{mode.title}</strong>
                <span>{mode.line}</span>
              </article>
            ))}
          </div>
        </section>
      );
    case 'tiers':
      return (
        <section className="sgx-block" aria-label={section.label}>
          <div className="sgx-label-row">
            <p className="sgx-label">{section.label}</p>
            <span className="sgx-note">{section.note}</span>
          </div>
          <ul className="sgx-tiers">
            {TIER_ORDER.map((tier) => {
              const band = TIER_DOLLAR_BANDS[tier];
              return (
                <li key={tier} className={`sgx-tier sgx-tier--${tier.toLowerCase()}`}>
                  <span className="sgx-tier__badge">{tier}</span>
                  <span className="sgx-tier__copy">
                    <span className="sgx-tier__blurb">{section.blurbs[tier]}</span>
                    <strong className="sgx-tier__range">
                      {formatCash(band.minDollars)} – {formatCash(band.maxDollars)}
                    </strong>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      );
  }
}

/** Full-screen settings guide — How to Play / How Values Work. */
export function SettingsGuidePage({ guideId, onBack }: SettingsGuidePageProps) {
  const { locale } = useLocale();
  const nav = GUIDE_NAV[locale] ?? GUIDE_NAV.en;
  const content = getGuideContent(locale, guideId);
  const isValues = guideId === 'how-values-work';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div
      className={`settings-guide sgx${isValues ? ' settings-guide--values' : ' settings-guide--play'}`}
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <header className="settings-guide__header sgx-head">
        <button
          type="button"
          className="settings-ctrl sgx-back"
          aria-label={nav.back}
          onClick={(e) => {
            e.stopPropagation();
            hapticTap();
            onBack();
          }}
        >
          <svg viewBox="0 0 10 16" width="9" height="14" fill="none" aria-hidden>
            <path d="M8 2 2 8l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{nav.back}</span>
        </button>
        <p className="sgx-head__kicker">{content.kicker}</p>
        <h1 className="sgx-head__title">{content.title}</h1>
        <p className="sgx-head__tagline">{content.tagline}</p>
      </header>

      <div className="settings-guide__scroll sgx-scroll">
        {content.sections.map((section) => (
          <Section key={section.label} section={section} locale={locale} />
        ))}
        <div className="settings-guide__scroll-pad" aria-hidden />
      </div>
    </div>
  );
}
