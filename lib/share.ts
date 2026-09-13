export function buildShareText(streak: number): string {
  return `I just scored a ${streak} streak on NBA Higher or Lower. Can you beat me? 🏀🔥`;
}

const INVITE_HOST_FALLBACK = 'https://one-billion-run-legal.vercel.app';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

/**
 * Public site origin for shares and invitation links.
 * NEXT_PUBLIC_SITE_URL wins (set https://1brun.com for the production website).
 * A deployed browser uses its own origin so local and native builds are not
 * hardcoded to production. Localhost and the Capacitor webview keep the
 * existing invite host so Universal Links and local play stay intact.
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
