'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { FFailure, FState } from '@/lib/account/franchiseV5Cloud';
import { FC, tx } from '@/lib/tradeup/franchise/copy';
import { fmtCash } from '@/lib/tradeup/franchise/format';
import { teamCardStyle } from '@/lib/tradeup/franchise/teamCards';
import { hapticLight } from '@/lib/tradeup/haptics';
import { TEAMS } from '@/lib/tradeup/teams';
import { ArenaBackdrop } from './ArenaParts';
import { BackButton, BankChip } from './FranchiseChrome';

type Conference = 'all' | 'East' | 'West';

interface TeamRow {
  id: string;
  city: string;
  name: string;
  fullName: string;
  conference: string;
  price: number;
  search: string;
  style: CSSProperties;
}

/** A purchase button ignores taps this soon after its sheet appears (a stray second tap). */
const ARM_MS = 250;

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const TeamTile = memo(function TeamTile({
  team,
  owned,
  selected,
  locale,
  onPick,
}: {
  team: TeamRow;
  owned: boolean;
  selected: boolean;
  locale: string;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`fx-tile${selected ? ' is-selected' : ''}${owned ? ' is-owned' : ''}`}
      style={team.style}
      onClick={() => onPick(team.id)}
      aria-label={`${team.fullName}, ${fmtCash(team.price)}${owned ? `, ${tx(FC.owned, locale)}` : ''}`}
    >
      <span className="fx-tile__mark" aria-hidden>
        {team.id}
      </span>
      <span className="fx-tile__city">{team.city}</span>
      <span className="fx-tile__name">{team.name}</span>
      <span className="fx-tile__foot">
        <span className="fx-tile__price">{fmtCash(team.price)}</span>
        {owned ? <span className="fx-tile__owned">{tx(FC.owned, locale)}</span> : null}
      </span>
    </button>
  );
});

