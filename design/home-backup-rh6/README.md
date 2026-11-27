# Home rh6 backup (Arena Command)

Snapshot of the rh6 "Arena Command" Home, taken before rh5 was restored as the
foundation for the rh7 GSAP Home.

Restore: copy `TradeUpHome.tsx` → `components/tradeup/`, the `Home*.tsx` files →
`components/tradeup/home/`, `home-plate.css` + `home-arena.css` → `app/`, and add
`import './home-arena.css'` back to `app/layout.tsx` after `home-plate.css`.
