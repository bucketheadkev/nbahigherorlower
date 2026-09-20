'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { GUIDE_NAV, type GuideId } from '@/lib/i18n/guides';
import { hapticTap } from '@/lib/tradeup/haptics';
import {
  getH2HUsername,
  isValidH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { deleteUserData } from '@/lib/account/deleteUserData';
import { SettingsGuidePage } from './SettingsGuidePage';
import { SettingsLegalPage, type LegalPageId } from './SettingsLegalPage';

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
  const [activeLegal, setActiveLegal] = useState<LegalPageId | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessOpen, setDeleteSuccessOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(getH2HUsername() ?? '');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeLegal) {
          setActiveLegal(null);
          return;
        }
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
  }, [open, editingName, activeGuide, activeLegal, deleteConfirmOpen, deleteBusy, deleteSuccessOpen]);

  /** Instant press — preventDefault avoids iOS ghost/click delay. */
  const press =
    (fn: () => void, opts?: { skipWhen?: () => boolean }) =>
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (opts?.skipWhen?.()) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

  const close = () => {
    setEditingName(false);
    setNameError(null);
    setActiveGuide(null);
    setActiveLegal(null);
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

  const deleteLock = useRef(false);
  const confirmDelete = () => {
    if (deleteBusy || deleteLock.current) return;
    deleteLock.current = true;
    setDeleteBusy(true);
    setDeleteError(null);
    void (async () => {
      const result = await deleteUserData();
      setDeleteBusy(false);
      if (result.ok === false) {
        deleteLock.current = false;
        setDeleteError(result.message);
        return;
      }
      setUsername('');
      setDeleteConfirmOpen(false);
      setEditingName(false);
      setNameError(null);
      setActiveGuide(null);
      setActiveLegal(null);
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
    setActiveLegal(null);
    setActiveGuide(id);
  };

  const openLegalPage = (id: LegalPageId) => {
    resume();
    hapticTap();
    setEditingName(false);
    setNameError(null);
    setActiveGuide(null);
    setActiveLegal(id);
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
      <section
        className="settings-drawer__section settings-drawer__section--feedback"
        aria-label="Feedback"
      >
        <p className="settings-drawer__section-label">Feedback</p>
        <div className="settings-drawer__card settings-drawer__card--feedback">
          <label className="sound-settings__row sound-settings__row--toggle sound-settings__row--sfx">
            <span className="sound-settings__row-icon sound-settings__row-icon--sfx" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 10v4h3l4 3V7L7 10H4z"
                  fill="currentColor"
                />
                <path
                  d="M15.5 8.5a4.5 4.5 0 0 1 0 7M17.8 6.2a7.5 7.5 0 0 1 0 11.6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="sound-settings__row-copy">
              <strong>Sound Effects</strong>
              <em>Tickets, rolls, and results</em>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={!muted}
              aria-label={muted ? 'Sound effects off' : 'Sound effects on'}
              className={`settings-ctrl sound-settings__toggle-track${muted ? '' : ' is-on'}`}
              onPointerDown={press(() => {
                resume();
                hapticTap();
                toggleMute();
              })}
            >
              <span className="sound-settings__toggle-knob" aria-hidden />
            </button>
          </label>

          <label className="sound-settings__row sound-settings__row--toggle sound-settings__row--haptics">
            <span className="sound-settings__row-icon sound-settings__row-icon--haptics" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect
                  x="8"
                  y="3"
                  width="8"
                  height="18"
                  rx="2.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M3.5 8v8M20.5 8v8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="sound-settings__row-copy">
              <strong>Haptics</strong>
              <em>Tap and lock feedback</em>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={hapticsEnabled}
              aria-label={hapticsEnabled ? 'Haptics on' : 'Haptics off'}
              className={`settings-ctrl sound-settings__toggle-track${hapticsEnabled ? ' is-on' : ''}`}
              onPointerDown={press(() => {
                resume();
                hapticTap();
                toggleHaptics();
              })}
            >
              <span className="sound-settings__toggle-knob" aria-hidden />
            </button>
          </label>
        </div>
      </section>

      <section
        className="settings-drawer__section settings-drawer__section--profile"
        aria-label="Profile"
      >
        <p className="settings-drawer__section-label">Profile</p>
        <button
          type="button"
          className="settings-ctrl sound-settings__nav-link sound-settings__nav-link--profile"
          onPointerDown={press(openNameModal)}
        >
          <span className="sound-settings__nav-copy">
            <em>Head-to-Head Name</em>
            <strong>{username || 'Set name'}</strong>
          </span>
          <span className="sound-settings__nav-chevron" aria-hidden>
            ›
          </span>
        </button>
      </section>

      <section
        className="settings-drawer__section settings-drawer__section--guides"
        role="group"
        aria-label={guideNav.guidesLabel}
      >
        <p className="settings-drawer__section-label">{guideNav.guidesLabel}</p>
        <div className="settings-drawer__tile-grid">
          <button
            type="button"
            className="settings-ctrl settings-tile settings-tile--guide"
            onPointerDown={press(() => openGuide('how-to-play'))}
          >
            <span className="settings-tile__icon settings-tile__icon--book" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 4.8A2.3 2.3 0 0 1 7.3 2.5h10.2c.8 0 1.5.7 1.5 1.5v15.2c0 .8-.7 1.5-1.5 1.5H7.3A2.3 2.3 0 0 0 5 23"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M5 4.8v15.4M9 7h6.5M9 10.5h6.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="settings-tile__label">{guideNav.howToPlay}</span>
          </button>
          <button
            type="button"
            className="settings-ctrl settings-tile settings-tile--guide"
            onPointerDown={press(() => openGuide('how-values-work'))}
          >
            <span className="settings-tile__icon settings-tile__icon--values" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" />
                <path
                  d="M12 7.2v9.6M9.2 9.2c.5-1 1.5-1.6 2.8-1.6 1.7 0 2.9.9 2.9 2.2S13.7 12 12 12s-2.9.8-2.9 2.2c0 1.3 1.2 2.2 2.9 2.2 1.3 0 2.3-.6 2.8-1.6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="settings-tile__label">{guideNav.howValues}</span>
          </button>
        </div>
      </section>

      <section
        className="settings-drawer__section settings-drawer__section--legal"
        role="group"
        aria-label="Legal"
      >
        <p className="settings-drawer__section-label">Account &amp; legal</p>
        <div className="settings-drawer__link-row">
          <button
            type="button"
            className="settings-ctrl settings-mini-link"
            onPointerDown={press(() => openLegalPage('privacy'))}
          >
            Privacy Policy
          </button>
          <span className="settings-mini-link__sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="settings-ctrl settings-mini-link"
            onPointerDown={press(() => openLegalPage('support'))}
          >
            Player Support
          </button>
        </div>
        <button
          type="button"
          className="settings-ctrl settings-mini-link settings-mini-link--danger"
          onPointerDown={press(openDeleteConfirm)}
        >
          Delete My Data
        </button>
      </section>
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
        className="settings-ctrl settings-name-modal__scrim"
        aria-label="Close"
        onPointerDown={press(closeNameModal)}
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
            placeholder=""
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
            className="settings-ctrl settings-name-modal__cancel"
            onPointerDown={press(closeNameModal)}
          >
            Cancel
          </button>
          <button type="submit" className="settings-ctrl settings-name-modal__save">
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
        className="settings-ctrl settings-name-modal__scrim"
        aria-label="Close"
        disabled={deleteBusy}
        onPointerDown={press(cancelDelete, { skipWhen: () => deleteBusy })}
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
            className="settings-ctrl settings-name-modal__cancel"
            disabled={deleteBusy}
            onPointerDown={press(cancelDelete, { skipWhen: () => deleteBusy })}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-ctrl settings-name-modal__save settings-name-modal__save--danger"
            disabled={deleteBusy}
            onPointerDown={press(confirmDelete, { skipWhen: () => deleteBusy })}
            onClick={confirmDelete}
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
        className="settings-ctrl settings-name-modal__scrim"
        aria-label="Close"
        onPointerDown={press(closeDeleteSuccess)}
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
            className="settings-ctrl settings-name-modal__save"
            onPointerDown={press(closeDeleteSuccess)}
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
          className="settings-ctrl sound-settings__gear"
          aria-expanded={open}
          aria-label="Settings"
          onPointerDown={press(() => {
            if (open) return;
            setOpen(true);
            setEditingName(false);
            setNameError(null);
            setActiveGuide(null);
            queueMicrotask(() => {
              resume();
              hapticTap();
            });
          })}
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
              className="settings-ctrl settings-drawer__scrim"
              aria-label="Close settings"
              onPointerDown={press(close)}
            />
            <aside className="settings-drawer__panel">
              <header className="settings-drawer__header">
                <div className="settings-drawer__title-block">
                  <p className="settings-drawer__eyebrow">1B RUN</p>
                  <h2>Settings</h2>
                </div>
                <button
                  type="button"
                  className="settings-ctrl settings-drawer__close"
                  aria-label="Close"
                  onPointerDown={press(close)}
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
            {activeLegal ? (
              <SettingsLegalPage
                pageId={activeLegal}
                onBack={() => setActiveLegal(null)}
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
        className="settings-ctrl sound-settings__toggle tu-btn tu-btn--ghost"
        aria-expanded={open}
        aria-label="Settings"
        onPointerDown={press(() => {
          resume();
          hapticTap();
          setOpen((value) => !value);
          setEditingName(false);
          setNameError(null);
        })}
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
      {activeLegal ? (
        <SettingsLegalPage
          pageId={activeLegal}
          onBack={() => setActiveLegal(null)}
        />
      ) : null}
    </div>
  );
}