export function FranchiseSelect({
  state,
  locale,
  guest,
  onBack,
  onBuy,
  onGoHome,
  onSignIn,
}: {
  state: FState;
  locale: string;
  /** Not signed in: browse freely, buying asks for an account. */
  guest: boolean;
  onBack: () => void;
  onBuy: (teamId: string) => Promise<FFailure | null>;
  onGoHome: () => void;
  onSignIn: () => void;
}) {
  const [query, setQuery] = useState('');
  const [conf, setConf] = useState<Conference>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(0);
  const deferred = useDeferredValue(query);

  const rows = useMemo<TeamRow[]>(() => {
    const price = new Map(state.franchises.map((f) => [f.teamId, f.price]));
    const order = new Map(state.franchises.map((f, i) => [f.teamId, i]));
    return TEAMS.filter((t) => price.has(t.id))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
      .map((t) => ({
        id: t.id,
        city: t.city,
        name: t.name,
        fullName: t.fullName,
        conference: t.conference,
        price: price.get(t.id) ?? 0,
        search: fold(`${t.fullName} ${t.city} ${t.name} ${t.id}`),
        style: teamCardStyle(t.id),
      }));
  }, [state.franchises]);

  const visible = useMemo(() => {
    const q = fold(deferred.trim());
    return rows.filter((r) => (conf === 'all' || r.conference === conf) && (!q || r.search.includes(q)));
  }, [rows, deferred, conf]);

  const pick = useCallback((teamId: string) => {
    hapticLight();
    openedAt.current = performance.now();
    setError(null);
    setSelected(teamId);
  }, []);

  const close = useCallback(() => {
    if (!busy) setSelected(null);
  }, [busy]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, close]);

  const team = rows.find((r) => r.id === selected) ?? null;
  const owned = state.owned;
  const isMine = owned?.teamId === team?.id;
  const credit = owned && !isMine ? owned.resaleValue : 0;
  const shortBy = team ? Math.max(0, team.price - state.bank - credit) : 0;
  const ownedTeam = owned ? TEAMS.find((t) => t.id === owned.teamId) : null;

  const buy = async () => {
    if (!team || busy || shortBy > 0 || isMine) return;
    if (performance.now() - openedAt.current < ARM_MS) return;
    setBusy(true);
    setError(null);
    const failure = await onBuy(team.id);
    setBusy(false);
    if (failure) {
      setError(
        failure === 'insufficient'
          ? tx(FC.needMore, locale, { amount: fmtCash(shortBy || 1) })
          : failure === 'offline'
            ? tx(FC.offline, locale)
            : tx(FC.errorGeneric, locale),
      );
    }
  };

  return (
    <div className="fx-screen fx-select">
      <ArenaBackdrop banners={false} />
      <header className="fx-select__head">
        <div className="fx-topbar">
          <BackButton label={tx(FC.back, locale)} onClick={onBack} />
          <BankChip amount={state.bank} />
        </div>
        <div className="fx-heading">
          <h1 className="fx-title">{tx(FC.chooseTitle, locale)}</h1>
          <p className="fx-sub">{tx(FC.chooseSub, locale)}</p>
        </div>
        <div className="fx-filter">
          <label className="fx-search">
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m13 13 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={tx(FC.search, locale)}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tx(FC.search, locale)}
            />
            {query ? (
              <button type="button" className="fx-search__clear" aria-label="Clear" onClick={() => setQuery('')}>
                ×
              </button>
            ) : null}
          </label>
          <div className="fx-seg" role="radiogroup">
            {(['all', 'East', 'West'] as Conference[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={conf === c} className={conf === c ? 'is-on' : ''} onClick={() => setConf(c)}>
                {c === 'all' ? tx(FC.all, locale) : c === 'East' ? tx(FC.east, locale) : tx(FC.west, locale)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="fx-scroll fx-grid-scroll">
        <div className="fx-grid">
          {visible.map((t) => (
            <TeamTile key={t.id} team={t} owned={owned?.teamId === t.id} selected={selected === t.id} locale={locale} onPick={pick} />
          ))}
        </div>
        {visible.length === 0 ? <p className="fx-empty">{tx(FC.noMatch, locale, { q: query.trim() })}</p> : null}
      </div>

      {team ? (
        <div className="fx-sheet-wrap" role="dialog" aria-modal="true" aria-label={team.fullName}>
          <button type="button" className="fx-scrim" aria-label={tx(FC.backToTeams, locale)} onClick={close} />
          <div className="fx-sheet fx-preview">
            <div className="fx-preview__banner" style={team.style}>
              <span className="fx-tile__mark" aria-hidden>
                {team.id}
              </span>
              <span className="fx-preview__city">{team.city}</span>
              <span className="fx-preview__name">{team.name}</span>
              {isMine ? <span className="fx-tile__owned">{tx(FC.owned, locale)}</span> : null}
            </div>
            <dl className="fx-ledger">
              <div>
                <dt>{tx(FC.franchisePrice, locale)}</dt>
                <dd>{fmtCash(team.price)}</dd>
              </div>
              <div>
                <dt>{tx(FC.yourBank, locale)}</dt>
                <dd className={!isMine && shortBy > 0 ? 'is-short' : 'is-ok'}>{fmtCash(state.bank)}</dd>
              </div>
              {credit > 0 && ownedTeam ? (
                <div>
                  <dt>{tx(FC.saleCredit, locale, { team: ownedTeam.name.toUpperCase() })}</dt>
                  <dd className="is-ok">+{fmtCash(credit)}</dd>
                </div>
              ) : null}
            </dl>
            {isMine ? (
              <>
                <p className="fx-note">{tx(FC.ownedNote, locale)}</p>
                <button type="button" className="fx-btn fx-btn--primary" onClick={onGoHome}>
                  {tx(FC.goHome, locale)}
                </button>
              </>
            ) : guest ? (
              <button type="button" className="fx-btn fx-btn--primary" onClick={onSignIn}>
                {tx(FC.signInToBuy, locale)}
              </button>
            ) : (
              <>
                {owned ? <p className="fx-note">{tx(FC.oneAtATime, locale)}</p> : null}
                {shortBy > 0 ? <p className="fx-note is-short">{tx(FC.needMore, locale, { amount: fmtCash(shortBy) })}</p> : null}
                {error ? <p className="fx-note is-short">{error}</p> : null}
                <button type="button" className="fx-btn fx-btn--primary" disabled={busy || shortBy > 0} onClick={buy}>
                  {busy
                    ? tx(FC.buying, locale)
                    : `${owned ? tx(FC.switchFranchise, locale) : tx(FC.buyFranchise, locale)} · ${fmtCash(team.price)}`}
                </button>
              </>
            )}
            <button type="button" className="fx-link" onClick={close}>
              {tx(FC.backToTeams, locale)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
