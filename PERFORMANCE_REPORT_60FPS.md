# 60 FPS Full-Game Performance Rebuild — Report

**Date:** 2026-08-02  
**Branch:** `performance-test-build`  
**Mode:** Full gameplay restored (`PERFORMANCE_TEST_BUILD = false`)  
**Overlay:** `PERFORMANCE_DEBUG = true` (turn **false** before App Store)

---

## Exact causes of the ~30 FPS ceiling

1. **Explicit 30 FPS React paint throttle** in `ValueRevealMachine.tsx`  
   Comment: `Throttle React paints ~30fps for iPhone smoothness` with `now - lastPaint >= 32` before `setProjected` / `setDisplayFinal`.  
   **This alone forced counter animations to update at ~30 Hz.** Removed.

2. **Per-frame React state during ticket insert** — `setInsertFeed` every rAF drove full component re-renders while the ticket moved. Replaced with direct `el.style.setProperty('--feed', …)`.

3. **Massive reel DOM** — `HorizontalNameReel` mounted **6 reps × N items** (≈ **180** team cells + **42** decade cells). Rebuilt to **one copy** of each item with **modulo-wrapped `translate3d`** (≈ **30 + 7 = 37** cells).

4. **Decade color rebuild mid-spin** — changing team color remade `decadeItems` and remounted the decade strip while it was still moving. Now CSS variables on a stable strip.

5. **Permanent `will-change: transform` on `.hn-reel__track`** — kept an always-on compositor layer. Now applied only while spinning.

6. **Dense spin haptics** — light impact cooldown ~28ms flooded the Capacitor bridge during reels. Cooldowns raised; tick gap ≥72ms; skipped when adaptive quality drops.

7. **GPU effects** — vault `backdrop-filter`, infinite sheens, home dust (28 particles). Gated by adaptive quality / diagnostic mode B.

8. **Spin-pair scan** — `listValidSpinPairs()` rebuilt every mount. Now **cached once**; warmed on idle boot.

9. **Artificial Play delay** — previous hub used ~900ms before engine mount (felt like lag). Removed; Play is immediate.

10. **No native 30 FPS Cap/iOS setting found** — AppDelegate/Capacitor config do not lock frame rate. The ~30 FPS reading was from (1)+(2)+(GPU load), not a display hard-lock.

---

## Unnecessary re-renders fixed

| Path | Before | After |
|------|--------|--------|
| Projection / final count | `setState` every ~32ms | `textContent` via refs; React only at end |
| Ticket insert `--feed` | `setInsertFeed` every frame | Direct style on ticket ref |
| Decade color | New `decadeItems` array mid-spin | CSS `--decade-reel-bg` |
| Reel motion | Already transform-based | Same, fewer nodes, memo wrapper |
| Vault shell | framer-motion + AnimatePresence + 28 confetti | Plain DOM; 12 confetti max |

---

## Animations / effects removed or gated

- Explicit 30 FPS throttle  
- Framer motion on Value Chamber shell / billion burst  
- Permanent reel `will-change`  
- Backdrop-filter / sheen / dust when quality ≤ medium or diagnostic **B**  
- Home dust count 28 → 10  

---

## Architecture added

- `lib/tradeup/perf/rafClock.ts` — shared rAF bookkeeping  
- `lib/tradeup/perf/adaptiveQuality.ts` — sticky auto-downgrade if avg frame &gt; ~18.2ms  
- `lib/tradeup/perf/frameMetrics.ts` — real rAF FPS / 1% low / long frames  
- `lib/tradeup/perf/diagnosticMode.ts` — modes **A–G**  
- `components/tradeup/perf/DevPerfOverlay.tsx` — FPS + mode/quality toggles  

---

## Spinner cell count

| Reel | Before | After |
|------|--------|-------|
| Team (~30) | ~180 | **~30** |
| Decade (7) | ~42 | **7** |
| **Total** | **~222** | **~37** |

---

## Audio / haptics

- Visual action still starts before awaiting audio/haptics  
- Wheel tick haptic cooldown increased; ticks rate-limited in the reel (≥72ms)  
- Quality `low`/`minimal` disables tick haptics  

---

## Build / measurement

- Use **production** `npm run build:ios` (not `next dev`)  
- Overlay shows **real rAF interval FPS** (500ms windows; 1% low retained)  
- **Do not claim stable 60 FPS until the physical iPhone overlay confirms it**  

### Expected (to verify on device)

| Phase | Before (observed) | Target after |
|-------|-------------------|--------------|
| Idle / buttons | delayed / hitchy | Immediate press |
| Dual spin | ~19–30 FPS | Near **60**, rarely &lt;50 sustained |
| Ticket insert / count-up | ~30 (throttled) | Near **60** (DOM text / transform) |

Fill exact numbers from the overlay during spins.

---

## Diagnostic modes (overlay A–G)

- **A** Full  
- **B** Effects off  
- **C** Sound+haptics off  
- **D** Plain-text spinners  
- **E** Ticket anim off  
- **F** Simple transforms  
- **G** Static + FPS only  

---

## Safe restore / next steps

1. Confirm spins ≥55 avg FPS on device (mode A).  
2. If not, test B then C to isolate GPU vs native bridge.  
3. Set `PERFORMANCE_DEBUG = false` before shipping.  
4. Reintroduce heavier sheen/blur only if quality stays `high` with headroom.  

**Gameplay outcomes, roster data, tickets, rerolls, feeder, sounds, and haptics remain functionally the same.**
