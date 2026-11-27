# Home rh5 backup (recoverable)

Snapshot of the previous Home (`rh5` / growth-photo plate) taken before the ground-up **rh6 Arena Command** redesign.

## Restore

1. Copy files back:

```bash
cp design/home-backup-rh5/TradeUpHome.tsx components/tradeup/TradeUpHome.tsx
cp design/home-backup-rh5/HomeBankProgress.tsx components/tradeup/home/HomeBankProgress.tsx
cp design/home-backup-rh5/HomeRisingBubbles.tsx components/tradeup/home/HomeRisingBubbles.tsx
cp design/home-backup-rh5/HomeArenaLiveFx.tsx components/tradeup/home/HomeArenaLiveFx.tsx
cp design/home-backup-rh5/home-plate.css app/home-plate.css
```

2. In `app/layout.tsx`, remove `import './home-arena.css'` if present.
3. Optionally remove `components/tradeup/home/HomeArenaStage.tsx` and `app/home-arena.css`.
4. Revert `data-hub-tab` on `hub-shell` in `TradeUpApp.tsx` if you want a clean rh5 shell.
5. Run `npm run build:ios` before device testing.

## Contained here

- `TradeUpHome.tsx`
- `HomeBankProgress.tsx`
- `HomeRisingBubbles.tsx`
- `HomeArenaLiveFx.tsx`
- `home-plate.css`
