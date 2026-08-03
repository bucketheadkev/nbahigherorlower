'use client';

import { useMemo, useState } from 'react';
import type { ChampionshipRing } from '@/lib/tradeup/achievements';
import { getRankProgress, RANK_LADDER } from '@/lib/tradeup/ranks';
import type {
  RankRecordHistoryEntry,
  TrophyHistoryEntry,
  TrophyProfile,
  TrophyTransaction,
} from '@/lib/tradeup/trophyStorage';
import { ChampionshipRingVisual } from './ChampionshipRingVisual';
import { HomeBackground } from './home/HomeBackground';
import { RankEmblem } from './RankEmblem';

type ProgressionTab = 'rank' | 'history' | 'rings' | 'lineups' | 'perks';

interface ProgressionScreenProps {
  profile: TrophyProfile;
  rings: ChampionshipRing[];
  onBack: () => void;
  initialTab?: ProgressionTab;
}

const TABS: Array<{ id: ProgressionTab; label: string }> = [
  { id: 'rank', label: 'Rank' },
  { id: 'history', label: 'Trophy History' },
  { id: 'rings', label: 'Rings' },
  { id: 'lineups', label: 'Perfect Lineups' },
  { id: 'perks', label: 'Perks' },
];

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function rankName(rankId: RankRecordHistoryEntry['rankId']): string {
  return RANK_LADDER.find((rank) => rank.id === rankId)?.name ?? rankId;
}

