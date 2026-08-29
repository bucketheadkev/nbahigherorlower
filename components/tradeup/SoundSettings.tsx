'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { GUIDE_NAV, type GuideId } from '@/lib/i18n/guides';
import { hapticTap } from '@/lib/tradeup/haptics';
import {
  getH2HUsername,
  isValidH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { SettingsGuidePage } from './SettingsGuidePage';

interface SoundSettingsProps {
  /** Compact gear on redesigned home; text toggle elsewhere. */
  variant?: 'gear' | 'text';
}

/**
 * Feedback settings — Sound Effects + Haptics (+ H2H username).
 * Gear variant opens a right-edge drawer.
 */
export function SoundSettings({ variant = 'text' }: SoundSettingsProps) {
  const {
    muted,
    hapticsEnabled,
    toggleMute,
    toggleHaptics,
    resume,
  } = useSound();
  const { locale } = useLocale();
  const guideNav = GUIDE_NAV[locale] ?? GUIDE_NAV.en;
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [activeGuide, setActiveGuide] = useState<GuideId | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(getH2HUsername() ?? '');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeGuide) {
          setActiveGuide(null);
          return;
        }
        if (editingName) {
          setEditingName(false);
          setNameError(null);
          return;
        }
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editingName, activeGuide]);

  const close = () => {
    setEditingName(false);
    setNameError(null);
    setActiveGuide(null);
    setOpen(false);
  };

  const openGuide = (id: GuideId) => {
    resume();
    hapticTap();
    setActiveGuide(id);
  };

  const closeNameModal = () => {
    setEditingName(false);
    setNameError(null);
  };

  const saveName = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isValidH2HUsername(draftName)) {
      setNameError('Use 2–16 letters or numbers.');
      return;
    }
    const saved = setH2HUsername(draftName);
    if (!saved) {
      setNameError('That name can’t be used.');
      return;
    }
    setUsername(saved);
    setEditingName(false);
    setNameError(null);
    hapticTap();
  };

  const openNameModal = () => {
    resume();
    hapticTap();
    setDraftName(username);
    setEditingName(true);
    setNameError(null);
  };

  const settingsBody = (
    <>
      <label className="sound-settings__row">
        <span>Sound Effects</span>
        <button
          type="button"
          className={`tu-btn tu-btn--secondary sound-settings__switch${muted ? '' : ' is-on'}`}
          onPointerDown={() => {
            resume();
            hapticTap();
            toggleMute();
          }}
        >
          {muted ? 'Off' : 'On'}
        </button>
      </label>

      <label className="sound-settings__row">
        <span>Haptics</span>
        <button
          type="button"
          className={`tu-btn tu-btn--secondary sound-settings__switch${hapticsEnabled ? ' is-on' : ''}`}
          onPointerDown={() => {
            resume();
            hapticTap();
            toggleHaptics();
          }}
        >
          {hapticsEnabled ? 'On' : 'Off'}
        </button>
      </label>

      <div className="sound-settings__row sound-settings__row--stack">
        <span>Head-to-Head Name</span>
        <button
          type="button"
          className="tu-btn tu-btn--secondary sound-settings__switch"
          onPointerDown={openNameModal}
        >
          {username || 'Set name'}
        </button>
      </div>

      <div className="sound-settings__guides" role="group" aria-label={guideNav.guidesLabel}>
        <p className="sound-settings__guides-label">{guideNav.guidesLabel}</p>
        <button
          type="button"
          className="sound-settings__nav-link"
          onPointerDown={() => openGuide('how-to-play')}
        >
          <span>{guideNav.howToPlay}</span>
          <span className="sound-settings__nav-chevron" aria-hidden>
            ›
          </span>
        </button>
        <button
          type="button"
          className="sound-settings__nav-link"
          onPointerDown={() => openGuide('how-values-work')}
        >
          <span>{guideNav.howValues}</span>
          <span className="sound-settings__nav-chevron" aria-hidden>
            ›
          </span>
        </button>
      </div>
    </>
  );

  const nameModal = editingName ? (
    <div
      className="settings-name-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Edit head-to-head name"
    >
      <button
        type="button"
        className="settings-name-modal__scrim"
        aria-label="Close"
        onPointerDown={closeNameModal}
      />
      <form className="settings-name-modal__card" onSubmit={saveName}>
        <p className="settings-name-modal__kicker">1V1</p>
        <h3 className="settings-name-modal__title">Head-to-Head Name</h3>
        <p className="settings-name-modal__copy">
          This is the name opponents will see.
        </p>
        <label className="settings-name-modal__field">
          <span>YOUR USERNAME</span>
          <input
            value={draftName}
            maxLength={16}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ClutchKev"
            onChange={(e) => {
              setDraftName(e.target.value);
              setNameError(null);
            }}
          />
        </label>
        {nameError ? <p className="settings-name-modal__error">{nameError}</p> : null}
        <div className="settings-name-modal__actions">
          <button
            type="button"
            className="settings-name-modal__cancel"
            onPointerDown={closeNameModal}
          >
            Cancel
          </button>
          <button type="submit" className="settings-name-modal__save">
            Save
          </button>
        </div>
      </form>
    </div>
  ) : null;

  if (variant === 'gear') {
    return (
      <div className="sound-settings sound-settings--ballion sound-settings--gear">
        <button
          type="button"
          className="sound-settings__gear"
          aria-expanded={open}
          aria-label="Settings"
          onPointerDown={(e) => {
            e.preventDefault();
            if (open) return;
            setOpen(true);
            setEditingName(false);
            setNameError(null);
            setActiveGuide(null);
            queueMicrotask(() => {
              resume();
              hapticTap();
            });
          }}
        >
          <svg
            className="sound-settings__gear-icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 7h14M5 12h14M5 17h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {open ? (
          <div className="settings-drawer" role="dialog" aria-modal="true" aria-label="Settings">
            <button
              type="button"
              className="settings-drawer__scrim"
              aria-label="Close settings"
              onPointerDown={close}
            />
            <aside className="settings-drawer__panel">
              <header className="settings-drawer__header">
                <h2>Settings</h2>
                <button
                  type="button"
                  className="settings-drawer__close"
                  aria-label="Close"
                  onPointerDown={close}
                >
                  ✕
                </button>
              </header>
              <div className="settings-drawer__body">{settingsBody}</div>
            </aside>
            {nameModal}
            {activeGuide ? (
              <SettingsGuidePage
                guideId={activeGuide}
                onBack={() => setActiveGuide(null)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sound-settings sound-settings--ballion">
      <button
        type="button"
        className="sound-settings__toggle tu-btn tu-btn--ghost"
        aria-expanded={open}
        aria-label="Settings"
        onPointerDown={() => {
          resume();
          hapticTap();
          setOpen((value) => !value);
          setEditingName(false);
          setNameError(null);
        }}
      >
        Settings
      </button>

      {open ? (
        <div className="sound-settings__panel" role="dialog" aria-label="Settings">
          {settingsBody}
        </div>
      ) : null}
      {nameModal}
      {activeGuide ? (
        <SettingsGuidePage
          guideId={activeGuide}
          onBack={() => setActiveGuide(null)}
        />
      ) : null}
    </div>
  );
}
