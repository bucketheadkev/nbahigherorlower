import { Capacitor } from '@capacitor/core';
import { isValidH2HRoomCode, sanitizeH2HRoomCode } from '@/lib/multiplayer/roomCode';

/** Custom URL scheme registered in iOS Info.plist — opens the native app directly. */
export const H2H_INVITE_SCHEME = 'pickfive';

export type ShareH2HInviteResult =
  | { ok: true; method: 'native' | 'web-share' | 'clipboard' }
  | { ok: false; cancelled: boolean; message: string };

function codeFromRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = sanitizeH2HRoomCode(raw);
  return isValidH2HRoomCode(code) ? code : null;
}

/** Deep link that opens the app and auto-joins (pickfive://join/ABCD). */
export function buildH2HInviteDeepLink(code: string): string {
  const safe = sanitizeH2HRoomCode(code);
  return `${H2H_INVITE_SCHEME}://join/${safe}`;
}

/** Primary tappable link — native deep link only (no public web fallback). */
export function buildH2HInviteLink(code: string): string {
  return buildH2HInviteDeepLink(code);
}

export function buildH2HInviteText(code: string): string {
  const safe = sanitizeH2HRoomCode(code);
  const link = buildH2HInviteDeepLink(safe);
  return [
    'I challenged you to a 1B Run 1v1!',
    '',
    `Room code: ${safe}`,
    '',
    'Open 1B Run → 1v1 → Join Game → enter the room code.',
    Capacitor.isNativePlatform()
      ? `Or tap to join if you already have the app: ${link}`
      : 'Install 1B Run on your device, then enter the room code to join.',
  ].join('\n');
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

  const deepLink = buildH2HInviteDeepLink(safe);
  const text = buildH2HInviteText(safe);
  const title = '1B Run — Join my 1v1';

  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title,
        text,
        url: deepLink,
        dialogTitle: 'Invite a friend',
      });
      return { ok: true, method: 'native' };
    } catch (err) {
      if (isShareCancelled(err)) {
        return { ok: false, cancelled: true, message: 'Share cancelled' };
      }
      const copied = await copyInviteText(text);
      if (copied) return { ok: true, method: 'clipboard' };
      return { ok: false, cancelled: false, message: shareErrorMessage(err) };
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return { ok: true, method: 'web-share' };
    } catch (err) {
      if (isShareCancelled(err)) {
        return { ok: false, cancelled: true, message: 'Share cancelled' };
      }
    }
  }

  const copied = await copyInviteText(text);
  if (copied) return { ok: true, method: 'clipboard' };
  return { ok: false, cancelled: false, message: 'Could not copy invite link.' };
}
