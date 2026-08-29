import { Capacitor } from '@capacitor/core';

/**
 * Open an external URL in one gesture (Safari / X app).
 * Prefer Capacitor Browser on native so iOS actually leaves the WebView.
 * Must be kicked off from a click/tap — avoid awaits before calling this.
 */
export function openExternalUrl(url: string): void {
  if (typeof window === 'undefined') return;

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/browser')
      .then(({ Browser }) => Browser.open({ url }))
      .catch(() => openViaAnchor(url));
    return;
  }

  openViaAnchor(url);
}

function openViaAnchor(url: string): void {
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  } catch {
    /* fall through */
  }

  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return;
  } catch {
    /* fall through */
  }

  window.location.assign(url);
}
