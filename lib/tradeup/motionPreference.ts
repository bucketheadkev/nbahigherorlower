/**
 * Game motion preference.
 *
 * Cursor's embedded browser reports prefers-reduced-motion, which collapses
 * theatrical timing (matchmaking, flips, etc.). Local preview forces full
 * motion so localhost matches phone/Chrome. Production still honors OS a11y
 * unless ?fullMotion=1 (persisted) is used.
 */

export const FULL_MOTION_STORAGE_KEY = 'tradeup_full_motion';
export const FULL_MOTION_ATTR = 'data-full-motion';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function shouldForceFullMotion(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fullMotion') === '0' || params.get('motion') === 'reduce') {
      localStorage.removeItem(FULL_MOTION_STORAGE_KEY);
      return false;
    }
    if (params.get('fullMotion') === '1' || params.get('motion') === 'full') {
      localStorage.setItem(FULL_MOTION_STORAGE_KEY, '1');
      return true;
    }
    if (localStorage.getItem(FULL_MOTION_STORAGE_KEY) === '1') return true;
  } catch {
    // ignore storage / URL issues
  }

  const host = window.location.hostname;
  // Cursor Simple Browser + local `npm run dev` preview
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

export function applyFullMotionAttribute(force = shouldForceFullMotion()): void {
  if (typeof document === 'undefined') return;
  if (force) {
    document.documentElement.setAttribute(FULL_MOTION_ATTR, '');
  } else {
    document.documentElement.removeAttribute(FULL_MOTION_ATTR);
  }
}

/** True when game sequences/CSS should use the reduced-motion path. */
export function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (shouldForceFullMotion()) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  const onChange = () => {
    applyFullMotionAttribute();
    onStoreChange();
  };
  mq.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Inline boot script — runs before paint so CSS reduced-motion rules stay off. */
export const FULL_MOTION_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(FULL_MOTION_STORAGE_KEY)};var a=${JSON.stringify(FULL_MOTION_ATTR)};var p=new URLSearchParams(location.search);if(p.get('fullMotion')==='0'||p.get('motion')==='reduce'){localStorage.removeItem(k);return;}var force=p.get('fullMotion')==='1'||p.get('motion')==='full'||localStorage.getItem(k)==='1';var h=location.hostname;if(!force)force=h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0';if(force){if(p.get('fullMotion')==='1'||p.get('motion')==='full')localStorage.setItem(k,'1');document.documentElement.setAttribute(a,'');}}catch(e){}})();`;
