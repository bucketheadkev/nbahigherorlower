'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
import { deleteUserData } from '@/lib/account/deleteUserData';

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
  const router = useRouter();
  const { locale } = useLocale();
  const guideNav = GUIDE_NAV[locale] ?? GUIDE_NAV.en;
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [activeGuide, setActiveGuide] = useState<GuideId | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessOpen, setDeleteSuccessOpen] = useState(false);

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
        if (deleteConfirmOpen) {
          if (!deleteBusy) setDeleteConfirmOpen(false);
          return;
        }
        if (deleteSuccessOpen) {
          setDeleteSuccessOpen(false);
          return;
        }
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editingName, activeGuide, deleteConfirmOpen, deleteBusy, deleteSuccessOpen]);

  const close = () => {
    setEditingName(false);
    setNameError(null);
    setActiveGuide(null);
    setDeleteConfirmOpen(false);
    setOpen(false);
  };

  const openDeleteConfirm = () => {
    resume();
    hapticTap();
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
  };

  const confirmDelete = () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    void (async () => {
      const result = await deleteUserData();
      setDeleteBusy(false);
      if (result.ok === false) {
        setDeleteError(result.message);
        return;
      }
      setUsername('');
      setDeleteConfirmOpen(false);
      setEditingName(false);
      setNameError(null);
      setActiveGuide(null);
      setDeleteSuccessOpen(true);
      hapticTap();
    })();
  };

  const closeDeleteSuccess = () => {
    setDeleteSuccessOpen(false);
    setOpen(false);
  };

  const openGuide = (id: GuideId) => {
    resume();
    hapticTap();
    setActiveGuide(id);
  };

  const openLegalPage = (path: '/privacy' | '/support') => {
    resume();
    hapticTap();
    setEditingName(false);
    setNameError(null);
    setActiveGuide(null);
    setOpen(false);
    router.push(path);
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

      <div className="sound-settings__guides" role="group" aria-label="Legal">
        <p className="sound-settings__guides-label">Legal</p>
        <button
          type="button"
          className="sound-settings__nav-link"
          onPointerDown={() => openLegalPage('/privacy')}
        >
          <span>Privacy Policy</span>
          <span className="sound-settings__nav-chevron" aria-hidden>
            ›
          </span>
        </button>
        <button
          type="button"
          className="sound-settings__nav-link"
          onPointerDown={() => openLegalPage('/support')}
        >
          <span>Support</span>
          <span className="sound-settings__nav-chevron" aria-hidden>
            ›
          </span>
        </button>
        <button
          type="button"
          className="sound-settings__nav-link sound-settings__nav-link--danger"
          onPointerDown={openDeleteConfirm}
        >
          <span>Delete My Data</span>
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

  const deleteModal = deleteConfirmOpen ? (
    <div
      className="settings-name-modal settings-delete-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="settings-delete-title"
      aria-describedby="settings-delete-desc"
    >
      <button
        type="button"
        className="settings-name-modal__scrim"
        aria-label="Close"
        disabled={deleteBusy}
        onPointerDown={() => {
          if (!deleteBusy) cancelDelete();
        }}
      />
      <div className="settings-name-modal__card">
        <p className="settings-name-modal__kicker">Legal</p>
        <h3 id="settings-delete-title" className="settings-name-modal__title">
          Delete My Data?
        </h3>
        <p id="settings-delete-desc" className="settings-name-modal__copy">
          This permanently deletes your multiplayer identity, display name, game progress,
          preferences, and other data associated with this installation. This cannot be undone.
        </p>
        {deleteError ? (
          <p className="settings-name-modal__error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="settings-name-modal__actions">
          <button
            type="button"
            className="settings-name-modal__cancel"
            disabled={deleteBusy}
            onPointerDown={() => {
              if (!deleteBusy) cancelDelete();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-name-modal__save settings-name-modal__save--danger"
            disabled={deleteBusy}
            onPointerDown={confirmDelete}
          >
            {deleteBusy ? 'Deleting…' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const deleteSuccessModal = deleteSuccessOpen ? (
    <div
      className="settings-name-modal settings-success-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="settings-delete-success-title"
      aria-describedby="settings-delete-success-desc"
    >
      <button
        type="button"
        className="settings-name-modal__scrim"
        aria-label="Close"
        onPointerDown={closeDeleteSuccess}
      />
      <div className="settings-name-modal__card">
        <p className="settings-name-modal__kicker settings-name-modal__kicker--success">Success</p>
        <h3 id="settings-delete-success-title" className="settings-name-modal__title">
          Your data has been deleted
        </h3>
        <p id="settings-delete-success-desc" className="settings-name-modal__copy">
          A new anonymous session was created. You can keep playing.
        </p>
        <div className="settings-name-modal__actions settings-name-modal__actions--single">
          <button
            type="button"
            className="settings-name-modal__save"
            onPointerDown={closeDeleteSuccess}
          >
            OK
          </button>
        </div>
      </div>
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
            {activeGuide ? (
              <SettingsGuidePage
                guideId={activeGuide}
                onBack={() => setActiveGuide(null)}
              />
            ) : null}
          </div>
        ) : null}
        {nameModal}
        {deleteModal}
        {deleteSuccessModal}
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
      {deleteModal}
      {deleteSuccessModal}
      {activeGuide ? (
        <SettingsGuidePage
          guideId={activeGuide}
          onBack={() => setActiveGuide(null)}
        />
      ) : null}
    </div>
  );
}
