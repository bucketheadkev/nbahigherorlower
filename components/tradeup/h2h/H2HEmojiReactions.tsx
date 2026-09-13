'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { emojiSetForPosition } from '@/lib/tradeup/h2hEmojiSets';
import { playEmojiTapSound } from '@/lib/tradeup/h2hEmojiSound';
import { hapticLight } from '@/lib/tradeup/haptics';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';

interface Particle {
  id: string;
  emoji: string;
  left: number;
  driftX: number;
  delayMs: number;
  durationMs: number;
  sizeRem: number;
}

interface H2HEmojiReactionsProps {
  roomId: string;
  myPlayerNumber: 1 | 2;
  enabled: boolean;
  /** Position-based set (ignored when `emojis` is provided). */
  position?: H2HPosition;
  /** Fixed emoji set (e.g. results screen). */
  emojis?: readonly string[];
  /** Channel namespace suffix so results don't clash with round reactions. */
  channelSuffix?: string;
  className?: string;
}

const BURST_COUNT = 3;
const BURST_LIFE_MS = 5200;
const TAP_COOLDOWN_MS = 110;
const FINAL_EMOJIS = ['🐐', '🔥', '💰'] as const;

function spawnParticles(emoji: string): Particle[] {
  return Array.from({ length: BURST_COUNT }, (_, i) => ({
    id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    emoji,
    left: 8 + Math.random() * 84,
    driftX: (Math.random() - 0.5) * 48,
    delayMs: Math.floor(Math.random() * 120),
    durationMs: 3200 + Math.floor(Math.random() * 1400),
    sizeRem: 1 + Math.random() * 0.55,
  }));
}

export function H2HEmojiReactions({
  roomId,
  position,
  emojis: emojisProp,
  channelSuffix = '',
  myPlayerNumber,
  enabled,
  className,
}: H2HEmojiReactionsProps) {
  const emojis = useMemo(() => {
    if (emojisProp && emojisProp.length > 0) return emojisProp.slice(0, 3);
    if (position) return emojiSetForPosition(position).slice(0, 3);
    return [...FINAL_EMOJIS];
  }, [emojisProp, position]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mounted, setMounted] = useState(false);
  const lastTapRef = useRef(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const addBurst = useCallback((emoji: string) => {
    const next = spawnParticles(emoji);
    setParticles((prev) => [...prev, ...next].slice(-80));
    window.setTimeout(() => {
      const drop = new Set(next.map((p) => p.id));
      setParticles((prev) => prev.filter((p) => !drop.has(p.id)));
    }, BURST_LIFE_MS);
  }, []);

  useEffect(() => {
    if (!enabled || !roomId) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`h2h_emoji:${roomId}${channelSuffix ? `:${channelSuffix}` : ''}`)
      .on('broadcast', { event: 'emoji_burst' }, ({ payload }) => {
        const row = payload as { emoji?: string; from?: number };
        if (!row.emoji || row.from === myPlayerNumber) return;
        addBurst(row.emoji);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [addBurst, channelSuffix, enabled, myPlayerNumber, roomId]);

  const handleTap = (emoji: string) => {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastTapRef.current < TAP_COOLDOWN_MS) return;
    lastTapRef.current = now;
    hapticLight();
    playEmojiTapSound(emoji);
    addBurst(emoji);
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'emoji_burst',
      payload: { emoji, from: myPlayerNumber },
    });
  };

  if (!enabled) return null;

  const floatLayer =
    mounted && particles.length > 0
      ? createPortal(
          <div className="h2h-emoji__float-layer" aria-hidden>
            {particles.map((p) => (
              <span
                key={p.id}
                className="h2h-emoji__particle"
                style={
                  {
                    left: `${p.left}%`,
                    bottom: 'calc(var(--safe-bottom, 0px) + 4.25rem)',
                    '--drift-x': `${p.driftX}px`,
                    '--delay': `${p.delayMs}ms`,
                    '--dur': `${p.durationMs}ms`,
                    fontSize: `${p.sizeRem}rem`,
                  } as CSSProperties
                }
              >
                {p.emoji}
              </span>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`h2h-emoji${className ? ` ${className}` : ''}`} aria-label="Reactions">
      {floatLayer}
      <div className="h2h-emoji__dock">
        {emojis.map((emoji) => (
          <button
            key={`${position ?? 'final'}-${emoji}`}
            type="button"
            className="h2h-emoji__btn"
            aria-label={`React ${emoji}`}
            onPointerDown={(e) => {
              e.preventDefault();
              handleTap(emoji);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export const H2H_FINAL_EMOJIS = FINAL_EMOJIS;
