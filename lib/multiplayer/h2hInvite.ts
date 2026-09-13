import { Capacitor } from '@capacitor/core';
import { isValidH2HRoomCode, sanitizeH2HRoomCode } from '@/lib/multiplayer/roomCode';

/** Legacy custom URL scheme — still accepted for older shared links. */
export const H2H_INVITE_SCHEME = 'pickfive';

/**
 * Public HTTPS origin for new invitations.
 * Uses NEXT_PUBLIC_SITE_URL when set; otherwise the live legal/invite site.
 */
export const H2H_INVITE_WEB_ORIGIN = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : 'https://one-billion-run-legal.vercel.app') || 'https://one-billion-run-legal.vercel.app'
).replace(/\/$/, '');

export const H2H_PENDING_JOIN_STORAGE_KEY = 'oneb:pending-h2h-join';

export type ShareH2HInviteResult =
  | { ok: true; method: 'native' | 'web-share' | 'clipboard' }
  | { ok: false; cancelled: boolean; message: string };

function codeFromRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = sanitizeH2HRoomCode(raw);
  return isValidH2HRoomCode(code) ? code : null;
}

/** Legacy deep link (pickfive://join/ABCD) — kept for older invitations. */
export function buildH2HInviteDeepLink(code: string): string {
  const safe = sanitizeH2HRoomCode(code);
  return `${H2H_INVITE_SCHEME}://join/${safe}`;
}

/** HTTPS invitation URL shared to Messages — powers preview + Universal Links. */
export function buildH2HInviteWebLink(code: string): string {
  const safe = sanitizeH2HRoomCode(code);
  return `${H2H_INVITE_WEB_ORIGIN}/join/${safe}`;
}

/** Primary tappable link for new shares (HTTPS only). */
export function buildH2HInviteLink(code: string): string {
  return buildH2HInviteWebLink(code);
}

/** Short share body — URL is attached separately via the share API. */
export function buildH2HInviteText(code: string): string {
  const safe = sanitizeH2HRoomCode(code);
  return `I challenged you to a 1B Run 1v1!\nRoom code: ${safe}`;
}

/** Clipboard / fallback body includes the HTTPS URL once. */
export function buildH2HInviteClipboardText(code: string): string {
  const safe = sanitizeH2HRoomCode(code);
  return `${buildH2HInviteText(safe)}\n${buildH2HInviteWebLink(safe)}`;
}

export function persistPendingH2HJoinCode(code: string): void {
  if (typeof window === 'undefined') return;
  const safe = sanitizeH2HRoomCode(code);
  if (!isValidH2HRoomCode(safe)) return;
  try {
    window.sessionStorage.setItem(H2H_PENDING_JOIN_STORAGE_KEY, safe);
  } catch {
    /* private mode / quota */
  }
}

export function consumePendingH2HJoinCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(H2H_PENDING_JOIN_STORAGE_KEY);
    window.sessionStorage.removeItem(H2H_PENDING_JOIN_STORAGE_KEY);
    return codeFromRaw(raw);
  } catch {
    return null;
  }
}

export function parseH2HInviteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);

    const scheme = url.protocol.replace(':', '').toLowerCase();
    if (scheme === H2H_INVITE_SCHEME || scheme === 'com.kova.pickfive') {
      const fromQuery = codeFromRaw(url.searchParams.get('code') ?? url.searchParams.get('join'));
      if (fromQuery) return fromQuery;
      const segment = url.pathname.split('/').filter(Boolean);
      const joinIdx = segment.findIndex((s) => s.toLowerCase() === 'join');
      if (joinIdx >= 0 && segment[joinIdx + 1]) {
        return codeFromRaw(segment[joinIdx + 1]);
      }
      if (segment.length === 1) return codeFromRaw(segment[0]);
    }

    const fromQuery = codeFromRaw(url.searchParams.get('join') ?? url.searchParams.get('code'));
    if (fromQuery) return fromQuery;

    const parts = url.pathname.split('/').filter(Boolean);
    const joinIdx = parts.findIndex((s) => s.toLowerCase() === 'join');
    if (joinIdx >= 0 && parts[joinIdx + 1]) {
      return codeFromRaw(parts[joinIdx + 1]);
    }
  } catch {
    /* not a URL — try bare code below */
  }

  const bare = trimmed.toUpperCase();
  return codeFromRaw(bare);
}

export function readJoinCodeFromLocation(): string | null {
  if (typeof window === 'undefined') return null;

  const fromSearch = codeFromRaw(new URLSearchParams(window.location.search).get('join'));
  if (fromSearch) return fromSearch;

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const joinIdx = pathParts.findIndex((s) => s.toLowerCase() === 'join');
  if (joinIdx >= 0 && pathParts[joinIdx + 1]) {
    const fromPath = codeFromRaw(pathParts[joinIdx + 1]);
    if (fromPath) return fromPath;
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (hash.includes('join=') || hash.includes('code=')) {
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
    const fromHash = codeFromRaw(
      new URLSearchParams(query).get('join') ?? new URLSearchParams(query).get('code'),
    );
    if (fromHash) return fromHash;
  }

  return null;
}

async function copyInviteText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function shareErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? 'Could not share');
  }
  return 'Could not share';
}

function isShareCancelled(err: unknown): boolean {
  return /cancel|dismiss|abort|user/i.test(shareErrorMessage(err));
}

/** Share invite with native sheet on device; Web Share or clipboard in browser / Cursor preview. */
export async function shareH2HInvite(code: string): Promise<ShareH2HInviteResult> {
  const safe = sanitizeH2HRoomCode(code);
  if (!isValidH2HRoomCode(safe)) {
    return { ok: false, cancelled: false, message: 'Invalid room code.' };
  }

  const webLink = buildH2HInviteWebLink(safe);
  const text = buildH2HInviteText(safe);
  const clipboardText = buildH2HInviteClipboardText(safe);
  const title = '1B Run';

  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title,
        text,
        url: webLink,
        dialogTitle: 'Invite a friend',
      });
      return { ok: true, method: 'native' };
    } catch (err) {
      if (isShareCancelled(err)) {
        return { ok: false, cancelled: true, message: 'Share cancelled' };
      }
      const copied = await copyInviteText(clipboardText);
      if (copied) return { ok: true, method: 'clipboard' };
      return { ok: false, cancelled: false, message: shareErrorMessage(err) };
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url: webLink });
      return { ok: true, method: 'web-share' };
    } catch (err) {
      if (isShareCancelled(err)) {
        return { ok: false, cancelled: true, message: 'Share cancelled' };
      }
    }
  }

  const copied = await copyInviteText(clipboardText);
  if (copied) return { ok: true, method: 'clipboard' };
  return { ok: false, cancelled: false, message: 'Could not copy invite link.' };
}
