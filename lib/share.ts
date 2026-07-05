export function buildShareText(streak: number): string {
  return `I just scored a ${streak} streak on NBA Higher or Lower. Can you beat me? 🏀🔥`;
}

export function getSiteUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || '';
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
