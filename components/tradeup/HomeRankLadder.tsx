'use client';

import { useMemo } from 'react';
import { getRankIndex, getRankProgress, RANK_LADDER } from '@/lib/tradeup/ranks';
import type { TrophyProfile } from '@/lib/tradeup/trophyStorage';
import { RankEmblem } from './RankEmblem';

interface HomeRankLadderProps {
  profile: TrophyProfile;
  onOpenProgression: () => void;
}

export function HomeRankLadder({ profile, onOpenProgression }: HomeRankLadderProps) {
  const progress = useMemo(() => getRankProgress(profile.trophies), [profile.trophies]);
  const currentIndex = getRankIndex(progress.rank.id);

  return (
    <section className="home-rank-ladder" aria-label="Rank progression">
      <div className="home-rank-ladder__head">
        <p className="home-rank-ladder__eyebrow">Rank Path</p>
        <button type="button" className="home-rank-ladder__details" onClick={onOpenProgression}>
          Details
        </button>
      </div>

      <div className="home-rank-ladder__track" role="list">
        {RANK_LADDER.map((rank, index) => {
          const isCurrent = rank.id === progress.rank.id;
          const isCleared = index < currentIndex;
          const isLocked = index > currentIndex;

          return (
            <button
              key={rank.id}
              type="button"
              role="listitem"
              className={[
                'home-rank-ladder__item',
                isCurrent ? 'is-current' : '',
                isCleared ? 'is-cleared' : '',
                isLocked ? 'is-locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={onOpenProgression}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`${rank.name}${isCurrent ? ', current rank' : isCleared ? ', cleared' : ', locked'}`}
            >
              {isCurrent ? <span className="home-rank-ladder__current-tag">Current</span> : null}
              {isCleared ? <span className="home-rank-ladder__cleared-dot" aria-hidden /> : null}
              <span className="home-rank-ladder__emblem-wrap">
                <RankEmblem rankId={rank.id} size="md" />
              </span>
              <span className="home-rank-ladder__name is-visible">{rank.name}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="home-rank-ladder__status"
        onClick={onOpenProgression}
        aria-label={`${progress.rank.name}, ${profile.trophies} trophies. Open progression.`}
      >
        <RankEmblem rankId={progress.rank.id} size="md" className="home-rank-ladder__status-emblem" />
        <span className="home-rank-ladder__status-copy">
          <strong>{progress.rank.name}</strong>
          <span>
            {profile.trophies.toLocaleString()} trophies
            {progress.isMaxRank
              ? ' · Max rank'
              : ` · ${progress.trophiesToNext} to ${progress.nextRank?.name}`}
          </span>
        </span>
        <span
          className="home-rank-ladder__status-bar"
          role="progressbar"
          aria-valuenow={Math.round(progress.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.round(progress.progress * 100)}%` }} />
        </span>
      </button>
    </section>
  );
}
