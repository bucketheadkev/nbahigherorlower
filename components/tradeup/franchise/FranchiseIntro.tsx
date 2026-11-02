'use client';

import { FC, tx } from '@/lib/tradeup/franchise/copy';
import { ArenaBackdrop } from './ArenaParts';
import { ChestArt } from './Chest';
import { BackButton } from './FranchiseChrome';

/** BUILD YOUR FRANCHISE — the first Franchises screen, once per player (and from ⓘ later). */
export function FranchiseIntro({ locale, onGotIt, onClose }: { locale: string; onGotIt: () => void; onClose: () => void }) {
  const steps = [
    {
      // eslint-disable-next-line @next/next/no-img-element
      icon: <img src="/images/home-v2/arena-exterior.png" alt="" className="fx-intro__img fx-intro__img--arena" />,
      title: FC.ownTitle,
      line: FC.ownLine,
    },
    { icon: <ChestArt chest="starter" className="fx-intro__chest" />, title: FC.buildTitle, line: FC.buildLine },
    {
      // eslint-disable-next-line @next/next/no-img-element
      icon: <img src="/images/home-v2/money.png" alt="" className="fx-intro__img" />,
      title: FC.paidTitle,
      line: FC.paidLine,
    },
  ];
  return (
    <div className="fx-screen fx-intro" role="dialog" aria-modal="true" aria-label={tx(FC.introTitle, locale)}>
      <ArenaBackdrop />
      <div className="fx-topbar">
        <BackButton label={tx(FC.close, locale)} onClick={onClose} />
      </div>
      <div className="fx-intro__body">
        <h1 className="fx-intro__title">{tx(FC.introTitle, locale)}</h1>
        <ol className="fx-intro__steps">
          {steps.map((s, i) => (
            <li key={s.title.en} className="fx-intro__step" style={{ animationDelay: `${120 + i * 90}ms` }}>
              <span className="fx-intro__icon" aria-hidden>
                {s.icon}
              </span>
              <span className="fx-intro__copy">
                <strong>{tx(s.title, locale)}</strong>
                <span>{tx(s.line, locale)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="fx-dock">
        <button type="button" className="fx-btn fx-btn--primary" onClick={onGotIt}>
          {tx(FC.gotIt, locale)}
        </button>
      </div>
    </div>
  );
}
