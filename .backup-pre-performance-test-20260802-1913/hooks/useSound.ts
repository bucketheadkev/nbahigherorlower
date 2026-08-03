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
  hapticMedium,
  hapticPlayerReveal,
  hapticSuccess,
  hapticTap,
} from '@/lib/tradeup/haptics';

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
    play('ui_press');
    hapticTap();
  }, [play]);
  const playAccept = useCallback(() => {
    play('ui_confirm');
    hapticTap();
  }, [play]);
  const playBankCoin = useCallback(() => play('bank_coin'), [play]);
  const playReject = useCallback(() => {
    play('reject');
    hapticTap();
  }, [play]);
  const playCardFlip = useCallback(() => {
    play('card_flip');
    hapticMedium();
  }, [play]);
  const playCardLift = useCallback(() => {
    play('card_lift');
    hapticTap();
  }, [play]);
  const playCardLand = useCallback(() => play('card_land'), [play]);
  const playCardPickup = useCallback(() => {
    play('card_lift');
    hapticTap();
  }, [play]);
  const playRevealImpact = useCallback(
    (strength: 'standard' | 'strong' | 'elite' = 'standard') => {
      if (strength === 'elite' || strength === 'strong') {
        play('reveal_hidden_s');
        hapticPlayerReveal();
      } else {
        hapticPlayerReveal();
      }
    },
    [play],
  );
  const playLifeGain = useCallback(() => play('credit_reward'), [play]);
  const playLifeLost = useCallback(() => play('reject'), [play]);
  const playUnlock = useCallback(() => play('unlock'), [play]);
  /** Retired for Keep — kept for store/collection only. */
  const playSellCredits = useCallback(() => play('credit_reward'), [play]);
  const playAddCollection = useCallback(() => play('collect'), [play]);
  const playSeasonSimulation = useCallback(() => play('match_calc'), [play]);
  const playChampionship = useCallback(() => {
    play('victory');
    hapticSuccess();
  }, [play]);

  const playKeep = useCallback((withCreditReward: boolean) => {
    play(withCreditReward ? 'keep' : 'keep_lock', { withCreditReward });
    hapticMedium();
  }, [play]);

  const playTradeOpen = useCallback(() => play('trade_open'), [play]);
  const playTradeComplete = useCallback(() => {
    play('trade_complete');
    hapticMedium();
  }, [play]);
  const playMarketReroll = useCallback(() => play('market_reroll'), [play]);
  const playLineupComplete = useCallback(() => play('lineup_complete'), [play]);
  const playMatchmaking = useCallback(() => play('matchmaking'), [play]);
  const playOpponentFound = useCallback(() => play('opponent_found'), [play]);
  const playOpponentReveal = useCallback(() => {
    play('opponent_reveal');
    hapticPlayerReveal();
  }, [play]);
  const playMatchCalc = useCallback(() => play('match_calc'), [play]);
  const playBattleRoundAppear = useCallback(() => play('battle_round_appear'), [play]);
  const playBattleCharge = useCallback(() => play('battle_charge'), [play]);
  const playBattleLunge = useCallback(() => play('battle_lunge'), [play]);
  const playBattleSlap = useCallback(() => {
    play('battle_slap');
    hapticMedium();
  }, [play]);
  const playBattleKnockout = useCallback(() => play('battle_knockout'), [play]);
  const playBattleCounter = useCallback(() => play('battle_counter'), [play]);
  const playBattleRoundWin = useCallback(() => play('battle_round_win'), [play]);
  const playBattleRoundLoss = useCallback(() => play('battle_round_loss'), [play]);
  const playVictory = useCallback(() => {
    play('victory');
    hapticSuccess();
  }, [play]);
  const playPerfectSweep = useCallback(() => {
    play('perfect_sweep');
    hapticSuccess();
  }, [play]);
  const playDefeat = useCallback(() => play('defeat'), [play]);
  const playTrophyGain = useCallback(() => play('trophy_gain'), [play]);
  const playTrophyLoss = useCallback(() => play('trophy_loss'), [play]);
  const playRankUp = useCallback(() => {
    play('rank_up');
    hapticSuccess();
  }, [play]);
  const playRankDown = useCallback(() => play('rank_down'), [play]);
  const playUiBack = useCallback(() => {
    play('ui_back');
    hapticTap();
  }, [play]);
  const playCreditSpend = useCallback(() => play('credit_spend'), [play]);

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
