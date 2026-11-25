/** Open https / mailto on web or in the Capacitor browser shell. */
export async function openExternal(href: string): Promise<void> {
  if (typeof window === 'undefined' || !href) return;
  if (href.startsWith('mailto:')) {
    window.location.href = href;
    return;
  }
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: href });
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
