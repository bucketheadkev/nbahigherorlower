'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { dynastyAccountKey, useDynasty } from '@/hooks/useDynasty';
import { useLocale } from '@/hooks/useLocale';
import type { DynastyFailure } from '@/lib/account/dynastyCloud';
import { previewRecordRun } from '@/lib/account/dynastyPreview';
import { collectiblesInLineup, type DynastyMatch } from '@/lib/tradeup/dynasty/catalog';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { hapticLight, hapticTap } from '@/lib/tradeup/haptics';
import { DynastyJersey, splitName } from './DynastyJersey';

/** Where the run's server verification stands (the Classic submit that records it). */
export type RunVerify = 'pending' | 'ok' | 'failed' | 'skipped';

interface Props {
  clientRunId: string;
  /** The finished lineup's player ids. */
  lineup: string[];
  runValue: number;
  verify: RunVerify;
  /** Results screen (after the earnings panel) or an unsigned run opened from Dynasty Road. */
  context: 'results' | 'road';
  onSignIn?: () => void;
}

const key = (m: { collection: { id: string }; slot: { playerId: string } }) => `${m.collection.id}:${m.slot.playerId}`;

/**
 * "Sign one player": shown after the normal $1B result, never in front of it. Lists the lineup's
 * Dynasty Road players, marks the ones already owned, and signs exactly one through the server.
 */
