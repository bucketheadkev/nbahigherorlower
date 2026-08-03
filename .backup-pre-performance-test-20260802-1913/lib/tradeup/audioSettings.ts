/** Persisted SFX / music preferences — separate from mute for volume control. */

const MUTE_KEY = 'tradeup_muted';
const SFX_VOLUME_KEY = 'tradeup_sfx_volume_v1';
const MUSIC_MUTE_KEY = 'tradeup_music_muted_v1';
const MUSIC_VOLUME_KEY = 'tradeup_music_volume_v1';
const HAPTICS_KEY = 'tradeup_haptics_v1';

export interface AudioSettings {
  sfxMuted: boolean;
  sfxVolume: number;
  musicMuted: boolean;
  musicVolume: number;
  hapticsEnabled: boolean;
}

const DEFAULTS: AudioSettings = {
  sfxMuted: false,
  sfxVolume: 0.55,
  musicMuted: true,
  musicVolume: 0.35,
  hapticsEnabled: true,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function getAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const sfxMuted = localStorage.getItem(MUTE_KEY) === '1';
    const sfxRaw = Number(localStorage.getItem(SFX_VOLUME_KEY));
    const musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) !== '0';
    const musicRaw = Number(localStorage.getItem(MUSIC_VOLUME_KEY));
    const haptics = localStorage.getItem(HAPTICS_KEY);
    return {
      sfxMuted,
      sfxVolume: Number.isFinite(sfxRaw) ? clamp01(sfxRaw) : DEFAULTS.sfxVolume,
      musicMuted,
      musicVolume: Number.isFinite(musicRaw) ? clamp01(musicRaw) : DEFAULTS.musicVolume,
      hapticsEnabled: haptics === null ? DEFAULTS.hapticsEnabled : haptics !== '0',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSfxMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function setSfxVolume(volume: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SFX_VOLUME_KEY, String(clamp01(volume)));
}

export function setMusicMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MUSIC_MUTE_KEY, muted ? '1' : '0');
}

export function setMusicVolume(volume: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MUSIC_VOLUME_KEY, String(clamp01(volume)));
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HAPTICS_KEY, enabled ? '1' : '0');
}
