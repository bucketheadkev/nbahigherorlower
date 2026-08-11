'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAudioSettings,
  setHapticsEnabled,
  setMusicMuted,
  setMusicVolume,
} from '@/lib/tradeup/audioSettings';
import {
  playGameSound,
  preloadGameAudio,
  setGameSfxMuted,
  setGameSfxVolume,
  syncAudioSettings,
  unlockGameAudio,
  type GameSoundEvent,
} from '@/lib/tradeup/gameAudio';
import {
  hapticError,
  hapticMedium,
  hapticPlayerReveal,
  hapticSuccess,
  hapticTap,
  hapticWarning,
} from '@/lib/tradeup/haptics';

/**
 * Sound + haptics settings hook.
 * UI / navigation helpers are haptic-only — audio reserved for major moments.
 */
export function useSound() {
  const [muted, setMutedState] = useState(false);
  const [sfxVolume, setSfxVolumeState] = useState(0.55);
  const [musicMuted, setMusicMutedState] = useState(true);
  const [musicVolume, setMusicVolumeState] = useState(0.35);
  const [hapticsEnabled, setHapticsState] = useState(true);

  useEffect(() => {
    const settings = getAudioSettings();
    setMutedState(settings.sfxMuted);
    setSfxVolumeState(settings.sfxVolume);
    setMusicMutedState(settings.musicMuted);
    setMusicVolumeState(settings.musicVolume);
    setHapticsState(settings.hapticsEnabled);
    syncAudioSettings();
  }, []);

  const resume = useCallback(() => {
    unlockGameAudio();
    preloadGameAudio();
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      setGameSfxMuted(next);
      return next;
    });
  }, []);

  const setSfxVolume = useCallback((volume: number) => {
    setSfxVolumeState(volume);
    setGameSfxVolume(volume);
  }, []);

  const toggleMusicMute = useCallback(() => {
    setMusicMutedState((prev) => {
      const next = !prev;
      setMusicMuted(next);
      return next;
    });
  }, []);

  const setMusicVol = useCallback((volume: number) => {
    setMusicVolumeState(volume);
    setMusicVolume(volume);
  }, []);

  const toggleHaptics = useCallback(() => {
    setHapticsState((prev) => {
      const next = !prev;
      setHapticsEnabled(next);
      return next;
    });
  }, []);

  const play = useCallback(
    (event: GameSoundEvent, options?: { withCreditReward?: boolean }) => {
      playGameSound(event, options);
    },
    [],
  );

  const playTap = useCallback(() => {
    hapticTap();
  }, []);
  const playAccept = useCallback(() => {
    hapticTap();
  }, []);
  const playBankCoin = useCallback(() => {
    /* silent — haptic elsewhere if needed */
  }, []);
  const playReject = useCallback(() => {
    hapticError();
  }, []);
  const playCardFlip = useCallback(() => {
    hapticMedium();
  }, []);
  const playCardLift = useCallback(() => {
    hapticTap();
  }, []);
  const playCardLand = useCallback(() => {}, []);
  const playCardPickup = useCallback(() => {
    hapticTap();
  }, []);
  const playRevealImpact = useCallback(
    (_strength: 'standard' | 'strong' | 'elite' = 'standard') => {
      hapticPlayerReveal();
    },
    [],
  );
  const playLifeGain = useCallback(() => {}, []);
  const playLifeLost = useCallback(() => {
    hapticWarning();
  }, []);
  const playUnlock = useCallback(() => {}, []);
  const playSellCredits = useCallback(() => {}, []);
  const playAddCollection = useCallback(() => {}, []);
  const playSeasonSimulation = useCallback(() => {}, []);
  const playChampionship = useCallback(() => {
    play('victory');
    hapticSuccess();
  }, [play]);

  const playKeep = useCallback((_withCreditReward?: boolean) => {
    hapticMedium();
  }, []);

  const playTradeOpen = useCallback(() => {}, []);
  const playTradeComplete = useCallback(() => {
    hapticMedium();
  }, []);
  const playMarketReroll = useCallback(() => {
    hapticMedium();
  }, []);
  const playLineupComplete = useCallback(() => {
    hapticMedium();
  }, []);
  const playMatchmaking = useCallback(() => {}, []);
  const playOpponentFound = useCallback(() => {}, []);
  const playOpponentReveal = useCallback(() => {
    hapticPlayerReveal();
  }, []);
  const playMatchCalc = useCallback(() => {}, []);
  const playBattleRoundAppear = useCallback(() => {}, []);
  const playBattleCharge = useCallback(() => {}, []);
  const playBattleLunge = useCallback(() => {}, []);
  const playBattleSlap = useCallback(() => {
    hapticMedium();
  }, []);
  const playBattleKnockout = useCallback(() => {}, []);
  const playBattleCounter = useCallback(() => {}, []);
  const playBattleRoundWin = useCallback(() => {}, []);
  const playBattleRoundLoss = useCallback(() => {}, []);
  const playVictory = useCallback(() => {
    play('victory');
    hapticSuccess();
  }, [play]);
  const playPerfectSweep = useCallback(() => {
    play('perfect_sweep');
    hapticSuccess();
  }, [play]);
  const playDefeat = useCallback(() => {
    play('defeat');
    hapticWarning();
  }, [play]);
  const playTrophyGain = useCallback(() => {}, []);
  const playTrophyLoss = useCallback(() => {}, []);
  const playRankUp = useCallback(() => {
    hapticSuccess();
  }, []);
  const playRankDown = useCallback(() => {}, []);
  const playUiBack = useCallback(() => {
    hapticTap();
  }, []);
  const playCreditSpend = useCallback(() => {}, []);

  return {
    muted,
    sfxVolume,
    musicMuted,
    musicVolume,
    hapticsEnabled,
    toggleMute,
    setSfxVolume,
    toggleMusicMute,
    setMusicVolume: setMusicVol,
    toggleHaptics,
    resume,
    play,
    playKeep,
    playCardLift,
    playCardLand,
    playCardPickup,
    playTradeOpen,
    playTradeComplete,
    playMarketReroll,
    playLineupComplete,
    playMatchmaking,
    playOpponentFound,
    playOpponentReveal,
    playMatchCalc,
    playBattleRoundAppear,
    playBattleCharge,
    playBattleLunge,
    playBattleSlap,
    playBattleKnockout,
    playBattleCounter,
    playBattleRoundWin,
    playBattleRoundLoss,
    playVictory,
    playPerfectSweep,
    playDefeat,
    playTrophyGain,
    playTrophyLoss,
    playRankUp,
    playRankDown,
    playUiBack,
    playCreditSpend,
    playAccept,
    playBankCoin,
    playReject,
    playTap,
    playCardFlip,
    playRevealImpact,
    playLifeGain,
    playLifeLost,
    playUnlock,
    playSellCredits,
    playAddCollection,
    playSeasonSimulation,
    playChampionship,
  };
}
