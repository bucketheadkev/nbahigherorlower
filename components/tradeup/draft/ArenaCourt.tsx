'use client';

import { memo } from 'react';

/**
 * Mobile draft arena: the approved reference's court region (576×584), with its jerseys
 * removed. The jersey seats in draft-arena.css are placed in the same 576×584 space, so the
 * live jerseys and labels land exactly where the reference draws them.
 */
export const ArenaCourtArt = memo(function ArenaCourtArt() {
  return (
    <img
      className="arena-court"
      src="/images/arena/draft-court.jpg"
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
});
