'use client';

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { FCard, FState } from '@/lib/account/franchiseV5Cloud';
import { EARNINGS_EXAMPLES, POSITIONS, type Slot } from '@/lib/tradeup/franchise/config';
import { FC, TIER_COLOR, tx } from '@/lib/tradeup/franchise/copy';
import { fmtCash, fmtFans } from '@/lib/tradeup/franchise/format';
import { formatClock, fullPeriodPay, lineupCards, nextPaycheck, totalFans } from '@/lib/tradeup/franchise/pay';
import { playerView } from '@/lib/tradeup/franchise/players';
import { teamCardStyle } from '@/lib/tradeup/franchise/teamCards';
import { TEAMS } from '@/lib/tradeup/teams';
import { JerseyShape } from '../draft/CourtJersey';
import { ArenaBackdrop, TeamJersey } from './ArenaParts';
import { BackButton, BankChip, InfoButton } from './FranchiseChrome';

/**
 * Seat centers on the court, % of the court box. Each seat is a jersey with the player's name and
 * fans under it; rows are spaced so neighbouring names never touch (top row, then wings, then PG).
 */
const SEATS: Record<Slot, { x: number; y: number }> = {
  PF: { x: 30, y: 21 },
  C: { x: 70, y: 21 },
  SG: { x: 12.5, y: 62 },
  SF: { x: 87.5, y: 62 },
  PG: { x: 50, y: 71 },
};

/** Countdown, progress line and the projected paycheck; ticks on its own every second. */
const PayClock = memo(function PayClock({ state, locale, onDue }: { state: FState; locale: string; onDue: () => void }) {
  const [now, setNow] = useState(() => Date.now() + state.clockOffset);
  const dueRef = useRef(false);
  useEffect(() => {
    dueRef.current = false;
    setNow(Date.now() + state.clockOffset);
    const t = window.setInterval(() => setNow(Date.now() + state.clockOffset), 1000);
    return () => window.clearInterval(t);
  }, [state]);
  const pay = state.pay;
  const left = pay ? Math.max(0, pay.periodEnd - now) : 0;
  const span = pay ? pay.periodEnd - pay.periodStart : 1;
  const progress = pay ? Math.min(1, Math.max(0, 1 - left / span)) : 0;
  useEffect(() => {
    if (pay && left <= 0 && !dueRef.current) {
      dueRef.current = true;
      onDue();
    }
  }, [left, pay, onDue]);
  const projected = pay ? nextPaycheck(pay, state.settings.payPpm) : 0;
  const full = fullPeriodPay(totalFans(state), state.settings.payPpm);
  // Differs when the lineup changed (or started) partway through this period; a few seconds'
  // difference is noise, so only call it out when it is worth reading.
  const prorated = pay != null && Math.abs(projected - full) >= Math.max(1000, full * 0.005);
  return (
    <div className="fx-board__next">
      <div className="fx-board__next-row">
        <span className="fx-board__label">{tx(FC.nextPaycheck, locale)}</span>
        <strong className="fx-board__clock">{formatClock(left)}</strong>
      </div>
      <span className="fx-board__progress" aria-hidden>
        <b style={{ transform: `scaleX(${progress})` }} />
      </span>
      {prorated ? (
        <p className="fx-board__prorated">
          {tx(FC.thisPaycheck, locale)} <strong>{fmtCash(projected)}</strong> · {tx(FC.prorated, locale)}
        </p>
      ) : null}
    </div>
  );
});

