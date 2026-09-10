'use client';

import { Capacitor } from '@capacitor/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { applyFullMotionAttribute } from '@/lib/tradeup/motionPreference';

/** iPhone 15/16 logical size — large enough to stay sharp on desktop. */
const PHONE_W = 430;
const PHONE_H = 932;
const DESKTOP_MIN = 768;
const EMBED_PARAM = 'phoneEmbed';

function isPhoneEmbed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return new URLSearchParams(window.location.search).get(EMBED_PARAM) === '1';
}

function buildEmbedSrc(): string {
  const url = new URL(window.location.href);
  url.searchParams.set(EMBED_PARAM, '1');
  url.searchParams.set('fullMotion', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}

function supportsCssZoom(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  return CSS.supports('zoom', '1');
}

/**
 * Website-only: letterbox a real iPhone-sized iframe so vw/dvh match mobile.
 * Uses CSS zoom (not transform) so the frame stays sharp when fitted.
 */
export function WebPhoneShell({ children }: { children: ReactNode }) {
  const [host, setHost] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [embedSrc, setEmbedSrc] = useState('');

  const fit = useCallback(() => {
    const pad = 32;
    const next = Math.min(
      1,
      (window.innerWidth - pad) / PHONE_W,
      (window.innerHeight - pad) / PHONE_H,
    );
    setZoom(Number.isFinite(next) && next > 0 ? Math.round(next * 1000) / 1000 : 1);
  }, []);

  const scalerStyle = useMemo((): CSSProperties => {
    if (supportsCssZoom()) {
      return { width: PHONE_W, height: PHONE_H, zoom };
    }
    return {
      width: PHONE_W,
      height: PHONE_H,
      transform: zoom === 1 ? undefined : `scale(${zoom})`,
      transformOrigin: 'center center',
    };
  }, [zoom]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || isPhoneEmbed()) {
      document.documentElement.classList.remove('web-phone-host');
      document.documentElement.classList.add('web-phone-app');
      applyFullMotionAttribute(true);
      setHost(false);
      return;
    }

    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
    const sync = () => {
      if (mq.matches) {
        document.documentElement.classList.add('web-phone-host');
        document.documentElement.classList.remove('web-phone-app');
        setEmbedSrc(buildEmbedSrc());
        setHost(true);
        fit();
      } else {
        document.documentElement.classList.remove('web-phone-host');
        document.documentElement.classList.add('web-phone-app');
        setHost(false);
      }
    };

    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', fit);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', fit);
    };
  }, [fit]);

  if (host && embedSrc) {
    return (
      <div className="web-phone-stage">
        <div className="web-phone-scaler" style={scalerStyle}>
          <iframe
            className="web-phone-iframe"
            title="1B Run"
            src={embedSrc}
            width={PHONE_W}
            height={PHONE_H}
            allow="autoplay; clipboard-write"
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
