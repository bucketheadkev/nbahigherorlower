---
name: ios-visual-qa
description: >-
  iOS and physical-iPhone visual quality assurance for 1B Run Capacitor builds.
  Use when verifying polish, performance, safe areas, WebView jank, splash,
  after UI/animation changes, or when the user mentions ios, Xcode, device, or
  production mobile quality.
---

# iOS Visual Quality Assurance

**Primary source of truth:** physical iPhone build via Xcode after `npm run build:ios` (static export + `cap sync`). localhost:3000 is a draft, not acceptance.

## Platform facts

- Shared Next.js game → Capacitor iOS WebView (`PLATFORM.md`)
- Shared UI edits affect web **and** iOS; iOS only updates after sync + new Xcode build
- Use `lib/platform/isNativeApp.ts` for native-only behavior — do not invent detectors
- Do not modify `ios/` unless native/Capacitor behavior truly requires it

## When to run this skill

- After splash, home, menu, draft, animation, or typography work
- User says `ios`, asks for device check, or reports phone-only bugs
- Before calling a visual change “done”

## QA checklist

### Visual

- [ ] No flash of unstyled / wrong theme on cold start
- [ ] Brand navy/orange/green intact; no washed-out or over-bright bloom
- [ ] Hierarchy readable at arm’s length on device
- [ ] Text not clipped by notch, Dynamic Island, or home indicator
- [ ] Images/icons sharp on 3x; no stretched assets
- [ ] Dark arena atmosphere consistent (no accidental light-mode flash)

### Interaction

- [ ] Primary CTA hit targets ≥ ~44pt and not blocked by overlays
- [ ] Press feedback feels instant; no 300ms+ laggy transitions on chrome
- [ ] Scroll areas don’t fight horizontal gestures; overscroll doesn’t reveal white gaps
- [ ] Modals/sheets dismiss cleanly; focus/trap doesn’t break native feel

### Motion & performance

- [ ] Splash/hero timelines stay smooth (aim 60fps); no sustained thermal thrash
- [ ] No persistent full-screen filter/blur animation
- [ ] Animations use transform/opacity; no layout thrashing lists
- [ ] Off-screen/exit paths cancel timers and animation contexts
- [ ] `prefers-reduced-motion` still usable
- [ ] Low Power Mode: degraded but acceptable (no broken layout if frames drop)

### Build hygiene

- [ ] User-requested `ios` → run `npm run build:ios` from repo root
- [ ] Confirm Capacitor sync succeeded before claiming device-ready
- [ ] Do not deploy/push/commit unless user asked
- [ ] No new runtime animation dependencies without explicit approval

## Failure triage

| Symptom | Likely cause |
|---------|----------------|
| Fine in Chrome, wrong on phone | Safe area, `100vh`, WebView CSS, platform CSS guards |
| Jank on splash only | Too many layers, blur, large paints, competing loops |
| Flash before splash | Boot veil / theme load / layout mount order |
| Tap dead zones | Absolute layers without `pointer-events: none` |
| Looks “webby” | Hover-only states, desktop spacing, weak hierarchy |

## Reporting format

When reporting QA results, be brief:

1. **Surface tested** (e.g. splash → home)
2. **Build** (dev :3000 vs iOS sync done / not done)
3. **Pass / fail** with concrete visual notes
4. **Next fix** (one prioritized issue)

## Related skills

- `premium-mobile-gaming-ui`, `cinematic-motion-graphics`, `oneb-brand-visual`
- Project rules: `ios-sync`, `ios-build-task`, `platform-scope`
