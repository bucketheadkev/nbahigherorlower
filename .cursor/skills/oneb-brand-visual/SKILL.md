---
name: oneb-brand-visual
description: >-
  Enforces 1B Run brand identity: navy arena palette, basketball orange,
  money green, Avenir typography, icon-derived tokens, and anti-generic-AI
  visual rules. Use whenever changing colors, type, splash, home, chrome,
  marketing surfaces, or when frontend-design skill might drift from brand.
---

# 1B Run Brand & Visual Identity

**Product:** 1B Run — premium basketball money-run game (shared web + iOS).  
**Color source of truth:** `public/images/1b-run-app-icon.png` → tokens in `app/oneb-theme.css`.  
**Platform truth:** `PLATFORM.md`. Physical iPhone / Xcode build confirms visual quality.

When `frontend-design` conflicts with this skill, **this skill wins**. Distinctiveness means deepening *this* arena identity — not inventing a new one.

## Brand essence

- Dark arena night: deep navy voids, electric rim light, basketball heat, payout green.
- Confident, athletic, high-stakes — not cute, not SaaS, not crypto-neon, not newspaper editorial.
- Icon-led: treatment should feel like it belongs next to the app icon.

## Core tokens (do not replace)

| Role | Token / value |
|------|----------------|
| Void / ink | `--brand-navy-deep` `#010814`, `--brand-navy` `#03102c` |
| Mid arena | `--brand-navy-mid` `#061a4a`, panels `#072056` / `#0a2a6e` |
| Electric blue | `--brand-blue` `#0047c8` → `--brand-blue-bright` `#1a7dff` → `--brand-blue-highlight` `#4da3ff` |
| Glow RGB | `--brand-blue-glow: 26, 125, 255` |
| Basketball | `--basketball-orange` `#e55622` (+ highlight/deep) |
| Money / win | `--money-green` `#29e490` |
| Text | white primary; `--oneb-silver*` secondary |
| Radius | `--oneb-radius*` family |
| Shadow | `--oneb-shadow`, `--oneb-shadow-panel` |

Add new hex values only when sampling from the icon or an approved asset. Prefer existing CSS variables over one-off literals.

## Typography

- Display / condensed titles: **Avenir Next Condensed**
- UI / body: **Avenir Next**, **SF Pro Display**, Helvetica Neue fallbacks
- Do not switch the product to Inter, Roboto, Geist, or generic system stacks as the brand voice
- Maintain existing size clamps and screen-specific type scales when editing

## Surfaces & chrome

- Prefer arena atmosphere (`.arena-atmo` patterns, vignettes, controlled glows) over flat `#111` panels
- Lines and dividers: blue-glow hairlines (`--oneb-line`), not harsh white rules
- Primary actions: brand blue or orange per existing button patterns — do not invent a third accent family
- Money moments may use green; do not green-wash the whole UI

## Hard bans (generic AI tells)

Do **not** drift into:

1. Warm cream + terracotta/serif “Claude default” landing
2. Purple → indigo gradient themes or purple glow stacks
3. Broadsheet / dense newspaper columns / zero-radius editorial kits
4. Identical soft gray card grids with decorative gradient washes
5. Tracked ALL-CAPS eyebrows on every heading, middle-dot meta strips, monospace data chic as decoration
6. Emoji as primary visual identity

## Change discipline

- Preserve established brand identity and existing functionality unless the user explicitly requests a redesign.
- Scope visually: polish the named surface; do not “harmonize” unrelated screens in the same pass.
- Shared CSS (`app/oneb-theme.css`, `app/globals.css`, `app/game-ui.css`, `components/tradeup/`) affects **website and iOS**. Classify per `PLATFORM.md` before editing.
- Website-only styling belongs under `html[data-platform='web']` rules when applicable.

## Quick acceptance

- [ ] Colors resolve to theme tokens
- [ ] Type matches Avenir stack
- [ ] Looks like the same game as the app icon
- [ ] No new competing accent hue
- [ ] Still readable on a bright phone screen outdoors (contrast)

## Related skills

- `premium-mobile-gaming-ui`, `cinematic-motion-graphics`, `ios-visual-qa`, `frontend-design`
