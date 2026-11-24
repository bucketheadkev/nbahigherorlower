'use client';

import type { MouseEventHandler, PointerEventHandler } from 'react';
import { useXpProfile } from '@/hooks/useXpProfile';
import { SoundSettings, type SettingsLink } from '../SoundSettings';
import { HomeCoinChip } from './HomeCoinChip';
import { HomeProfileMark } from './HomeProfileMark';
import { HomeProfileXp } from './HomeProfileXp';

interface HomeHubTopChromeProps {
  profileLabel: string;
  username: string;
  coinsLabel: string;
  coinPlusLabel: string;
  menuLinks: SettingsLink[];
  menuLinksLabel: string;
  onProfile: MouseEventHandler<HTMLButtonElement>;
  onProfilePointerDown?: PointerEventHandler<HTMLButtonElement>;
  onCoinPlus?: MouseEventHandler<HTMLButtonElement>;
  onCoinPlusPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

/**
 * Shared hub top chrome — identical markup/spacing on Home · Leaderboard · Shop.
 */
export function HomeHubTopChrome({
  profileLabel,
  username,
  coinsLabel,
  coinPlusLabel,
  menuLinks,
  menuLinksLabel,
  onProfile,
  onProfilePointerDown,
  onCoinPlus,
  onCoinPlusPointerDown,
}: HomeHubTopChromeProps) {
  const { coins, progress } = useXpProfile();

  return (
    <header className="home-hub-top home-hub-top--live rh5-top" aria-label="Player status">
      <div className="rh5-player">
        <HomeProfileMark
          label={profileLabel}
          onClick={onProfile}
          onPointerDown={onProfilePointerDown}
        />
        <div className="rh5-player__meta">
          <p className="rh5-player__name" title={username}>
            {username}
          </p>
          <HomeProfileXp progress={progress} />
        </div>
      </div>
      <div className="rh5-toolbar">
        <HomeCoinChip
          value={coins}
          label={coinsLabel}
          plusLabel={coinPlusLabel}
          onPlus={onCoinPlus}
          onPlusPointerDown={onCoinPlusPointerDown}
        />
        <SoundSettings variant="gear" links={menuLinks} linksLabel={menuLinksLabel} />
      </div>
    </header>
  );
}