export function DynastySignOffer({ clientRunId, lineup, runValue, verify, context, onSignIn }: Props) {
  const { locale } = useLocale();
  const { state: account } = useAccountAuth();
  const accountKey = dynastyAccountKey(account);
  const dynasty = useDynasty(accountKey);
  const matches = useMemo(
    () => collectiblesInLineup(lineup).filter((m) => m.collection.kind === 'championship'),
    [lineup],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DynastyFailure | null>(null);
  const [result, setResult] = useState<{ match: DynastyMatch; completedNow: boolean } | null>(null);

  useEffect(() => {
    if (accountKey === 'dynasty-preview' && context === 'results') previewRecordRun(clientRunId, lineup, runValue);
  }, [accountKey, clientRunId, context, lineup, runValue]);

  const state = dynasty.state;
  const owned = useMemo(
    () => new Set((state?.owned ?? []).map((o) => `${o.collectionId}:${o.playerId}`)),
    [state],
  );
  const claim = state?.claims.find((c) => c.clientRunId === clientRunId) ?? null;
  const signed = result?.match ?? (claim ? matches.find((m) => m.collection.id === claim.collectionId && m.slot.playerId === claim.playerId) ?? null : null);

  if (matches.length === 0) return null;

  const guest = accountKey == null;
  const verified = accountKey === 'dynasty-preview' || verify === 'ok';
  // A timed-out submit may still have landed, so signing stays possible; the server decides.
  const waiting = !verified && verify === 'pending';
  const open = matches.filter((m) => !owned.has(key(m)));
  const loading = !guest && !state && dynasty.status !== 'error';

  const sign = async () => {
    const match = matches.find((m) => key(m) === picked);
    if (!match || busy) return;
    hapticTap();
    setBusy(true);
    setFailure(null);
    const res = await dynasty.sign(clientRunId, match.collection.id, match.slot.playerId);
    setBusy(false);
    if (res.ok) {
      setResult({ match, completedNow: res.data.completedNow });
      hapticLight();
      return;
    }
    const reason = res.reason ?? 'error';
    setFailure(reason);
    if (reason === 'already_claimed' || reason === 'already_owned') {
      setPicked(null);
      dynasty.refresh();
    }
  };

  let body: ReactNode;
  if (signed) {
    const have = signed.collection.slots.filter((s) => s.playerId === signed.slot.playerId || owned.has(`${signed.collection.id}:${s.playerId}`)).length;
    const completedNow = result?.completedNow ?? false;
    body = (
      <motion.div
        className={`dyn-signed${completedNow ? ' is-complete' : ''}`}
        style={colorVars(signed)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
      >
        <DynastyJersey name={signed.slot.name} colors={signed.collection.colors} look="owned" className="dyn-signed__jersey" />
        <div className="dyn-signed__copy">
          <span className="dyn-signed__kicker">
            <Check /> {dc('signedDone', locale)}
          </span>
          <strong>
            {dc('signedLine', locale, { name: signed.slot.name, team: `${signed.collection.season} ${signed.collection.team}` })}
          </strong>
          <span className="dyn-signed__progress">
            <Pips have={have} />
            {dc('progress', locale, { n: have })}
          </span>
          {completedNow ? (
            <span className="dyn-signed__complete">{dc('completeLine', locale, { team: `${signed.collection.season} ${signed.collection.team}` })}</span>
          ) : null}
        </div>
      </motion.div>
    );
  } else if (guest) {
    body = (
      <>
        <OptionRow matches={matches} owned={owned} picked={null} disabled onPick={() => undefined} locale={locale} />
        <p className="dyn-offer__note">{dc('offerGuest', locale)}</p>
        {onSignIn ? (
          <button type="button" className="dyn-btn dyn-btn--ghost" onClick={onSignIn}>
            {dc('guestCta', locale)}
          </button>
        ) : null}
      </>
    );
  } else if (claim) {
    body = <p className="dyn-offer__note">{dc('alreadyClaimed', locale)}</p>;
  } else {
    const pickedMatch = matches.find((m) => key(m) === picked) ?? null;
    const note =
      failure === 'run_not_found'
        ? dc('stillVerifying', locale)
        : failure === 'already_claimed'
          ? dc('alreadyClaimed', locale)
          : failure === 'unavailable'
            ? dc('unavailable', locale)
            : failure === 'account'
              ? dc('offerGuest', locale)
              : failure === 'not_eligible' || failure === 'not_qualified'
                ? dc('notVerified', locale)
                : failure
                  ? dc('saveFailed', locale)
                  : null;
    const allOwned = !loading && open.length === 0;
    body = (
      <>
        <OptionRow
          matches={matches}
          owned={owned}
          picked={picked}
          disabled={busy || loading || allOwned}
          onPick={(k) => {
            hapticLight();
            setFailure(null);
            setPicked((cur) => (cur === k ? null : k));
          }}
          locale={locale}
        />
        {allOwned ? (
          <p className="dyn-offer__note">{dc('allOwned', locale)}</p>
        ) : (
          <>
            {note ? <p className="dyn-offer__note is-warn" role="status">{note}</p> : null}
            <button
              type="button"
              className="dyn-btn dyn-btn--primary"
              disabled={!pickedMatch || busy || loading || waiting}
              onClick={() => void sign()}
            >
              {busy
                ? dc('signing', locale)
                : loading || waiting
                  ? dc('verifying', locale)
                  : pickedMatch
                    ? dc('signCta', locale, { name: splitName(pickedMatch.slot.name)[1].toUpperCase() })
                    : dc('pickPrompt', locale)}
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <section className={`dyn-offer dyn-offer--${context}`} aria-label={dc('offerTitle', locale)}>
      {context === 'results' ? (
        <header className="dyn-offer__head">
          <span className="dyn-offer__kicker">{dc('offerKicker', locale)}</span>
          <strong className="dyn-offer__title">{dc('offerTitle', locale)}</strong>
          {!signed ? <p className="dyn-offer__line">{dc('offerLine', locale)}</p> : null}
        </header>
      ) : null}
      {body}
    </section>
  );
}

function colorVars(m: DynastyMatch): CSSProperties {
  return {
    '--dyn-primary': m.collection.colors.primary,
    '--dyn-accent': m.collection.colors.accent,
    '--dyn-deep': m.collection.colors.deep,
  } as CSSProperties;
}

function OptionRow({
  matches,
  owned,
  picked,
  disabled,
  onPick,
  locale,
}: {
  matches: DynastyMatch[];
  owned: Set<string>;
  picked: string | null;
  disabled: boolean;
  onPick: (key: string) => void;
  locale: string;
}) {
  return (
    <ul className="dyn-offer__options">
      {matches.map((m) => {
        const k = key(m);
        const isOwned = owned.has(k);
        const isPicked = picked === k;
        const [first, last] = splitName(m.slot.name);
        return (
          <li key={k}>
            <button
              type="button"
              className={`dyn-opt${isOwned ? ' is-owned' : ''}${isPicked ? ' is-picked' : ''}`}
              style={colorVars(m)}
              disabled={disabled || isOwned}
              aria-pressed={isPicked}
              onClick={() => onPick(k)}
            >
              <DynastyJersey name={m.slot.name} colors={m.collection.colors} look="owned" className="dyn-opt__jersey" />
              <span className="dyn-opt__name">
                <em>{first}</em>
                <strong>{last}</strong>
              </span>
              <span className="dyn-opt__team">
                {m.collection.season} {m.collection.teamId}
              </span>
              {isOwned ? <span className="dyn-opt__tag">{dc('owned', locale)}</span> : null}
              {isPicked ? (
                <span className="dyn-opt__check" aria-hidden>
                  <Check />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Pips({ have, total = 5 }: { have: number; total?: number }) {
  return (
    <span className="dyn-pips" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < have ? 'is-on' : ''} />
      ))}
    </span>
  );
}

export function Check() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <path d="m3.2 8.4 3 3 6.6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
