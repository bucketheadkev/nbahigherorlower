'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { signOutAccount } from '@/lib/account/accountAuth';
import { deleteUserData } from '@/lib/account/deleteUserData';
import { requestIntroReplay } from '@/lib/account/howItWorksStorage';
import { ONEB_SOCIALS } from '@/lib/brand/socials';
import { openExternal } from '@/lib/brand/openExternal';
import { GUIDE_NAV, type GuideId } from '@/lib/i18n/guides';
import { hapticTap } from '@/lib/tradeup/haptics';
import {
  getH2HUsername,
  isValidH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { HomeProfileMark } from './home/HomeProfileMark';
import { SettingsGuidePage } from './SettingsGuidePage';
import { SettingsLegalPage, type LegalPageId } from './SettingsLegalPage';

export interface SettingsLink {
  id: string;
  label: string;
  value: string;
  onSelect: () => void;
}

interface SoundSettingsProps {
  /** Compact gear on redesigned home; text toggle elsewhere. */
  variant?: 'gear' | 'text';
  /** Kept for host compatibility — account opens from the profile card. */
  links?: SettingsLink[];
  linksLabel?: string;
}

type MenuScreen = 'menu' | 'settings';

function formatJoined(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.getUTCDate().toString().padStart(2, '0');
  const mon = d
    .toLocaleString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'short', timeZone: 'UTC' })
    .replace(/\./g, '')
    .toUpperCase();
  const year = d.getUTCFullYear();
  return `${day} ${mon} ${year}`;
}

function Chevron() {
  return <span className="sm-row__chevron" aria-hidden>›</span>;
}

