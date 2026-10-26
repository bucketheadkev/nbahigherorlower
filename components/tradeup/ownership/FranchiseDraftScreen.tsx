'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import {
  confirmFranchiseLineup,
  moveFranchisePlayer,
  pickFranchisePlayer,
  spinFranchiseDraft,
  type FranchiseCycle,
  type FranchiseListing,
  type FranchisePick,
} from '@/lib/account/franchiseCloud';
import { formatCash } from '@/lib/tradeup/bank';
import { getDollarValue, type DecadeEra, type SpinPair } from '@/lib/tradeup/billionDollar';
import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';
import type { SyncedH2HPick } from '@/lib/tradeup/h2hDraftBridge';
import { hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { holdInterruptions } from '@/lib/tradeup/interruptions';
import { CYCLE_HOURS, fanPowerMilli, hourlyPay } from '@/lib/tradeup/ownership/config';
import { rosterFans } from '@/lib/tradeup/ownership/fans';
import { TEAMS } from '@/lib/tradeup/teams';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { Position } from '@/lib/tradeup/types';
import { BillionTradeEngine } from '../BillionTradeEngine';
import { TickerNumber } from '../onboarding/ticker';
import { Crest, FansIcon, formatFans, FranchiseRosterCards, PayFormula, teamTheme } from './FranchiseParts';

type Copy = { en: string; es: string };

const COPY = {
  close: { en: '← Franchises', es: '← Franquicias' },
  goal: { en: 'Draft five for the {team}', es: 'Arma cinco para los {team}' },
  review: { en: 'ROSTER PREVIEW', es: 'VISTA DEL QUINTETO' },
  fans: { en: 'FANS', es: 'FANS' },
  perHour: { en: '/ HOUR', es: '/ HORA' },
  lockNote: {
    en: 'Locks for {hours} hours. Paychecks land every hour — even while you’re away.',
    es: 'Queda fijo por {hours} horas. Cobras cada hora, aunque no estés.',
  },
  lock: { en: 'LOCK IN ROSTER', es: 'FIJAR QUINTETO' },
  locking: { en: 'LOCKING IN…', es: 'FIJANDO…' },
  failed: { en: 'Couldn’t save that. Try again.', es: 'No se pudo guardar. Intenta de nuevo.' },
} satisfies Record<string, Copy>;

const money = (value: number) => formatCash(value);

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), text);
}

function toPair(spin: { teamId: string; era: string } | null): SpinPair | null {
  const team = spin ? TEAMS.find((t) => t.id === spin.teamId) : null;
  return team && spin ? { team, era: spin.era as DecadeEra } : null;
}

function eraOf(playerId: string): string {
  return /^hist_(\d{4}s)_/.exec(playerId)?.[1] ?? '2020s';
}

/** Server pick → the 1V1/engine sync shape (the engine prices seats itself from the same catalog). */
function toSynced(p: FranchisePick): SyncedH2HPick | null {
  const player = getHistPlayerById(p.playerId);
  if (!player) return null;
  return {
    position: p.slot as H2HPosition,
    raw_value: p.value,
    selection: {
      name: player.name,
      position: p.slot as H2HPosition,
      teamId: player.teamId,
      teamName: TEAMS.find((t) => t.id === player.teamId)?.fullName ?? player.teamId,
      era: eraOf(player.id),
      dollarValue: p.value,
      playerId: player.id,
      primarySlot: player.primaryPosition as H2HPosition,
      baseDollarValue: Math.round(getDollarValue(player)),
    },
  };
}

