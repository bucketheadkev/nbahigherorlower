/**
 * Game motion preference.
 *
 * Many theatrical CSS animations are gated on `html[data-full-motion]`.
 * Website / LAN preview always forces full motion so desktop browsers match
 * the iPhone build. Native Capacitor still honors OS reduced-motion unless
 * ?fullMotion=1 (persisted) is used.
 */

export const FULL_MOTION_STORAGE_KEY = 'tradeup_full_motion';
export const FULL_MOTION_ATTR = 'data-full-motion';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

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

  // Website edition (including LAN IP upstairs): always theatrical motion.
  if (!isNativeCapacitor()) return true;

  const host = window.location.hostname;
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

/**
 * Inline boot script — runs before paint so CSS reduced-motion / full-motion
 * gates match the website phone frame immediately.
 */
export const FULL_MOTION_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(FULL_MOTION_STORAGE_KEY)};var a=${JSON.stringify(FULL_MOTION_ATTR)};var p=new URLSearchParams(location.search);if(p.get('fullMotion')==='0'||p.get('motion')==='reduce'){localStorage.removeItem(k);return;}var force=p.get('fullMotion')==='1'||p.get('motion')==='full'||localStorage.getItem(k)==='1';if(!force){var cap=window.Capacitor;var native=!(!cap||!cap.isNativePlatform||!cap.isNativePlatform());if(!native)force=true;}if(!force){var h=location.hostname;force=h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0';}if(force){if(p.get('fullMotion')==='1'||p.get('motion')==='full')localStorage.setItem(k,'1');document.documentElement.setAttribute(a,'');}}catch(e){}})();`;
