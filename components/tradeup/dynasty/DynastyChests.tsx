'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { DynastyChest, DynastyFailure, DynastyResult, DynastyState } from '@/lib/account/dynastyCloud';
import { newRequestId } from '@/lib/account/dynastyCloud';
import { collectionById } from '@/lib/tradeup/dynasty/catalog';
import {
  CHEST_TIER_COLOR,
  CHEST_TIER_NAME,
  chestArtId,
  formatCountdown,
  formatDuration,
} from '@/lib/tradeup/dynasty/chests';
import { dc, type DynastyCopyKey } from '@/lib/tradeup/dynasty/copy';
import { hapticLight, hapticTap } from '@/lib/tradeup/haptics';
import { ChestArt } from '../franchise/Chest';
import { KeyIcon } from './KeyIcon';

interface Props {
  state: DynastyState;
  locale: string;
  /** Key shop is configured and reachable on this device. */
  shopAvailable: boolean;
  startUnlock: (chestId: string) => Promise<DynastyResult<DynastyState>>;
  spendKey: (chestId: string, requestId: string) => Promise<DynastyResult<DynastyState>>;
  onOpen: (chest: DynastyChest) => void;
  onShop: () => void;
  refresh: () => void;
}

const ORDER: Record<DynastyChest['status'], number> = { ready: 0, unlocking: 1, waiting: 2, opened: 3 };

/** Server time, ticking once a second while something is counting down. */
function useServerNow(offsetMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => window.clearInterval(id);
  }, [offsetMs, active]);
  return now;
}

