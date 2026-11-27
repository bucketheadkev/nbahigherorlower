---
name: home-production-pipeline
description: >-
  Orchestrates premium Home screen production for 1B Run. Default path evolves
  the existing Home with brand/UI/motion skills. Google Stitch is optional and
  only used when the user explicitly requests it. Optional Figma bridge and Rive
  guidance may follow. Implement only after user approval.
  Use when generating Home concepts, art direction, design variants, or before
  any Home visual implementation.
---

# Home production pipeline (1B Run)

**Goal:** Ultra-premium mobile basketball Home concepts that feel like a shipped sports game — **not** generic AI dashboards and **not** CSS/SVG hero inventiveness.

**Default engine:** Evolve the **existing 1B Run Home** (composition, identity, chrome, proven assets) using:

- `oneb-brand-visual`
- `premium-mobile-gaming-ui`
- `frontend-design` (constrained by brand)
- `cinematic-motion-graphics`
- `ios-visual-qa` at acceptance

**User role:** Review and approve concepts. Do not ask the user to draw in Figma, paint assets, or learn Rive unless they opt in.

**Hard rules:**

- Do **not** implement Home UI/CSS/React redesigns until the user explicitly approves a concept.
- Do **not** invent hero art with SVG/Canvas/CSS “courts” when photographic/authored art is required.
- Do **not** use Google Stitch / `stitch::*` skills unless the user **explicitly** asks for Stitch.

## Required brand locks (every concept)

- Product: **1B RUN**
- Subtitle: **CHASE $1 BILLION** with **$1 BILLION** in money-green
- Palette family: deep navy arena, basketball orange CTAs, money green for wealth
- Platform: portrait iPhone-first (~390×844), Capacitor WebView
- Preserve existing Home **functionality** when implementing later (Play, Modes, Bank board, Wall of Fame, hub tabs)

## Tooling order

### 1. Art direction + concepts (default — no Stitch)

1. Ground on the current Home (screenshots / `TradeUpHome` structure / approved reference plates).
2. Propose **three genuinely distinct** evolutions (different background metaphor, materials, and nav craft — not three color swaps).
3. Present each with a one-line thesis and visual mock or clear art direction. **Stop for user approval.**

### 2. Google Stitch (optional — explicit request only)

Only if the user asks for Stitch:

1. Confirm Stitch MCP is available.
2. Use `stitch::generate-design` / related stitch skills.
3. Apply brand tokens; generate concepts; present screenshots/links; stop for approval.

Skills under `.agents/skills/stitch-*` remain installed for optional use; they are **not** required for Home work.

### 3. Optional canvas refine → **Figma MCP Bridge**

- Only if refinement/componentization is needed and the user wants Figma.
- Requires Figma Desktop + `design/tooling/figma-mcp-bridge-plugin` running.

### 4. Motion guidance → **`rive` skill** (+ GSAP skills for UI timelines)

- Spec ambient/hero motion against the approved concept.
- GSAP is installed (Home rh7 uses it). Do **not** `npm install` Rive runtime until the user approves.
- Note: free Rive Editor exports may include a splash watermark — flag before shipping.

### 5. Implementation (only after approval)

- Map approved direction + assets into shared Next/Capacitor Home.
- Follow `oneb-brand-visual`, `premium-mobile-gaming-ui`, `cinematic-motion-graphics`, `ios-visual-qa`.
- Gate on physical iPhone via `npm run build:ios` when user asks `ios`.
- Prefer real plates / authored assets over programmatic courts.

## Anti-patterns

- Mandatory Stitch generation for every Home task
- CSS-only or SVG-court “hero” pretending to be production art
- Generic AI dashboards, purple gradients, cream+terracotta, equal card grids
- Blue PLAY buttons (brand CTA is basketball orange)
- Implementing before concept approval
- Asking the user to manually design or learn animation tools

## Output when generating concepts

For each of 3 concepts:

1. **Name** (short)
2. **Thesis** (one sentence)
3. **Reference** (mock path, plate, or optional Stitch link if used)
4. **Visual differentiator** vs the other two
5. **Motion intent** (2–3 beats, no code)

Then ask which concept to advance — do not code yet.
