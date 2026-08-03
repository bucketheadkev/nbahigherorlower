'use client';

import { useEffect, useState } from 'react';
import { useSound } from '@/hooks/useSound';

export function SoundSettings() {
  const {
    muted,
    sfxVolume,
    musicMuted,
    musicVolume,
    hapticsEnabled,
    toggleMute,
    setSfxVolume,
    toggleMusicMute,
    setMusicVolume,
    toggleHaptics,
    resume,
  } = useSound();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="sound-settings">
      <button
        type="button"
        className="sound-settings__toggle tu-btn tu-btn--ghost"
        aria-expanded={open}
        aria-label={muted ? 'Sound settings, muted' : 'Sound settings'}
        onClick={() => {
          resume();
          setOpen((value) => !value);
        }}
      >
        {muted ? 'Sound Off' : 'Sound'}
      </button>

      {open ? (
        <div className="sound-settings__panel" role="dialog" aria-label="Sound settings">
          <label className="sound-settings__row">
            <span>Sound effects</span>
            <button
              type="button"
              className={`tu-btn tu-btn--secondary sound-settings__switch${muted ? '' : ' is-on'}`}
              onClick={() => {
                resume();
                toggleMute();
              }}
            >
              {muted ? 'Off' : 'On'}
            </button>
          </label>

          <label className="sound-settings__row">
            <span>SFX volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxVolume}
              disabled={muted}
              onChange={(event) => {
                resume();
                setSfxVolume(Number(event.target.value));
              }}
            />
          </label>

          <label className="sound-settings__row">
            <span>Music</span>
            <button
              type="button"
              className={`tu-btn tu-btn--secondary sound-settings__switch${musicMuted ? '' : ' is-on'}`}
              onClick={() => {
                resume();
                toggleMusicMute();
              }}
            >
              {musicMuted ? 'Off' : 'On'}
            </button>
          </label>

          <label className="sound-settings__row">
            <span>Music volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              disabled={musicMuted}
              onChange={(event) => {
                resume();
                setMusicVolume(Number(event.target.value));
              }}
            />
          </label>

          <label className="sound-settings__row">
            <span>Haptics</span>
            <button
              type="button"
              className={`tu-btn tu-btn--secondary sound-settings__switch${hapticsEnabled ? ' is-on' : ''}`}
              onClick={() => {
                resume();
                toggleHaptics();
              }}
            >
              {hapticsEnabled ? 'On' : 'Off'}
            </button>
          </label>
        </div>
      ) : null}
    </div>
  );
}
