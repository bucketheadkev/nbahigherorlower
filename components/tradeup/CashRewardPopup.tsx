'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import {
  BANK_CHANGED_EVENT,
  BANK_PAYOUT_EVENT,
  catchUpRunBonuses,
  challengeReward,
  formatCash,
  getUncelebratedPayouts,
  markPayoutsCelebrated,
  RUN_BONUS_GOAL,
  type BankPayoutDetail,
} from '@/lib/tradeup/bank';
import { playFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import { hapticSuccess } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { MoneyRain } from './MoneyRain';

const MAX_LISTED = 4;
const COUNT_MS = 1100;
/** Lets a just-finished run land its total before the cash takes over. */
const EVENT_DELAY_MS = 650;

function goalKey(id: string): MessageKey {
  return `challenge.${id}.blurb` as MessageKey;
}


interface Payouts {
  ids: string[];
  extras: BankPayoutDetail[];
}

function CashRewardPopup({
  ids,
  extras,
  balance,
  onCollect,
}: Payouts & { balance: number | null; onCollect: () => void }) {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const sorted = [...ids].sort((a, b) => challengeReward(b) - challengeReward(a));
  const orderedExtras = extras;
  const total =
    sorted.reduce((sum, id) => sum + challengeReward(id), 0) +
    extras.reduce((sum, extra) => sum + extra.amount, 0);
  const listed = sorted.slice(0, Math.max(1, MAX_LISTED - extras.length));
  const hidden = sorted.length - listed.length;
  const [shown, setShown] = useState(reduceMotion ? total : 0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    hapticSuccess();
    playFinalTotalSettleSound();
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setShown(total);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p >= 1 ? total : Math.round(total * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion, total]);

  return (
    <div
      className="cash-pop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cash-pop-amount"
      aria-describedby="cash-pop-heading"
    >
      {!reduceMotion ? <MoneyRain intense /> : null}
      <div className="cash-pop__card">
        <span className="cash-pop__glow" aria-hidden />
        <p className="cash-pop__kicker">{t('bank.kicker')}</p>
        <p
          id="cash-pop-amount"
          className="cash-pop__amount"
          style={{ '--chars': `+${formatCash(total)}`.length } as CSSProperties}
        >
          +{formatCash(shown)}
        </p>
        <p id="cash-pop-heading" className="cash-pop__heading">
          {t('bank.heading')}
        </p>

        <ul className="cash-pop__list">
          {orderedExtras.map((extra) => (
            <li key={`${extra.kind}:${extra.ref}`} className="cash-pop__item cash-pop__item--bet">
              <span className="cash-pop__tier">{t('bank.runBonusTier')}</span>
              <span className="cash-pop__name">
                {t('bank.runBonusLine', {
                  total: formatCash(extra.runTotal ?? RUN_BONUS_GOAL + extra.amount),
                })}
              </span>
              <span className="cash-pop__reward">+{formatCash(extra.amount)}</span>
            </li>
          ))}
          {listed.map((id) => (
            <li key={id} className="cash-pop__item cash-pop__item--goal">
              <span className="cash-pop__name">{t(goalKey(id))}</span>
              <span className="cash-pop__reward">+{formatCash(challengeReward(id))}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <p className="cash-pop__more">{t('bank.more', { count: hidden })}</p>
        ) : null}

        {balance !== null ? (
          <div className="cash-pop__balance">
            <span>{t('bank.newBalance')}</span>
            <strong>{formatCash(balance)}</strong>
          </div>
        ) : null}

        <button
          ref={buttonRef}
          type="button"
          className="cash-pop__collect"
          onClick={onCollect}
        >
          {t('bank.collect')}
        </button>
        <p className="cash-pop__note">{t('bank.gameCash')}</p>
      </div>
    </div>
  );
}

/**
 * Celebrates every Cash payout this device has not shown yet — achievements, Classic run
 * bonuses, and Cash Table wins — in one popup that stays until the player taps Collect.
 */
export function CashRewardHost({ enabled }: { enabled: boolean }) {
  const { state: account } = useAccountAuth();
  const balance = useBankBalance(account.status === 'permanent');
  const [payouts, setPayouts] = useState<Payouts | null>(null);
  const [mounted, setMounted] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pendingExtrasRef = useRef<BankPayoutDetail[]>([]);

  const check = useCallback(() => {
    if (!enabledRef.current) return;
    const pendingIds = getUncelebratedPayouts();
    const pendingExtras = pendingExtrasRef.current;
    if (pendingIds.length === 0 && pendingExtras.length === 0) return;
    pendingExtrasRef.current = [];
    setPayouts((current) => {
      const ids = [...new Set([...(current?.ids ?? []), ...pendingIds])];
      const extras = [...(current?.extras ?? [])];
      for (const extra of pendingExtras) {
        if (!extras.some((e) => e.kind === extra.kind && e.ref === extra.ref)) extras.push(extra);
      }
      if (
        current &&
        ids.length === current.ids.length &&
        extras.length === current.extras.length
      ) {
        return current;
      }
      return { ids, extras };
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let pendingTimer = 0;
    const schedule = () => {
      window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(check, EVENT_DELAY_MS);
    };
    const onPayout = (event: Event) => {
      const detail = (event as CustomEvent<BankPayoutDetail>).detail;
      if (!detail || !(detail.amount > 0)) return;
      pendingExtrasRef.current.push(detail);
      schedule();
    };
    window.addEventListener(BANK_PAYOUT_EVENT, onPayout);
    if (!enabled) {
      return () => {
        window.clearTimeout(pendingTimer);
        window.removeEventListener(BANK_PAYOUT_EVENT, onPayout);
      };
    }
    catchUpRunBonuses();
    const first = window.setTimeout(check, 400);
    window.addEventListener(BANK_CHANGED_EVENT, schedule);
    window.addEventListener(USER_DATA_CLEARED_EVENT, schedule);
    window.addEventListener('storage', schedule);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(pendingTimer);
      window.removeEventListener(BANK_PAYOUT_EVENT, onPayout);
      window.removeEventListener(BANK_CHANGED_EVENT, schedule);
      window.removeEventListener(USER_DATA_CLEARED_EVENT, schedule);
      window.removeEventListener('storage', schedule);
    };
  }, [check, enabled]);

  const payoutsRef = useRef(payouts);
  payoutsRef.current = payouts;

  const collect = useCallback(() => {
    if (payoutsRef.current) markPayoutsCelebrated(payoutsRef.current.ids);
    setPayouts(null);
  }, []);

  if (!mounted || !payouts) return null;
  return createPortal(
    <CashRewardPopup
      key={[...payouts.ids, ...payouts.extras.map((e) => `${e.kind}:${e.ref}`)].join('|')}
      ids={payouts.ids}
      extras={payouts.extras}
      balance={balance}
      onCollect={collect}
    />,
    document.body,
  );
}
