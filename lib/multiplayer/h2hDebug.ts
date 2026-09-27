/**
 * Dev-only H2H / Bounty sync breadcrumbs (timestamped).
 * Enable: localStorage.setItem('h2h_debug', '1') then reload.
 * Disabled in production unless that flag is set.
 */

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('h2h_debug') === '1') return true;
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV === 'development';
}

function stamp(): string {
  const d = new Date();
  return `${d.toISOString().slice(11, 23)}`;
}

export function h2hDebug(event: string, detail?: Record<string, unknown>): void {
  if (!enabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[h2h ${stamp()}] ${event}`, detail ?? '');
}
