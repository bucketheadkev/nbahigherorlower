# Design production pipeline — setup (1B Run)

**Status (Nov 2026):** Google Stitch is **disabled from the active design workflow**. Prior Stitch concept output underperformed vs our original Home. Skills remain installed for optional use if you explicitly request Stitch later.

**Default path:** Evolve the existing Home with `oneb-brand-visual`, `premium-mobile-gaming-ui`, `frontend-design`, and `cinematic-motion-graphics`. Approve before implement. Physical iPhone is acceptance.

## Status checklist

| Integration | Installed in repo | Active by default? | Notes |
|-------------|-------------------|--------------------|-------|
| Brand / UI / motion skills | Yes (`.cursor/skills/…`) | **Yes** | Primary design path |
| Stitch skills | Yes (`.agents/skills/stitch-*`) | **No** | Only if you explicitly ask |
| Stitch MCP | Key may exist in `~/.cursor/mcp.json` | **Disabled in workflow** | Do not auto-call; remove/disable MCP entry to hard-off |
| Figma MCP Bridge | Config + plugin folder | Optional | Desktop plugin when needed |
| Rive skill | Yes (`.agents/skills/rive`) | Guidance only | No runtime until approved |
| `home-production-pipeline` | Yes | **Yes** | Stitch not required |

## A. Default Home / UI design (no Stitch)

1. Ground on current Home screenshots / structure / approved plates.
2. Propose distinct evolutions (materials, background art direction, nav craft).
3. Stop for approval before any game implementation.
4. Prefer real photographic/authored assets over SVG/CSS “courts.”

## B. Google Stitch (optional — explicit request only)

Skills under `.agents/skills/stitch-*` are preserved. To revive Stitch intentionally:

1. Ensure MCP `stitch` is configured in `~/.cursor/mcp.json` (key outside repo).
2. Ask Agent explicitly to use Stitch (e.g. “use Stitch to generate…”).
3. Verify with `node scripts/verify-stitch-mcp.mjs` if needed.

Repo template only (no secrets): `.cursor/mcp.json.example`.

## C. Figma MCP Bridge (optional)

Free local bridge — **no Figma API quota**. Needs Figma **Desktop**.

1. Install/open [Figma Desktop](https://www.figma.com/downloads/).
2. **Plugins → Development → Import plugin from manifest…**
3. Select `design/tooling/figma-mcp-bridge-plugin/manifest.json`
4. Open a file → run **Figma MCP Bridge** (leave connected).

## D. Rive skill (motion guidance only for now)

- Skill installed: no purchase, no runtime in the game.
- Do **not** install `@rive-app/*` until you approve a runtime.
- Free Rive exports may watermark — flag before shipping.

## Security

- Never commit `.cursor/mcp.json` with a real key (gitignored).
- Rotate/delete Stitch keys in Stitch settings if leaked.
