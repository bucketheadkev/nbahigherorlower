# Agent guide — 1B Run

Shared Next.js game (website + Capacitor iOS). Read `PLATFORM.md` before platform-sensitive edits. **Physical iPhone / Xcode is the visual source of truth.**

## Quality bar

Produce premium mobile sports-game polish (hierarchy, typography, lighting, motion, touch). Do not ship generic AI website aesthetics. Preserve brand tokens in `app/oneb-theme.css` and existing gameplay unless explicitly asked to change them.

## Project skills

### Custom (`.cursor/skills/`)

| Skill | Use for |
|-------|---------|
| `home-production-pipeline` | Home concepts → approve → implement (**Stitch not required**) |
| `oneb-brand-visual` | Colors, type, brand lock |
| `premium-mobile-gaming-ui` | Screen UX, spacing, hierarchy, touch |
| `cinematic-motion-graphics` | Splash/timelines/microinteractions |
| `ios-visual-qa` | Device / WebView / build acceptance |

### Design toolchain (`.agents/skills/`)

| Skill | Use for |
|-------|---------|
| `frontend-design` | Distinctive UI craft (constrained by brand) |
| `gsap-*` | GSAP timelines when implementing motion |
| `rive` | Authored motion / `.riv` guidance (no runtime until approved) |
| `stitch::*` | **Optional only** — use Google Stitch **only if the user explicitly asks** |

**Google Stitch is disabled from the default design workflow.** Skills remain installed for optional revival; do not auto-invoke Stitch for Home or UI work.

Pipeline notes: `design/PIPELINE-SETUP.md`.

### Installed upstream (`.agents/skills/`)

| Skill | Use for |
|-------|---------|
| `frontend-design` | Distinctive UI craft (constrained by brand skill) |
| `gsap-core` / `gsap-timeline` / `gsap-react` / `gsap-performance` / … | Correct GSAP usage when animating or planning GSAP |

GSAP (`gsap` + `@gsap/react`) is installed and drives Home motion (`useGSAP`, scoped, `contextSafe` handlers). Never animate the same element with both GSAP and framer-motion.

## Activate in chat

- Type `/` and search the skill name (e.g. `/oneb-brand-visual`), or
- Mention the skill by name in your prompt, or
- Rely on auto-discovery: always-on rule `premium-visual-quality` steers UI work toward these skills.

## Shortcuts

- `ios` — run `npm run build:ios` ( Cap sync for Xcode )
- `300` — ensure dev server on :3000 and open the game

## Do not (unless asked)

- Use Google Stitch / `stitch::*` for design generation
- Add animation/runtime dependencies
- Change gameplay, economy, or production infra
- Commit, push, or deploy
- Run Supabase migrations
