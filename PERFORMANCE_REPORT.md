# Performance Test Build — Report

**Date:** 2026-08-02  
**Branch:** `performance-test-build`  
**Backup branch:** `backup/pre-performance-test-2026-08-02`  
**Backup folder:** `.backup-pre-performance-test-20260802-1913/`  
**Flag:** `PERFORMANCE_TEST_BUILD = true` in `lib/tradeup/perf/perfConfig.ts`

---

## Exact lag causes found (pre-optimization)

1. **React state driven reel animation** — Horizontal name reels updated motion via React-coupled effects; parent re-renders and item identity changes mid-spin caused hitching and color spoils.
2. **Per-tick haptics + SFX** — Wheel tick haptics/sounds on nearly every cell crossing flooded the main thread / native bridge.
3. **Heavy full game mount** — `BillionTradeEngine` pulled decade roster JSON filtering, offer lists, framer-motion trees, ads init, storage reads, and multi-screen hub chrome into the Play path.
4. **Artificial Play delay** — Home → engine used ~900ms `setTimeout` launch delay (felt like “lag after sound”).
5. **Expensive visuals** — Large CSS blurs, layered shadows, gloss/sheen animations, confetti, and glassmorphism on vault/booth screens.
6. **Layout-affecting ticket motion** — Prior ticket feeds mixed opacity with layout-ish clipping; feed curves still competed with React stage updates.
7. **Audio object churn risk** — Full `gameAudio` stack + spin hum loops overlapping with many cues during dual spins.
8. **Large dataset work near interaction** — `listValidSpinPairs()` / era roster builds near spin/print paths in the full game (bypassed entirely in this build).

## Unnecessary re-renders (full game)

- Parent spin/print state (`displayTeam`, `phase`, `feed`) re-rendered the entire booth including both reels and ticket.
- Decade color `useMemo` keyed on team identity rebuilt reel item arrays mid-spin.
- Framer `AnimatePresence` on vault LED body remounted text nodes during stages.
- Hub `TradeUpApp` refreshed storage stats and initialized ads on every session entry.

## Animations causing layout / repaint work

- Multi-layer booth chrome + sheen keyframes.
- Vault LED glass/sheen + reading pulse + billion confetti (many absolute nodes + filters).
- Dock / offer list scrolls with heavy card visuals.
- Dual reels with large DOM strips (8×30 teams historically).

## Visual effects removed (this build)

- backdrop-filter / blur / glassmorphism
- Confetti / particles / glow bursts
- Animated gloss / sheen layers
- Multi-layer soft shadows
- Framer-motion page transitions on Play
- Home animated background particles
- Team logos (flat color name panels only)

## Gameplay systems temporarily disabled / bypassed

- Full five-player run / lineup dock
- Decade roster DB filtering & `buildEraRoster`
- Player offer lists / alternate position UI
- Value chamber full projection / count-up / grades
- Leaderboards, challenges, hub tabs
- (Removed) Rewarded ads — not present in this release
- LocalStorage progression writes during the loop
- World rank / personal best calculations
- Network / analytics

**Not deleted** — full systems remain under `components/tradeup/*` and `lib/tradeup/*` (except entry is redirected). Restore by setting `PERFORMANCE_TEST_BUILD = false`.

## Assets reduced / replaced

- Fixed dataset: **8 teams**, **4 decades**, **8 players** (`perfConfig.ts`)
- No logo image loads in the test loop
- Reuses existing small `/sounds/*.mp3` via a dedicated pool (no new network fetch)

## Audio changes

- New `perfAudio` pool: one `HTMLAudioElement` per cue, preloaded
- Spin loop is a single looping element; stopped cleanly before land
- Failed `play()` never blocks UI
- Developer toggle: Sound on/off in Performance Panel

## Haptics changes

- Only: tap, spin start, land, print, insert
- **No** per-cell reel ticks
- Native Capacitor calls fire-and-forget; failures ignored
- Developer toggle: Haptics on/off

## Spinner items mounted

- **32 cells per reel** (8 teams × 4 reps) + **16 cells** for decades (4 × 4)  
- Total mounted spinner cells: **48** (permanently mounted; not rebuilt per spin)

## Timers / listeners removed from Play path

- Removed ~900ms Play launch timeout
- No ads initialize on Play
- No hub storage polling loop
- Reel uses a single `requestAnimationFrame` chain per spin (cancelled on unmount)
- Metrics panel samples FPS every ~500ms only when `PERFORMANCE_DEBUG`

## Build mode tested

- **Production** Capacitor export: `npm run build:ios` (`CAPACITOR_BUILD=1 next build` + `cap sync ios`) — **succeeded** 2026-08-02 (static export synced to `ios/App/App/public`).
- First-load JS for `/` and `/game` ≈ **115 kB** (perf entry is lighter than mounting `BillionTradeEngine`).
- Not a Next.js `dev` server for device validation — use Xcode → Run on a physical iPhone.

## Approximate FPS

| Context | Approx FPS |
|--------|------------|
| Before (full game on device, spin + vault) | Unstable; perceived hitching / delayed taps; estimated **30–45 FPS** during dual spin + SFX/haptics (device-dependent; not instrumented in prior build) |
| After (Performance Test Build, production) | **Read from on-device Performance Panel** (FPS / min FPS / long tasks). Target: stable ~60 with sound+haptics off for Test 2. |

> **Physical iPhone Tests 1–6 were not executed in this agent session.** Install the synced production build in Xcode and fill live numbers from the panel. Desktop FPS is not accepted as proof.

## Remaining frame drops (expected / watch)

- First unlock of audio may cost one hitch if not warmed (mitigated by PLAY unlock)
- Capacitor haptic bridge can still add micro-jank if overloaded — keep tick haptics off
- Long tasks from unrelated iOS system work may still appear in `longtask` count

## Safe restore order (after baseline confirmed)

1. Sound on (already optional)
2. Haptics on
3. Ticket print + insert polish (still transform-only)
4. Real 30-team reel with **fixed strip**, no React-per-frame state
5. Decade color sync **after** team land only
6. Single ticket print with real pair data (no full roster yet)
7. Era roster board (memoized, built after spin completes)
8. Five-slot dock (memoized slot items)
9. Value chamber projection (throttle paints; no confetti first)
10. Ads / storage / leaderboards last

---

## How to run

1. Xcode → run production-synced app (`npm run build:ios` already used).
2. Tap **PLAY** → Performance Test boot → **PLAY** again → **SPIN**.
3. Use bottom panel toggles for Tests 2–4 (sound/haptics/spinner/ticket).
4. Set `PERFORMANCE_TEST_BUILD = false` to restore full Trade Up entry without deleting this build.