export function FranchiseDraftScreen({
  listing,
  pricePaid,
  cycle,
  onCycle,
  onClose,
}: {
  listing: FranchiseListing;
  pricePaid: number;
  cycle: FranchiseCycle;
  onCycle: (cycle: FranchiseCycle) => void;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;
  /** The spin present when the draft opened — resumed straight into the picker. */
  const [pendingSpin] = useState(() => toPair(cycle.spin));

  useEffect(() => {
    setMounted(true);
    return holdInterruptions();
  }, []);

  const synced = useMemo(
    () => cycle.picks.map(toSynced).filter((p): p is SyncedH2HPick => p != null),
    [cycle.picks],
  );

  const resolveRoll = useCallback(async (): Promise<SpinPair | null> => {
    setError(null);
    const result = await spinFranchiseDraft(cycleRef.current.id);
    if (result.ok === false || !result.data.spin) {
      setError(pick(COPY.failed, locale));
      return null;
    }
    onCycle(result.data);
    return toPair(result.data.spin);
  }, [locale, onCycle]);

  const onLock = useCallback(
    async (position: H2HPosition, selection: { playerId: string }) => {
      setError(null);
      const result = await pickFranchisePlayer(cycleRef.current.id, selection.playerId, position as Position);
      if (result.ok === false) {
        setError(pick(COPY.failed, locale));
        throw new Error(result.reason);
      }
      onCycle(result.data);
    },
    [locale, onCycle],
  );

  const onMove = useCallback(
    async (from: H2HPosition, to: H2HPosition) => {
      setError(null);
      const result = await moveFranchisePlayer(cycleRef.current.id, from as Position, to as Position);
      if (result.ok === false) {
        setError(pick(COPY.failed, locale));
        throw new Error(result.reason);
      }
      onCycle(result.data);
    },
    [locale, onCycle],
  );

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    hapticTap();
    const result = await confirmFranchiseLineup(cycleRef.current.id);
    setBusy(false);
    if (result.ok === false) {
      setError(pick(COPY.failed, locale));
      return;
    }
    hapticSuccess();
    onCycle(result.data);
    onClose();
  };

  const full = cycle.picks.length >= 5;
  const fans = rosterFans(cycle.picks);
  const hourly = hourlyPay(pricePaid, fans);

  const review = full ? (
    <section className="frd-review" style={teamTheme(listing.teamId)} aria-label={pick(COPY.review, locale)}>
      <header className="frd-review__head">
        <Crest teamId={listing.teamId} className="frd-review__crest" />
        <div>
          <p className="frd-review__kicker">{pick(COPY.review, locale)}</p>
          <p className="frd-review__team">{listing.name}</p>
        </div>
      </header>
      <FranchiseRosterCards teamId={listing.teamId} picks={cycle.picks} />
      <div className="frd-review__fans">
        <p className="frd-review__count">
          <FansIcon className="frd-review__icon" />
          <TickerNumber value={fans} from={0} duration={1100} format={formatFans} />
          <span className="frd-review__word">{pick(COPY.fans, locale)}</span>
        </p>
        <p className="frd-review__rate">
          +<TickerNumber value={hourly} from={0} duration={1100} format={money} />
          <span className="fx-fans__per">{pick(COPY.perHour, locale)}</span>
        </p>
      </div>
      <PayFormula pricePaid={pricePaid} fans={fans} powerMilli={fanPowerMilli(fans)} hourly={hourly} />
      <p className="frd-review__note">{fill(pick(COPY.lockNote, locale), { hours: CYCLE_HOURS })}</p>
      <button type="button" className="frd-review__lock" disabled={busy} onClick={() => void confirm()}>
        {busy ? pick(COPY.locking, locale) : pick(COPY.lock, locale)}
      </button>
      {error ? (
        <p className="fx-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  ) : null;

  if (!mounted) return null;
  return createPortal(
    <div className="frd-host" role="dialog" aria-modal="true" aria-label={listing.name}>
      <BillionTradeEngine
        challengeMode="franchise"
        franchise={{
          pendingSpin,
          resolveRoll,
          exitLabel: pick(COPY.close, locale),
          goal: fill(pick(COPY.goal, locale), { team: listing.name }),
          review,
        }}
        syncedPicks={synced}
        deferOnlineReveal
        onlineDraftError={error}
        onPickLock={onLock}
        onPickMove={onMove}
        onExit={onClose}
      />
    </div>,
    document.body,
  );
}
