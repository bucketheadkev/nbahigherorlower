'use client';

import type { CSSProperties } from 'react';
import {
  seriesForRound,
  type BracketSeriesState,
  type BracketTeam,
  type PlayoffBracketState,
} from '@/lib/tradeup/playoffBracket';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import type { UserConference } from '@/lib/tradeup/userTeam';

function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  if (raw.length < 6) return 0;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function displayAbbr(team: BracketTeam): string {
  const raw = (team.abbr || team.short || 'TBD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (raw.length >= 3) return raw.slice(0, 3);
  return raw.padEnd(3, 'X').slice(0, 3);
}

function orderedFirstRound(series: BracketSeriesState[]): BracketSeriesState[] {
  const rank = (s: BracketSeriesState) => {
    const seeds = [s.high.seed, s.low.seed].sort((a, b) => a - b);
    const key = `${seeds[0]}-${seeds[1]}`;
    const order = ['1-8', '4-5', '3-6', '2-7'];
    const index = order.indexOf(key);
    return index === -1 ? 99 : index;
  };
  return [...series].sort((a, b) => rank(a) - rank(b));
}

function TeamRow({
  team,
  seriesWins,
  out,
  empty,
}: {
  team?: BracketTeam;
  seriesWins?: number;
  out?: boolean;
  empty?: boolean;
}) {
  if (empty || !team) {
    return (
      <div className="pb-row pb-row--empty">
        <span className="pb-row__wins">–</span>
        <span className="pb-row__chip">
          <span className="pb-row__abbr">TBD</span>
          <span className="pb-row__seed">–</span>
        </span>
      </div>
    );
  }

  const colors = getTeamColors(team.colorKey);
  const light = luminance(colors.primary) > 0.55;
  const style = {
    '--slot-bg': colors.primary,
    '--slot-fg': light ? '#111111' : '#ffffff',
  } as CSSProperties;
  const record =
    typeof team.wins === 'number' && typeof team.losses === 'number'
      ? `${team.wins}–${team.losses}`
      : '';

  return (
    <div
      className={`pb-row${out ? ' is-out' : ''}${team.isUser ? ' is-user' : ''}`}
      style={style}
      title={team.label}
    >
      <span className="pb-row__wins">{seriesWins ?? 0}</span>
      <span className="pb-row__chip">
        <span className="pb-row__abbr">{displayAbbr(team)}</span>
        {record ? <span className="pb-row__record">{record}</span> : null}
        <span className="pb-row__seed">{team.seed}</span>
      </span>
    </div>
  );
}

function MatchupCard({ series }: { series: BracketSeriesState | null }) {
  if (!series) {
    return (
      <div className="pb-match pb-match--empty">
        <TeamRow empty />
        <TeamRow empty />
      </div>
    );
  }

  const highOut = series.status === 'complete' && series.winnerId !== series.high.id;
  const lowOut = series.status === 'complete' && series.winnerId !== series.low.id;
  const bothOut = highOut && lowOut;
  const isUser = series.high.isUser || series.low.isUser;
  const gone = series.status === 'complete' && !isUser;

  if (gone) {
    return (
      <div className="pb-match pb-match--cleared" aria-hidden>
        <p>Series complete</p>
      </div>
    );
  }

  return (
    <div
      className={`pb-match${isUser ? ' is-user' : ''}${
        series.status === 'active' ? ' is-live' : ''
      }${series.status === 'complete' ? ' is-complete' : ''}${bothOut ? ' is-cleared' : ''}`}
    >
      <TeamRow team={series.high} seriesWins={series.highWins} out={highOut} />
      <TeamRow team={series.low} seriesWins={series.lowWins} out={lowOut} />
    </div>
  );
}

interface PlayoffBracketViewProps {
  bracket: PlayoffBracketState;
  showFinals?: boolean;
}

export function PlayoffBracketView({
  bracket,
  showFinals = false,
}: PlayoffBracketViewProps) {
  const conference: UserConference = bracket.userConference;
  const finals = seriesForRound(bracket, 'Finals', 'nba_finals')[0] ?? null;
  const inFinals = showFinals || finals?.status === 'active' || finals?.status === 'complete';

  const r1 = orderedFirstRound(seriesForRound(bracket, conference, 'first_round'));
  const r2 = seriesForRound(bracket, conference, 'second_round');
  const cf = seriesForRound(bracket, conference, 'conference_finals');

  const rounds = [
    { key: 'r1', label: 'First Round', series: r1 },
    { key: 'r2', label: 'Conf. Semis', series: r2 },
    { key: 'cf', label: `${conference} Finals`, series: cf },
  ];

  return (
    <div
      className={`pb-bracket${inFinals ? ' pb-bracket--finals' : ''}`}
      aria-label={`${conference} playoff bracket`}
    >
      <p className="pb-bracket__conf">{conference}ern Conference</p>

      {rounds.map((round) => {
        const visible = round.series.filter((s) => {
          const isUser = s.high.isUser || s.low.isUser;
          if (s.status === 'complete' && !isUser) return false;
          return true;
        });
        if (visible.length === 0 && round.series.every((s) => s.status === 'complete')) {
          return null;
        }
        return (
          <section key={round.key} className="pb-round">
            <h3 className="pb-round__label">{round.label}</h3>
            <div className="pb-round__list">
              {(visible.length > 0 ? visible : round.series).map((series) => (
                <MatchupCard key={series.id} series={series} />
              ))}
            </div>
          </section>
        );
      })}

      {inFinals ? (
        <section className="pb-round pb-round--finals">
          <h3 className="pb-round__label">NBA Finals</h3>
          <div className="pb-round__list">
            <MatchupCard series={finals} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