function HistoryRow({ entry }: { entry: TrophyHistoryEntry }) {
  if (entry.kind === 'rank_record') {
    return (
      <li className="progression-history__row is-rank-record">
        <span className="progression-history__kind">
          {entry.reason === 'promotion' ? 'Rank Complete' : 'Rank Reset'}
        </span>
        <span className="progression-history__delta">
          {entry.wins}–{entry.losses}
        </span>
        <span className="progression-history__total">{rankName(entry.rankId)}</span>
        <span className="progression-history__date">{formatWhen(entry.createdAt)}</span>
      </li>
    );
  }

  const tx = entry as TrophyTransaction;
  const win = tx.kind === 'win';
  return (
    <li className={`progression-history__row${win ? ' is-win' : ' is-loss'}`}>
      <span className="progression-history__kind">{win ? 'Victory' : 'Defeat'}</span>
      <span className="progression-history__delta">
        {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
      </span>
      <span className="progression-history__total">{tx.trophiesAfter} trophies</span>
      <span className="progression-history__date">{formatWhen(tx.createdAt)}</span>
    </li>
  );
}

export function ProgressionScreen({
  profile,
  rings,
  onBack,
  initialTab = 'rank',
}: ProgressionScreenProps) {
  const [tab, setTab] = useState<ProgressionTab>(initialTab);
  const progress = getRankProgress(profile.trophies);
  const highest =
    RANK_LADDER.find((rank) => rank.id === profile.highestRankId) ?? progress.rank;

  const perfectLineups = useMemo(
    () =>
      rings.map((ring) => ({
        id: ring.id,
        earnedAt: ring.earnedAt,
        lineup: ring.lineup,
      })),
    [rings],
  );

  return (
    <div className="tradeup-shell tradeup-shell--home achievements-shell progression-shell">
      <HomeBackground />

      <header className="achievements-header">
        <button type="button" className="tu-back" onClick={onBack}>
          ← Home
        </button>
        <p className="achievements-header__title">Progression</p>
        <span className="achievements-header__spacer" aria-hidden />
      </header>

      <nav className="progression-tabs" aria-label="Progression sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`progression-tabs__btn${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="achievements-locker progression-main">
        {tab === 'rank' ? (
          <section className="progression-rank">
            <RankEmblem rankId={progress.rank.id} size="hero" className="progression-rank__emblem" />
            <h1 className="progression-rank__name">{progress.rank.name}</h1>
            <p className="progression-rank__trophies">
              <span aria-hidden>🏆</span> {profile.trophies} Trophies
            </p>
            <div
              className="progression-rank__bar"
              role="progressbar"
              aria-valuenow={Math.round(progress.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.round(progress.progress * 100)}%` }} />
            </div>
            <p className="progression-rank__next">
              {progress.isMaxRank
                ? 'MAXIMUM RANK ACHIEVED'
                : `${progress.trophiesToNext} trophies until ${progress.nextRank?.name}`}
            </p>
            <p className="progression-rank__meta">
              Rank Record {profile.rankWins}–{profile.rankLosses}
              <span aria-hidden> · </span>
              Lifetime {profile.wins}–{profile.losses}
              <span aria-hidden> · </span>
              Peak {highest.name}
            </p>

            <ol className="progression-ladder" aria-label="Rank ladder">
              {RANK_LADDER.map((rank) => {
                const current = rank.id === progress.rank.id;
                const unlocked = profile.trophies >= rank.minTrophies;
                return (
                  <li
                    key={rank.id}
                    className={`progression-ladder__item${current ? ' is-current' : ''}${unlocked ? ' is-unlocked' : ''}`}
                  >
                    <RankEmblem
                      rankId={rank.id}
                      size="sm"
                      className="progression-ladder__emblem"
                    />
                    <span className="progression-ladder__name">{rank.name}</span>
                    <span className="progression-ladder__req">
                      {rank.maxTrophies == null
                        ? `${rank.minTrophies.toLocaleString()}+`
                        : `${rank.minTrophies.toLocaleString()}–${rank.maxTrophies.toLocaleString()}`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {tab === 'history' ? (
          <section className="progression-history">
            <h1 className="progression-section-title">Trophy History</h1>
            {profile.history.length === 0 ? (
              <p className="progression-empty">No matchups recorded yet. Finish a head-to-head to earn trophies.</p>
            ) : (
              <ul className="progression-history__list">
                {profile.history.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'rings' ? (
          <section className="achievements-hero progression-rings">
            <ChampionshipRingVisual size="lg" />
            <h1 className="achievements-hero__title">Ring Locker</h1>
            <p className="achievements-hero__sub">
              {rings.length === 0
                ? 'Legacy 82–0 rings are preserved here.'
                : `${rings.length} championship ${rings.length === 1 ? 'ring' : 'rings'} saved.`}
            </p>
            {rings.length === 0 ? (
              <p className="progression-empty">No championship rings yet.</p>
            ) : (
              <div className="achievements-grid" aria-label="Championship rings">
                {rings.map((ring, index) => (
                  <article key={ring.id} className="achievements-ring-card">
                    <div className="achievements-ring-card__visual">
                      <ChampionshipRingVisual size="md" />
                      <span className="achievements-ring-card__num">#{rings.length - index}</span>
                    </div>
                    <div className="achievements-ring-card__body">
                      <h2>Perfect Season</h2>
                      <p className="achievements-ring-card__record">82–0</p>
                      <p className="achievements-ring-card__date">{formatWhen(ring.earnedAt)}</p>
                      <ul className="achievements-ring-card__lineup">
                        {ring.lineup.map((name) => (
                          <li key={`${ring.id}-${name}`}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'lineups' ? (
          <section className="progression-lineups">
            <h1 className="progression-section-title">Perfect Lineups</h1>
            {perfectLineups.length === 0 ? (
              <p className="progression-empty">
                Saved perfect-season lineups will appear here. New 82–0 rings are not awarded in opponent mode.
              </p>
            ) : (
              <ul className="progression-lineups__list">
                {perfectLineups.map((entry) => (
                  <li key={entry.id} className="progression-lineups__card">
                    <p className="progression-lineups__date">{formatWhen(entry.earnedAt)}</p>
                    <ol>
                      {entry.lineup.map((name) => (
                        <li key={`${entry.id}-${name}`}>{name}</li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'perks' ? (
          <section className="progression-perks">
            <h1 className="progression-section-title">Perks</h1>
            <p className="progression-empty">
              Perk unlocks stay preserved for a future update. Rank and trophies do not reset them.
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