function Scoreboard({ state, locale, onDue }: { state: FState; locale: string; onDue: () => void }) {
  const [open, setOpen] = useState(false);
  const fans = totalFans(state);
  const per = fullPeriodPay(fans, state.settings.payPpm);
  return (
    <section className="fx-board" aria-label={tx(FC.totalFans, locale)}>
      <div className="fx-board__main">
        <span className="fx-board__stat">
          <span className="fx-board__label">{tx(FC.totalFans, locale)}</span>
          <strong className="fx-board__fans" key={fans}>
            {fmtFans(fans)}
          </strong>
        </span>
        <span className="fx-board__stat fx-board__stat--right">
          <span className="fx-board__label">{tx(FC.paycheck12, locale)}</span>
          <strong className="fx-board__pay" key={per}>
            {fmtCash(per)}
          </strong>
        </span>
      </div>
      <PayClock state={state} locale={locale} onDue={onDue} />
      <button type="button" className={`fx-board__toggle${open ? ' is-open' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {tx(FC.howEarnings, locale)}
        <svg viewBox="0 0 12 8" width="10" height="7" fill="none" aria-hidden>
          <path d="M1.5 1.75 6 6.25l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="fx-board__how">
          <p>{tx(FC.howLine, locale)}</p>
          <ul>
            {EARNINGS_EXAMPLES.map((n) => (
              <li key={n}>
                <span>
                  {fmtFans(n)} {tx(FC.fansWord, locale)}
                </span>
                <i aria-hidden>→</i>
                <strong>{fmtCash(fullPeriodPay(n, state.settings.payPpm))}</strong>
              </li>
            ))}
            <li className="is-you">
              <span>
                {fmtFans(fans)} {tx(FC.fansWord, locale)}
              </span>
              <i aria-hidden>→</i>
              <strong>{fmtCash(per)}</strong>
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const Seat = memo(function Seat({
  slot,
  card,
  teamId,
  top,
  locale,
  onPick,
}: {
  slot: Slot;
  card: FCard | undefined;
  /** The owned franchise: everyone in the starting five wears its colors. */
  teamId: string | undefined;
  top: boolean;
  locale: string;
  onPick: (slot: Slot) => void;
}) {
  const pos = SEATS[slot];
  const style = { left: `${pos.x}%`, top: `${pos.y}%` } as CSSProperties;
  if (!card) {
    return (
      <button type="button" className="fx-seat is-empty" style={style} onClick={() => onPick(slot)} aria-label={`${slot} ${tx(FC.emptySeat, locale)}`}>
        <span className="fx-seat__jersey">
          <span className="jersey is-empty">
            <JerseyShape />
            <span className="jersey__text jersey__text--pos">{slot}</span>
          </span>
        </span>
        <span className="fx-seat__tag">{slot}</span>
      </button>
    );
  }
  const v = playerView(card.playerId);
  return (
    <button
      type="button"
      className={`fx-seat${top ? ' is-top' : ''}`}
      style={{ ...style, '--tier': TIER_COLOR[card.tier] } as CSSProperties}
      onClick={() => onPick(slot)}
      aria-label={`${slot} ${v.name}, ${fmtFans(card.fans)} ${tx(FC.fansWord, locale)}${top ? `, ${tx(FC.topDraw, locale)}` : ''}`}
    >
      <span className="fx-seat__jersey" key={card.id}>
        <TeamJersey playerId={card.playerId} wearTeam={teamId} />
        {top ? (
          <span className="fx-seat__crown" title={tx(FC.topDraw, locale)} aria-hidden>
            <svg viewBox="0 0 16 12" width="11" height="8">
              <path d="M1 11h14l1-8-4.5 3L8 0 4.5 6 0 3l1 8Z" fill="currentColor" />
            </svg>
          </span>
        ) : null}
      </span>
      <span className="fx-seat__name">{v.name}</span>
      <span className="fx-seat__tag">
        <em>{slot}</em>
        {fmtFans(card.fans)}
      </span>
    </button>
  );
});

export function FranchiseHome({
  state,
  locale,
  toast,
  onClose,
  onInfo,
  onSwitch,
  onShop,
  onCollection,
  onSeat,
  onStarter,
  onDue,
}: {
  state: FState;
  locale: string;
  toast: string | null;
  onClose: () => void;
  onInfo: () => void;
  onSwitch: () => void;
  onShop: () => void;
  onCollection: () => void;
  onSeat: (slot: Slot) => void;
  onStarter: () => void;
  onDue: () => void;
}) {
  const team = TEAMS.find((t) => t.id === state.owned?.teamId);
  const five = useMemo(() => lineupCards(state), [state]);
  const topSlot = useMemo(() => {
    let best: Slot | null = null;
    for (const slot of POSITIONS) if (five[slot] && (!best || five[slot]!.fans > five[best]!.fans)) best = slot;
    return best;
  }, [five]);

  return (
    <div className="fx-screen fx-home" style={team ? teamCardStyle(team.id) : undefined}>
      <ArenaBackdrop banners={false} />
      <header className="fx-topbar">
        <BackButton label={tx(FC.close, locale)} onClick={onClose} />
        <span className="fx-topbar__right">
          <InfoButton label={tx(FC.howEarnings, locale)} onClick={onInfo} />
          <BankChip amount={state.bank} />
        </span>
      </header>

      <div className="fx-scroll fx-home__scroll">
        <section className="fx-home__team">
          <span className="fx-home__crest" aria-hidden />
          <div className="fx-home__names">
            <p className="fx-home__city">{team?.city}</p>
            <h1 className="fx-home__name">{team?.name}</h1>
          </div>
          <button type="button" className="fx-chip-btn" onClick={onSwitch}>
            {tx(FC.switch, locale)}
          </button>
        </section>

        <Scoreboard state={state} locale={locale} onDue={onDue} />

        <section className="fx-five" aria-label={tx(FC.startingFive, locale)}>
          <h2 className="fx-label">{tx(FC.startingFive, locale)}</h2>
          <div className="fx-court">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fx-court__art" src="/images/arena/draft-court.jpg" alt="" decoding="async" />
            {POSITIONS.map((slot) => (
              <Seat key={slot} slot={slot} card={five[slot]} teamId={team?.id} top={slot === topSlot} locale={locale} onPick={onSeat} />
            ))}
          </div>
        </section>
      </div>

      <div className="fx-dock fx-home__dock">
        {!state.profile.starterClaimed ? (
          <button type="button" className="fx-btn fx-btn--primary" onClick={onStarter}>
            {tx(FC.starterReady, locale)}
          </button>
        ) : (
          <>
            <button type="button" className="fx-btn fx-btn--primary" onClick={onShop}>
              {tx(FC.openChests, locale)}
            </button>
            <button type="button" className="fx-btn fx-btn--ghost" onClick={onCollection}>
              {tx(FC.collection, locale)} · {state.cards.length}
            </button>
          </>
        )}
      </div>

      {toast ? (
        <div className="fx-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