/** Filled official-style marks — no box chrome. */
function SocialGlyph({ id }: { id: (typeof ONEB_SOCIALS)[number]['id'] }) {
  switch (id) {
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          {/* Inset so the note stem isn’t clipped at the top edge */}
          <g transform="translate(1.15 1.2) scale(0.9)">
            <path
              fill="currentColor"
              d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .56.04.82.13V9.4a6.27 6.27 0 0 0-.82-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.95a8.21 8.21 0 0 0 4.76 1.51V7.01a4.85 4.85 0 0 1-1.95-.92 4.83 4.83 0 0 1-1.05-.4Z"
            />
          </g>
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm6.1-8.15a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0ZM12 3.5c-2.32 0-2.61.01-3.52.05-.9.04-1.52.19-2.06.4a4.16 4.16 0 0 0-1.5.98 4.16 4.16 0 0 0-.98 1.5c-.21.54-.36 1.16-.4 2.06C3.51 9.39 3.5 9.68 3.5 12s.01 2.61.05 3.52c.04.9.19 1.52.4 2.06.22.57.51 1.05.98 1.5.45.47.93.76 1.5.98.54.21 1.16.36 2.06.4.91.04 1.2.05 3.52.05s2.61-.01 3.52-.05c.9-.04 1.52-.19 2.06-.4a4.16 4.16 0 0 0 1.5-.98 4.16 4.16 0 0 0 .98-1.5c.21-.54.36-1.16.4-2.06.04-.91.05-1.2.05-3.52s-.01-2.61-.05-3.52c-.04-.9-.19-1.52-.4-2.06a4.16 4.16 0 0 0-.98-1.5 4.16 4.16 0 0 0-1.5-.98c-.54-.21-1.16-.36-2.06-.4C14.61 3.51 14.32 3.5 12 3.5Zm0 1.53c2.28 0 2.55.01 3.44.05.83.04 1.28.18 1.58.29.4.16.68.34.98.64.3.3.48.58.64.98.12.3.25.75.29 1.58.04.9.05 1.16.05 3.44s-.01 2.55-.05 3.44c-.04.83-.18 1.28-.29 1.58-.16.4-.34.68-.64.98-.3.3-.58.48-.98.64-.3.12-.75.25-1.58.29-.9.04-1.16.05-3.44.05s-2.55-.01-3.44-.05c-.83-.04-1.28-.18-1.58-.29a2.63 2.63 0 0 1-.98-.64 2.63 2.63 0 0 1-.64-.98c-.12-.3-.25-.75-.29-1.58-.04-.9-.05-1.16-.05-3.44s.01-2.55.05-3.44c.04-.83.18-1.28.29-1.58.16-.4.34-.68.64-.98.3-.3.58-.48.98-.64.3-.12.75-.25 1.58-.29.9-.04 1.16-.05 3.44-.05Z"
          />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M17.6 3.5h2.9l-6.35 7.26L21.5 20.5h-5.4l-4.23-5.53L6.9 20.5H4l6.8-7.77L2.7 3.5h5.54l3.82 5.05L17.6 3.5Zm-1.02 15.3h1.61L7.54 5.12H5.81l10.77 13.68Z"
          />
        </svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M19.27 5.33A16.1 16.1 0 0 0 15.2 4.2l-.2.36a14.8 14.8 0 0 1 3.5 1.35 12.7 12.7 0 0 0-11 0A14.8 14.8 0 0 1 8.9 4.56l-.14-.2A16 16 0 0 0 4.72 5.33C1.95 9.5 1.25 13.56 1.6 17.56a16.3 16.3 0 0 0 4.96 2.52l.4-.7a10.6 10.6 0 0 1-1.56-.75l.38-.3a11.7 11.7 0 0 0 10.44 0l.38.3c-.5.3-1.02.55-1.56.75l.4.7a16.3 16.3 0 0 0 4.96-2.52c.5-4.7-.55-8.72-2.57-12.23ZM8.68 14.86c-.95 0-1.73-.88-1.73-1.96s.76-1.96 1.73-1.96 1.75.88 1.73 1.96-.76 1.96-1.73 1.96Zm6.64 0c-.95 0-1.73-.88-1.73-1.96s.76-1.96 1.73-1.96 1.73.88 1.73 1.96-.78 1.96-1.73 1.96Z"
          />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Gear opens the main menu; Settings is a nested page.
 * Feedback + account + guides + legal stay fully wired.
 */
export function SoundSettings({ variant = 'text' }: SoundSettingsProps) {
  const { muted, hapticsEnabled, toggleMute, toggleHaptics, resume } = useSound();
  const { locale, setLocale, t } = useLocale();
  const { state: account, setState: setAccountState } = useAccountAuth();
  const guideNav = GUIDE_NAV[locale] ?? GUIDE_NAV.en;
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<MenuScreen>('menu');
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
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountSheetView, setAccountSheetView] = useState<AccountSheetView>('menu');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(getH2HUsername() ?? '');
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
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
      if (signOutConfirmOpen) {
        if (!signOutBusy) setSignOutConfirmOpen(false);
        return;
      }
      if (deleteSuccessOpen) {
        setDeleteSuccessOpen(false);
        return;
      }
      if (accountSheetOpen) {
        setAccountSheetOpen(false);
        return;
      }
      if (screen === 'settings') {
        setScreen('menu');
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    open,
    editingName,
    activeGuide,
    activeLegal,
    deleteConfirmOpen,
    deleteBusy,
    signOutConfirmOpen,
    signOutBusy,
    deleteSuccessOpen,
    accountSheetOpen,
    screen,
  ]);

  const press =
    (fn: () => void, opts?: { skipWhen?: () => boolean }) =>
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
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
    setSignOutConfirmOpen(false);
    setAccountSheetOpen(false);
    setStatusMsg(null);
    setScreen('menu');
    setOpen(false);
  };

  const openDeleteConfirm = () => {
    resume();
    hapticTap();
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  };

  const cancelDelete = () => setDeleteConfirmOpen(false);

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
      setNameError(t('settings.nameErrorChars'));
      return;
    }
    const saved = setH2HUsername(draftName);
    if (!saved) {
      setNameError(t('settings.nameErrorTaken'));
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

  const openAccount = (view: AccountSheetView) => {
    resume();
    hapticTap();
    setAccountSheetView(view);
    setAccountSheetOpen(true);
  };

  const openSignOutConfirm = () => {
    resume();
    hapticTap();
    setStatusMsg(null);
    setSignOutConfirmOpen(true);
  };

  const cancelSignOut = () => {
    if (signOutBusy) return;
    setSignOutConfirmOpen(false);
  };

  const confirmSignOut = () => {
    if (signOutBusy) return;
    setSignOutBusy(true);
    setStatusMsg(null);
    void (async () => {
      const result = await signOutAccount();
      setSignOutBusy(false);
      if (result.ok === false) {
        setStatusMsg(result.message);
        return;
      }
      setSignOutConfirmOpen(false);
      setAccountState(result.state);
      hapticTap();
    })();
  };

  const permanent = account.status === 'permanent';
  const displayName = permanent
    ? account.profile.username
    : account.status === 'loading'
      ? '…'
      : t('settings.guest');
  const joined = permanent ? formatJoined(account.profile.created_at, locale) : null;

  const menuBody = (
    <div className="sm-scroll">
      <section className="sm-card sm-card--profile" aria-label={t('settings.menu')}>
        <div className="sm-profile">
          <span className="sm-avatar-mark" aria-hidden>
            <HomeProfileMark label="" />
          </span>
          <div className="sm-profile__meta">
            <p className="sm-profile__name">
              <span>{displayName}</span>
              {permanent ? (
                <button
                  type="button"
                  className="sm-profile__edit"
                  aria-label={t('settings.editName')}
                  onClick={press(openNameModal)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M4 16.8V20h3.2L18.6 8.6l-3.2-3.2L4 16.8z" />
                    <path d="M13.9 6.1l3.2 3.2" />
                  </svg>
                </button>
              ) : null}
            </p>
            <p className="sm-profile__sub">
              {permanent && joined ? (
                <span>{t('settings.joined', { date: joined })}</span>
              ) : (
                <span>{t('settings.signInHint')}</span>
              )}
            </p>
          </div>
        </div>
        {!permanent ? (
          <button
            type="button"
            className="sm-profile__cta"
            onClick={press(() => openAccount('signup'))}
          >
            {t('settings.createAccount')}
            <span aria-hidden>›</span>
          </button>
        ) : null}
      </section>

      <section aria-label={t('settings.playSection')}>
        <p className="sm-label">{t('settings.playSection')}</p>
        <div className="sm-card">
          <button type="button" className="sm-row" onClick={press(() => openGuide('how-to-play'))}>
            <span className="sm-row__icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.2" />
                <path d="M12 10.5V17M12 7.2h.01" />
              </svg>
            </span>
            <span className="sm-row__label">{guideNav.howToPlay}</span>
            <Chevron />
          </button>
          <button type="button" className="sm-row" onClick={press(() => openGuide('how-values-work'))}>
            <span className="sm-row__icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.2" />
                <path d="M12 7.2v9.6M9.2 9.2c.5-1 1.5-1.6 2.8-1.6 1.7 0 2.9.9 2.9 2.2S13.7 12 12 12s-2.9.8-2.9 2.2c0 1.3 1.2 2.2 2.9 2.2 1.3 0 2.3-.6 2.8-1.6" />
              </svg>
            </span>
            <span className="sm-row__label">{guideNav.howValues}</span>
            <Chevron />
          </button>
          <button
            type="button"
            className="sm-row"
            onClick={press(() => {
              resume();
              hapticTap();
              setScreen('settings');
              setStatusMsg(null);
            })}
          >
            <span className="sm-row__icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M5 8h14M5 12h14M5 16h14" />
              </svg>
            </span>
            <span className="sm-row__label">{t('settings.title')}</span>
            <Chevron />
          </button>
          <button type="button" className="sm-row" onClick={press(() => openLegalPage('support'))}>
            <span className="sm-row__icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M4.5 7.5h15v10.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V7.5z" />
                <path d="M4.5 7.5l7.5 5.4 7.5-5.4" />
              </svg>
            </span>
            <span className="sm-row__label">{t('settings.contactUs')}</span>
            <Chevron />
          </button>
        </div>
      </section>

      <div className="sm-socials" aria-label={t('settings.socials')}>
        {ONEB_SOCIALS.map((social) => (
          <button
            key={social.id}
            type="button"
            className="sm-social"
            aria-label={social.label}
            onClick={press(() => {
              resume();
              hapticTap();
              void openExternal(social.href);
            })}
          >
            <SocialGlyph id={social.id} />
          </button>
        ))}
      </div>

      {permanent ? (
        <button type="button" className="sm-signout" onClick={press(openSignOutConfirm)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M10 5.5H6.8A2.3 2.3 0 0 0 4.5 7.8v8.4A2.3 2.3 0 0 0 6.8 18.5H10" />
            <path d="M14.5 8.5 18.5 12l-4 3.5M18.2 12H10" />
          </svg>
          {t('settings.signOut')}
        </button>
      ) : (
        <button
          type="button"
          className="sm-signout sm-signout--guest"
          onClick={press(() => openAccount('login'))}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M10 5.5H6.8A2.3 2.3 0 0 0 4.5 7.8v8.4A2.3 2.3 0 0 0 6.8 18.5H10" />
            <path d="M13.5 8.5 9.5 12l4 3.5M9.8 12H18" />
          </svg>
          {t('settings.logIn')}
        </button>
      )}
      {statusMsg && screen === 'menu' ? <p className="sm-toast">{statusMsg}</p> : null}
    </div>
  );

  const settingsBody = (
    <div className="sm-scroll">
      <section className="sm-card sm-pref" aria-label="Preferences">
        <div className="sm-row" role="group" aria-label={t('settings.language')}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.2" />
              <path d="M3.8 12h16.4M12 3.8c2.2 2.2 2.2 14.2 0 16.4M12 3.8c-2.2 2.2-2.2 14.2 0 16.4" />
            </svg>
          </span>
          <span className="sm-row__label">{t('settings.language')}</span>
          <div className="settings-lang" role="radiogroup" aria-label={t('settings.language')}>
            {(['en', 'es'] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={locale === code}
                aria-label={code === 'en' ? 'English' : 'Español'}
                className={`settings-ctrl settings-lang__opt${locale === code ? ' is-active' : ''}`}
                onClick={press(() => {
                  if (locale === code) return;
                  resume();
                  hapticTap();
                  setLocale(code);
                })}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="sm-row" role="group" aria-label={t('settings.soundEffects')}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M4.5 10v4h3.2L12 17.2V6.8L7.7 10H4.5z" />
              <path d="M15.2 9a3.8 3.8 0 0 1 0 6M17.4 7a6.2 6.2 0 0 1 0 10" />
            </svg>
          </span>
          <span className="sm-row__label">{t('settings.soundEffects')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            aria-label={muted ? t('settings.soundOff') : t('settings.soundOn')}
            className={`settings-ctrl sound-settings__toggle-track${muted ? '' : ' is-on'}`}
            onClick={press(() => {
              resume();
              hapticTap();
              toggleMute();
            })}
          >
            <span className="sound-settings__toggle-knob" aria-hidden />
          </button>
        </div>

        <div className="sm-row" role="group" aria-label={t('settings.haptics')}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <rect x="8" y="3.5" width="8" height="17" rx="2.2" />
              <path d="M4 8.5v7M20 8.5v7" />
            </svg>
          </span>
          <span className="sm-row__label">{t('settings.haptics')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={hapticsEnabled}
            aria-label={hapticsEnabled ? t('settings.hapticsOn') : t('settings.hapticsOff')}
            className={`settings-ctrl sound-settings__toggle-track${hapticsEnabled ? ' is-on' : ''}`}
            onClick={press(() => {
              resume();
              hapticTap();
              toggleHaptics();
            })}
          >
            <span className="sound-settings__toggle-knob" aria-hidden />
          </button>
        </div>
      </section>

      <section className="sm-card" aria-label={t('settings.legal')}>
        <button type="button" className="sm-row" onClick={press(openNameModal)}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="9" r="3.2" />
              <path d="M5.5 18.5c1.3-2.8 3.5-4.2 6.5-4.2s5.2 1.4 6.5 4.2" />
            </svg>
          </span>
          <span className="sm-row__label">
            {t('settings.h2hName')}
            {username ? ` · ${username}` : ''}
          </span>
          <Chevron />
        </button>
        <button
          type="button"
          className="sm-row"
          onClick={press(() => {
            resume();
            hapticTap();
            close();
            requestIntroReplay();
          })}
        >
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.8h3.8" />
            </svg>
          </span>
          <span className="sm-row__label">{guideNav.replayIntro}</span>
          <Chevron />
        </button>
        <button type="button" className="sm-row" onClick={press(() => openLegalPage('privacy'))}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13.2L12 16.8 5.5 19.2V6A1.5 1.5 0 0 1 7 4.5z" />
            </svg>
          </span>
          <span className="sm-row__label">{t('settings.privacy')}</span>
          <Chevron />
        </button>
        <button type="button" className="sm-row" onClick={press(() => openLegalPage('support'))}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M4.5 7.5h15v10.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V7.5z" />
              <path d="M4.5 7.5l7.5 5.4 7.5-5.4" />
            </svg>
          </span>
          <span className="sm-row__label">{t('settings.support')}</span>
          <Chevron />
        </button>
      </section>

      {statusMsg && screen === 'settings' ? (
        <p className={`sm-toast${statusMsg.includes('restored') ? ' sm-toast--ok' : ' sm-toast--err'}`}>
          {statusMsg}
        </p>
      ) : null}

      <section className="sm-card sm-card--danger" aria-label={t('settings.deleteAccount')}>
        <button type="button" className="sm-row sm-row--danger" onClick={press(openDeleteConfirm)}>
          <span className="sm-row__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M5.5 8h13M9.5 8V6.2A1.2 1.2 0 0 1 10.7 5h2.6a1.2 1.2 0 0 1 1.2 1.2V8M7.2 8l.8 11h8l.8-11" />
            </svg>
          </span>
          <span className="sm-row__label">{t('settings.deleteAccount')}</span>
          <Chevron />
        </button>
      </section>
    </div>
  );

  const nameModal = editingName ? (
    <div
      className="settings-name-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.editName')}
    >
      <button
        type="button"
        className="settings-ctrl settings-name-modal__scrim"
        aria-label={t('settings.close')}
        onClick={press(closeNameModal)}
      />
      <form className="settings-name-modal__card" onSubmit={saveName}>
        <p className="settings-name-modal__kicker">1V1</p>
        <h3 className="settings-name-modal__title">{t('settings.h2hNameTitle')}</h3>
        <p className="settings-name-modal__copy">{t('settings.h2hNameCopy')}</p>
        <label className="settings-name-modal__field">
          <span>{t('settings.h2hUsername')}</span>
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
            onClick={press(closeNameModal)}
          >
            {t('settings.cancel')}
          </button>
          <button type="submit" className="settings-ctrl settings-name-modal__save">
            {t('settings.save')}
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
        aria-label={t('settings.close')}
        disabled={deleteBusy}
        onClick={press(cancelDelete, { skipWhen: () => deleteBusy })}
      />
      <div className="settings-name-modal__card">
        <p className="settings-name-modal__kicker">{t('settings.legal')}</p>
        <h3 id="settings-delete-title" className="settings-name-modal__title">
          {t('settings.deleteTitle')}
        </h3>
        <p id="settings-delete-desc" className="settings-name-modal__copy">
          {t('settings.deleteCopy')}
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
            onClick={press(cancelDelete, { skipWhen: () => deleteBusy })}
          >
            {t('settings.cancel')}
          </button>
          <button
            type="button"
            className="settings-ctrl settings-name-modal__save settings-name-modal__save--danger"
            disabled={deleteBusy}
            onClick={press(confirmDelete, { skipWhen: () => deleteBusy })}
          >
            {deleteBusy ? t('settings.deleting') : t('settings.deleteConfirm')}
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
        aria-label={t('settings.close')}
        onClick={press(closeDeleteSuccess)}
      />
      <div className="settings-name-modal__card">
        <p className="settings-name-modal__kicker settings-name-modal__kicker--success">OK</p>
        <h3 id="settings-delete-success-title" className="settings-name-modal__title">
          {t('settings.deleteSuccessTitle')}
        </h3>
        <p id="settings-delete-success-desc" className="settings-name-modal__copy">
          {t('settings.deleteSuccessCopy')}
        </p>
        <div className="settings-name-modal__actions settings-name-modal__actions--single">
          <button
            type="button"
            className="settings-ctrl settings-name-modal__save"
            onClick={press(closeDeleteSuccess)}
          >
            {t('settings.ok')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const signOutModal = signOutConfirmOpen ? (
    <div
      className="settings-name-modal settings-delete-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="settings-signout-title"
      aria-describedby="settings-signout-desc"
    >
      <button
        type="button"
        className="settings-ctrl settings-name-modal__scrim"
        aria-label={t('settings.close')}
        disabled={signOutBusy}
        onClick={press(cancelSignOut, { skipWhen: () => signOutBusy })}
      />
      <div className="settings-name-modal__card">
        <p className="settings-name-modal__kicker">{t('settings.menu')}</p>
        <h3 id="settings-signout-title" className="settings-name-modal__title">
          {t('settings.signOutTitle')}
        </h3>
        <p id="settings-signout-desc" className="settings-name-modal__copy">
          {t('settings.signOutCopy')}
        </p>
        {statusMsg && signOutConfirmOpen ? (
          <p className="settings-name-modal__error" role="alert">
            {statusMsg}
          </p>
        ) : null}
        <div className="settings-name-modal__actions">
          <button
            type="button"
            className="settings-ctrl settings-name-modal__cancel"
            disabled={signOutBusy}
            onClick={press(cancelSignOut, { skipWhen: () => signOutBusy })}
          >
            {t('settings.cancel')}
          </button>
          <button
            type="button"
            className="settings-ctrl settings-name-modal__save settings-name-modal__save--danger"
            disabled={signOutBusy}
            onClick={press(confirmSignOut, { skipWhen: () => signOutBusy })}
          >
            {signOutBusy ? t('settings.signingOut') : t('settings.signOut')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (variant === 'gear') {
    const overlay =
      open || nameModal || deleteModal || deleteSuccessModal || signOutModal || accountSheetOpen
        ? createPortal(
            <>
              {open ? (
                <div
                  className="settings-drawer settings-drawer--screen"
                  role="dialog"
                  aria-modal="true"
                  aria-label={screen === 'settings' ? t('settings.title') : t('settings.menu')}
                >
                  <aside className="settings-drawer__panel settings-drawer__panel--screen">
                    {screen === 'menu' ? (
                      <>
                        <header className="sm-top">
                          <div className="sm-brand">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="sm-brand__mark"
                              src="/images/1b-run-app-icon-squircle.png"
                              alt=""
                              width={36}
                              height={36}
                            />
                            <p className="sm-brand__name">1B Run</p>
                          </div>
                          <button
                            type="button"
                            className="sm-icon-btn"
                            aria-label={t('settings.close')}
                            onClick={press(close)}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
                            </svg>
                          </button>
                        </header>
                        {menuBody}
                      </>
                    ) : (
                      <>
                        <header className="sm-title-bar">
                          <button
                            type="button"
                            className="sm-icon-btn sm-icon-btn--back"
                            aria-label={guideNav.back}
                            onClick={press(() => {
                              resume();
                              hapticTap();
                              setScreen('menu');
                              setStatusMsg(null);
                            })}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M14.5 6.5 9 12l5.5 5.5" />
                            </svg>
                          </button>
                          <h2>{t('settings.title')}</h2>
                          <span aria-hidden />
                        </header>
                        {settingsBody}
                      </>
                    )}
                  </aside>
                  {activeGuide ? (
                    <SettingsGuidePage guideId={activeGuide} onBack={() => setActiveGuide(null)} />
                  ) : null}
                  {activeLegal ? (
                    <SettingsLegalPage pageId={activeLegal} onBack={() => setActiveLegal(null)} />
                  ) : null}
                </div>
              ) : null}
              {nameModal}
              {deleteModal}
              {deleteSuccessModal}
              {signOutModal}
              <AccountAuthSheet
                open={accountSheetOpen}
                initialView={accountSheetView}
                state={account}
                onStateChange={setAccountState}
                onClose={() => setAccountSheetOpen(false)}
              />
            </>,
            document.body,
          )
        : null;

    return (
      <div className="sound-settings sound-settings--ballion sound-settings--gear">
        <button
          type="button"
          className="settings-ctrl sound-settings__gear"
          aria-expanded={open}
          aria-label="Menu"
          onClick={press(() => {
            if (open) return;
            setOpen(true);
            setScreen('menu');
            setEditingName(false);
            setNameError(null);
            setActiveGuide(null);
            setStatusMsg(null);
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
        {overlay}
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
        onClick={press(() => {
          resume();
          hapticTap();
          setOpen((value) => !value);
          setScreen('settings');
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
      {signOutModal}
      {activeGuide ? (
        <SettingsGuidePage guideId={activeGuide} onBack={() => setActiveGuide(null)} />
      ) : null}
      {activeLegal ? (
        <SettingsLegalPage pageId={activeLegal} onBack={() => setActiveLegal(null)} />
      ) : null}
    </div>
  );
}
