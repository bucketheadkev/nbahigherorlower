'use client';

/**
 * Full-bleed arena atmosphere — production plate only.
 * Never mount ART_ONLY_PREVIEW or flattened UI screenshots here.
 */
export function HomeArenaBackdrop() {
  return (
    <div className="home-scene" aria-hidden>
      <img
        className="home-scene__arena-img"
        src="/images/home-v4/home-arena-bg@3x.webp"
        alt=""
        width={1290}
        height={2796}
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
    </div>
  );
}
