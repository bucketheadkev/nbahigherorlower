---
name: cinematic-motion-graphics
description: >-
  Plans and implements cinematic, sports-game-grade motion for 1B Run using CSS,
  existing framer-motion/Motion, and (when installed) GSAP. Use for splash,
  intros, draft slam, reveals, transitions, microinteractions, and animation
  reviews. Emphasizes orchestrated timelines, lighting, and 60fps mobile motion.
---

# Cinematic Motion Graphics

Goal: motion that feels like a premium sports title — intentional, weighty, sparse — not a website full of fade-up cards.

**Runtime today:** CSS keyframes, `framer-motion` (Motion), and **GSAP + `@gsap/react`** (installed; Home rh7 timelines). Use `useGSAP` with `scope`, `contextSafe` for handlers, transform/opacity only. Never let GSAP and Motion animate the same element.

## Motion philosophy

1. **One orchestrated moment beats many small ones.** Splash, draft resolve, big win — earn a timeline. Menus get restrained feedback only.
2. **Motion answers the player.** Presses, opens, confirms, and rewards should feel physical. Ambient motion stays subtle and never fights readability.
3. **Weight and ease** — Prefer cinematic curves (`cubic-bezier(0.22, 1, 0.36, 1)`, settle/soften easings already in theme) over default ease-in-out everywhere.
4. **Lighting participates** — Glows, blooms, and specular sweeps should sync with the beat of the timeline, not loop independently forever at high intensity.
5. **Respect reduced motion** — `@media (prefers-reduced-motion: reduce)` / Motion `useReducedMotion`: keep state changes, drop flourishes.

## Tool choice (when coding)

| Need | Prefer |
|------|--------|
| Ambient loops, CSS-owned splash beats already in theme | CSS keyframes / theme tokens (`--oneb-intro-*`) |
| Enter/exit presence, layout-aware UI chrome | Existing `framer-motion` |
| Multi-step cinematic timeline | GSAP timeline (`useGSAP`) |
| Authored character/mascot (future) | Rive **after** explicit approval + device FPS check |

Do **not** add a second animation system to a screen that already has a coherent CSS timeline unless rewriting that moment end-to-end.

## Performance budget (mobile WebView)

- Animate **transform** and **opacity** only. Avoid top/left/width/height, layout thrash, and filter animations on large layers when possible.
- Cap simultaneous heavy layers; pause off-screen / unmount timelines on exit.
- Prefer `will-change` sparingly and briefly — not permanently on every tile.
- Avoid animating large full-screen blurs; prefer pre-baked gradients and small highlight layers.
- Stagger deliberately (few items); do not stagger every list row by default.
- Target **60fps on physical iPhone** in Low Power Mode when possible; if jank appears, simplify before adding libraries.

## Cinematic checklist

- [ ] Clear beat sheet: setup → accent → resolve (or press → feedback → settle)
- [ ] Single focal moving element at the climax
- [ ] Supporting layers quieter (parallax ≤ subtle)
- [ ] Audio/haptics hooks considered only if already in the flow — do not invent new systems
- [ ] Exit/cleanup: no leftover `requestAnimationFrame`, GSAP contexts, or Motion subscriptions
- [ ] Reduced-motion path verified
- [ ] Brand colors only (navy / blue glow / basketball orange / money green)

## Anti-patterns

- Fade+slide-up on every section
- Infinite high-intensity pulse on primary CTAs
- Hover-only motion with no touch equivalent
- Bouncy toy easings on serious economy/money moments
- Competing loops (particles + shimmer + pulse + spinner)
- Introducing GSAP/Rive/Lottie “because premium” without a named beat and device plan

## Workflow

1. Write a 3–6 beat outline before code.
2. Reuse existing theme intro tokens and Motion patterns in-repo.
3. Implement the smallest stack that hits the beat.
4. Profile mentally for layer count; then verify on device when user runs `ios`.
5. When using GSAP: follow `gsap-timeline` / `gsap-performance` / `gsap-react` skills.

## Related skills

- `gsap-core`, `gsap-timeline`, `gsap-react`, `gsap-performance` (planning / future code)
- `premium-mobile-gaming-ui`, `oneb-brand-visual`, `ios-visual-qa`