export function DynastyChests({ state, locale, shopAvailable, startUnlock, spendKey, onOpen, onShop, refresh }: Props) {
  const rules = state.chestRules;
  const live = state.chests.filter((c) => c.status !== 'opened');
  const opened = state.chests.filter((c) => c.status === 'opened').slice(0, 5);
  const counting = live.some((c) => c.status === 'unlocking');
  const now = useServerNow(state.serverOffsetMs, counting);

  // A countdown reaching zero is confirmed by the server, not assumed by the device.
  const refreshed = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of live) {
      if (c.status === 'unlocking' && c.unlockEndsAt != null && c.unlockEndsAt <= now && !refreshed.current.has(c.id)) {
        refreshed.current.add(c.id);
        refresh();
      }
    }
  }, [live, now, refresh]);

  const effective = (c: DynastyChest): DynastyChest['status'] =>
    c.status === 'unlocking' && c.unlockEndsAt != null && c.unlockEndsAt <= now ? 'ready' : c.status;
  const sorted = useMemo(
    () => [...live].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.earnedAt.localeCompare(b.earnedAt)),
    [live],
  );
  const slotBusy = live.filter((c) => effective(c) === 'unlocking').length >= rules.maxUnlocking;
  const pointsLeft = Math.max(0, rules.pointsPerChest - state.chestProgress.points);

  return (
    <div className="dyn-chests">
      <section className="dyn-next" aria-label={dc('nextChest', locale)}>
        <div className="dyn-next__row">
          <div className="dyn-next__copy">
            <span className="dyn-next__kicker">{dc('nextChest', locale)}</span>
            <strong>
              {state.chestProgress.points}/{rules.pointsPerChest}
            </strong>
          </div>
          {state.keys > 0 || shopAvailable ? (
            <button
              type="button"
              className="dyn-keys"
              onClick={shopAvailable ? onShop : undefined}
              disabled={!shopAvailable}
              aria-label={dc('keysBalance', locale, { n: Math.max(0, state.keys) })}
            >
              <KeyIcon />
              <span>{Math.max(0, state.keys)}</span>
              {shopAvailable ? <em>{dc('getKeys', locale)}</em> : null}
            </button>
          ) : null}
        </div>
        <span className="dyn-next__bar" aria-hidden>
          {Array.from({ length: rules.pointsPerChest }, (_, i) => (
            <span key={i} className={i < state.chestProgress.points ? 'is-on' : ''} />
          ))}
        </span>
        <p className="dyn-next__line">
          {dc(pointsLeft === 1 ? 'nextChestOne' : 'nextChestMany', locale, { n: pointsLeft })}
          <span aria-hidden> · </span>
          {dc('pointsRule', locale, { run: rules.pointsPerRun, billion: rules.pointsPerRun + rules.pointsBillionBonus })}
        </p>
      </section>

      {sorted.length === 0 ? (
        <section className="dyn-panel dyn-chests__empty">
          <strong>{dc('noChests', locale)}</strong>
          <p>{dc('noChestsLine', locale, { n: rules.pointsPerChest })}</p>
        </section>
      ) : (
        <ul className="dyn-chest-list">
          {sorted.map((c) => (
            <ChestRow
              key={c.id}
              chest={c}
              status={effective(c)}
              now={now}
              keys={state.keys}
              locale={locale}
              unlockSeconds={rules.unlockSeconds}
              slotBusy={slotBusy}
              shopAvailable={shopAvailable}
              startUnlock={startUnlock}
              spendKey={spendKey}
              onOpen={onOpen}
              onShop={onShop}
            />
          ))}
        </ul>
      )}

      <p className="dyn-protect">
        <span className="dyn-protect__meter" aria-hidden>
          {Array.from({ length: rules.dupProtectionAfter }, (_, i) => (
            <span key={i} className={i < state.chestProgress.dupStreak ? 'is-on' : ''} />
          ))}
        </span>
        {state.chestProgress.dupStreak >= rules.dupProtectionAfter
          ? dc('protectionReady', locale)
          : dc('protectionLine', locale, { n: rules.dupProtectionAfter })}
      </p>

      {opened.length ? (
        <section className="dyn-opened">
          <p className="dyn-section-label">{dc('recentlyOpened', locale)}</p>
          <ul>
            {opened.map((c) => {
              const col = c.rewardCollectionId ? collectionById(c.rewardCollectionId) : undefined;
              const slot = col?.slots.find((s) => s.playerId === c.rewardPlayerId);
              return (
                <li key={c.id} style={{ '--tier': CHEST_TIER_COLOR[c.tier] } as CSSProperties}>
                  <span className="dyn-opened__dot" aria-hidden />
                  <span className="dyn-opened__copy">
                    <strong>{slot?.name ?? '—'}</strong>
                    <em>
                      {col ? `${col.season} ${col.team}` : ''} · {dc('chestName', locale, { tier: CHEST_TIER_NAME[c.tier][locale === 'es' ? 'es' : 'en'] })}
                    </em>
                  </span>
                  <span className={`dyn-tag ${c.rewardIsNew ? 'dyn-tag--new' : 'dyn-tag--dup'}`}>
                    {c.rewardIsNew ? dc('newShort', locale) : dc('dupShort', locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="dyn-chests__fine">{dc('keysFine', locale, { time: formatDuration(rules.unlockSeconds, locale) })}</p>
    </div>
  );
}

function ChestRow({
  chest,
  status,
  now,
  keys,
  locale,
  unlockSeconds,
  slotBusy,
  shopAvailable,
  startUnlock,
  spendKey,
  onOpen,
  onShop,
}: {
  chest: DynastyChest;
  status: DynastyChest['status'];
  now: number;
  keys: number;
  locale: string;
  unlockSeconds: number;
  slotBusy: boolean;
  shopAvailable: boolean;
  startUnlock: Props['startUnlock'];
  spendKey: Props['spendKey'];
  onOpen: Props['onOpen'];
  onShop: Props['onShop'];
}) {
  const [busy, setBusy] = useState<'unlock' | 'key' | null>(null);
  const [confirmKey, setConfirmKey] = useState(false);
  const [failure, setFailure] = useState<DynastyFailure | null>(null);
  /** One id per key tap, reused by its retries: a dropped connection can never spend two keys. */
  const keyRequest = useRef<string | null>(null);
  const tierName = CHEST_TIER_NAME[chest.tier][locale === 'es' ? 'es' : 'en'];
  const remaining = chest.unlockEndsAt != null ? chest.unlockEndsAt - now : unlockSeconds * 1000;
  const progress = status === 'unlocking' ? 1 - Math.max(0, remaining) / (unlockSeconds * 1000) : status === 'ready' ? 1 : 0;
  const canKey = keys > 0 || shopAvailable;

  const doUnlock = async () => {
    if (busy) return;
    hapticLight();
    setBusy('unlock');
    setFailure(null);
    const res = await startUnlock(chest.id);
    setBusy(null);
    if (!res.ok) setFailure(res.reason ?? 'error');
  };

  const doKey = async () => {
    if (busy) return;
    if (keys < 1) {
      onShop();
      return;
    }
    hapticTap();
    setBusy('key');
    setFailure(null);
    keyRequest.current ??= newRequestId();
    const res = await spendKey(chest.id, keyRequest.current);
    setBusy(null);
    setConfirmKey(false);
    if (res.ok) {
      keyRequest.current = null;
      onOpen({ ...chest, status: 'ready' });
      return;
    }
    if (res.reason !== 'network') keyRequest.current = null;
    setFailure(res.reason ?? 'error');
  };

  return (
    <li className={`dyn-chest dyn-chest--${status}`} style={{ '--tier': CHEST_TIER_COLOR[chest.tier] } as CSSProperties}>
      <ChestArt chest={chestArtId(chest.tier)} className="dyn-chest__art" />
      <div className="dyn-chest__body">
        <div className="dyn-chest__head">
          <strong className="dyn-chest__name">{dc('chestName', locale, { tier: tierName })}</strong>
          <span className={`dyn-chest__status dyn-chest__status--${status}`}>{dc(`status_${status}` as DynastyCopyKey, locale)}</span>
        </div>

        {status === 'unlocking' ? (
          <div className="dyn-chest__timer">
            <span className="dyn-chest__time">{formatCountdown(remaining)}</span>
            <span className="dyn-chest__bar" aria-hidden>
              <span style={{ transform: `scaleX(${progress})` }} />
            </span>
          </div>
        ) : null}

        {failure ? (
          <p className="dyn-chest__error" role="status">
            {failure === 'unlock_busy'
              ? dc('slotBusy', locale)
              : failure === 'no_keys'
                ? dc('noKeys', locale)
                : failure === 'chest_ready'
                  ? dc('alreadyReady', locale)
                  : dc('actionFailed', locale)}
          </p>
        ) : null}

        <div className="dyn-chest__actions">
          {status === 'ready' ? (
            <button
              type="button"
              className="dyn-btn dyn-btn--primary dyn-chest__open"
              onClick={() => {
                hapticLight();
                onOpen(chest);
              }}
            >
              {dc('open', locale)}
            </button>
          ) : confirmKey ? (
            <>
              <button type="button" className="dyn-btn dyn-btn--key" disabled={busy != null} onClick={() => void doKey()}>
                <KeyIcon />
                {busy === 'key' ? dc('unlocking', locale) : dc('confirmKey', locale, { n: keys })}
              </button>
              <button type="button" className="dyn-btn dyn-btn--ghost dyn-btn--small" disabled={busy != null} onClick={() => setConfirmKey(false)}>
                {dc('cancel', locale)}
              </button>
            </>
          ) : (
            <>
              {status === 'waiting' ? (
                <button
                  type="button"
                  className="dyn-btn dyn-btn--free"
                  disabled={busy != null || slotBusy}
                  onClick={() => void doUnlock()}
                >
                  {busy === 'unlock'
                    ? dc('unlocking', locale)
                    : slotBusy
                      ? dc('slotBusyShort', locale)
                      : dc('unlockFree', locale, { time: formatDuration(unlockSeconds, locale) })}
                </button>
              ) : null}
              {canKey ? (
                <button
                  type="button"
                  className="dyn-btn dyn-btn--key"
                  disabled={busy != null}
                  onClick={() => {
                    hapticLight();
                    if (keys < 1) onShop();
                    else setConfirmKey(true);
                  }}
                >
                  <KeyIcon />
                  {dc('useKey', locale)}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
