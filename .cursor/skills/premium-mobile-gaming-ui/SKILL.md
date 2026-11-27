---
name: premium-mobile-gaming-ui
description: >-
  Designs and reviews 1B Run screens for premium mobile sports-game polish:
  hierarchy, touch UX, typography, depth, spacing, and console-grade feel.
  Use when building or refining UI, menus, splash, shop, settings, home, draft,
  results, or any visual/UX pass on phone-sized layouts.
---

# Premium Mobile Gaming UI

Target quality: a shipped sports mobile game (NBA 2K Mobile / Madden / FIFA companion polish), **not** a marketing site or generic AI dashboard.

Read and obey alongside `oneb-brand-visual`, `PLATFORM.md`, and `app/oneb-theme.css` tokens. Do not invent a second brand.

## Non-negotiables

1. **Phone-first composition** — Design for portrait ~390×844 first; desktop is secondary. Thumb reach, safe areas, and one clear focal action per screen.
2. **One job per surface** — Each screen has one primary purpose and one primary CTA. Secondary actions are quieter.
3. **Hierarchy over decoration** — Size, weight, contrast, and spacing create hierarchy. Do not add cards, pills, chips, or badges unless they aid a real interaction.
4. **Preserve functionality** — Visual upgrades must not change gameplay rules, economy, or navigation contracts unless the user explicitly asks.
5. **iPhone is truth** — Browser preview is a draft. Final acceptance is a physical device / Xcode build (`npm run build:ios` when the user asks for `ios`).

## Layout & spacing

- Prefer a single vertical rhythm (8px base). Align edges; avoid “almost aligned” stacks.
- Generous breathing room around the hero; tighter grouping for related controls.
- Avoid dashboard grids of equal cards. Use a clear top hero → mid action → bottom utility stack.
- Keep critical CTAs in the lower thumb zone when the flow is action-led; keep brand/identity upper when the flow is identity-led (splash/home).
- Respect notches / home indicator: avoid edge-clipped hit targets; leave bottom inset for primary buttons on full-screen shells.

## Typography

- Use the established stack: **Avenir Next Condensed** (display / titles), **Avenir Next / SF Pro Display** (UI body). Do not introduce Inter, Roboto, system-ui as the design voice, or random Google fonts.
- Clear scale: display → title → body → meta. Do not invent a fifth competing size on one screen.
- Prefer sentence case for buttons and labels. Avoid ALL-CAPS label spam and single-word accent coloring in headlines.
- Numbers that matter (cash, XP, multipliers) should read as premium data — tabular feel, high contrast, not buried in chrome.

## Visual depth & lighting

- Depth comes from layered navy atmospheres, soft vignettes, controlled specular highlights, and grounded shadows — not flat gray panels or purple glows.
- Lighting should feel arena/stadium: directional, intentional, sparse. One light idea per scene.
- Prefer subtle grain/noise or gradient atmosphere already in the theme over new noisy overlays.
- No glassmorphism stacks, neon outlines, or multi-layer drop shadows that fight the brand.

## Touch & interaction

- Minimum comfortable hit area ~44×44pt; increase for primary actions.
- Press feedback must be immediate (scale/opacity/brightness), 100–180ms, ease-out — not sluggish.
- Disable dead zones: decorative layers must not block taps (`pointer-events` discipline).
- Loading and empty states give direction, not apologies. Errors are specific and recoverable.
- Support reduced motion: if a flourish is removed, the UI still communicates state clearly.

## Anti-patterns (reject these)

- SaaS card kits, cream+terracotta “AI landing” looks, purple-indigo gradients, broadsheet newspaper grids
- Equal-weight pill clusters, stat strips, icon rows that dilute the focal action
- Hover-only affordances with no pressed/selected mobile state
- Tiny meta text competing with the primary CTA
- Redesigning the whole shell when asked to polish one moment

## Workflow

1. Name the screen’s single job and primary CTA.
2. Check tokens in `app/oneb-theme.css` before adding new colors.
3. Sketch hierarchy (hero → action → utility) before coding.
4. Implement with existing components/CSS patterns when possible.
5. Self-critique: remove one accessory; verify contrast and thumb reach.
6. If the user requested device verification, remind that Xcode/iPhone confirms the pass.

## Related skills

- Brand lock: `oneb-brand-visual`
- Motion: `cinematic-motion-graphics` (+ GSAP / Motion skills when coding animation)
- Device QA: `ios-visual-qa`
- Distinctive UI craft: `frontend-design` (constrain with brand skill — never override 1B Run identity)
