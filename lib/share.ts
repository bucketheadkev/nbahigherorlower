export function buildShareText(streak: number): string {
  return `I just scored a ${streak} streak on NBA Higher or Lower. Can you beat me? 🏀🔥`;
}

/**
 * Non-invite share fallback only. 1v1 invitations do not use this —
 * they always use https://1brun.com via getH2HInviteWebOrigin().
 */
const INVITE_HOST_FALLBACK = 'https://one-billion-run-legal.vercel.app';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

/**
 * Public site origin for non-invite shares.
 * 1v1 Copy Link and Invite do not use this. They use https://1brun.com.
 * NEXT_PUBLIC_SITE_URL still wins here when set.
 * A deployed browser uses its own origin. Localhost and the native webview
 * fall back to the older legal host for these non-invite shares only.
 */
export function getSiteUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const { origin, hostname, protocol } = window.location;
    const nativeWebview = protocol === 'capacitor:' || protocol === 'ionic:';
    if (origin && !isLocalHost(hostname) && !nativeWebview) return origin;
  }
  return INVITE_HOST_FALLBACK;
}

export function buildShareUrl(streak: number): string {
  const text = buildShareText(streak);
  const url = getSiteUrl();
  const params = new URLSearchParams({ text });
  if (url) params.set('url', url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildCopyText(streak: number): string {
  const url = getSiteUrl();
  const text = buildShareText(streak);
  return url ? `${text}\n${url}` : text;
}
