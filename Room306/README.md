# Room 306

A commercial-quality 2D narrative mystery game built with **Unity 6 LTS** and **C#**.

You check into an old roadside motel during a thunderstorm. At exactly 3:06 AM, someone knocks. You never leave.

---

## Requirements

- Unity 6 LTS (6000.0.x)
- Universal Render Pipeline (2D)
- Input System package
- TextMeshPro

---

## Quick Start

1. Open the `Room306` folder in Unity Hub.
2. Allow Unity to import packages and generate project files.
3. Open scene `Assets/_Project/Scenes/Bootstrap.unity` (create from setup guide below).
4. Run menu **Room306 → Generate Placeholder Data** and **Room306 → Generate Placeholder Dialogue**.
5. Press Play from Bootstrap scene.

---

## Project Structure

```
Room306/
├── Assets/
│   └── _Project/
│       ├── Animations/          # Character walk cycles, door open, UI tweens
│       ├── Art/
│       │   ├── Characters/      # 32x32 or 48x48 pixel spritesheets
│       │   ├── Environment/     # Tilesets, motel rooms, props
│       │   ├── Portraits/       # 128x128 dialogue portraits per emotion
│       │   ├── UI/              # Menus, HUD, inventory frames
│       │   └── VFX/             # Rain, lightning, fog spritesheets
│       ├── Audio/
│       │   ├── Ambient/         # Rain loop, motel hum, wind
│       │   ├── Music/           # Piano themes per chapter
│       │   └── SFX/             # Footsteps, doors, knocks, typing
│       ├── Data/
│       │   ├── Chapters/        # ChapterData ScriptableObjects
│       │   ├── Dialogue/        # DialogueGraph assets
│       │   ├── Items/           # InventoryItem assets
│       │   ├── Notebook/        # NotebookEntryData assets
│       │   └── NPCs/            # CharacterData assets
│       ├── Prefabs/
│       │   ├── Characters/      # Player, NPCs, visitors
│       │   ├── Environment/     # Doors, examine objects, clocks
│       │   ├── Managers/        # Bootstrap manager prefabs
│       │   ├── UI/              # Canvas, dialogue panel, menus
│       │   └── VFX/             # Rain, lightning, fog prefabs
│       ├── Scenes/
│       │   ├── Bootstrap.unity
│       │   ├── MainMenu.unity
│       │   ├── MotelLobby.unity
│       │   ├── MotelHallway.unity
│       │   ├── Room306.unity
│       │   └── Basement.unity
│       ├── Scripts/             # All C# (see Architecture below)
│       └── Settings/
│           ├── Input/           # GameInputActions.inputactions
│           ├── URP/             # Render pipeline assets
│           └── GameSettings.asset
├── Packages/manifest.json
└── ProjectSettings/
```

---

## Architecture

| System | Scripts | Responsibility |
|--------|---------|----------------|
| **Core** | `GameBootstrap`, `GameServices`, `SceneLoader`, `GameStateManager` | Boot, DI, scenes, state machine |
| **Input** | `InputManager` | WASD, gamepad, rebinding |
| **Dialogue** | `DialogueManager`, `DialogueUI`, `DialogueConditionEvaluator`, `DialogueEffectExecutor`, `DialogueHistory` | Branching dialogue engine |
| **Narrative** | `StoryFlagManager`, `RelationshipManager`, `DialogueVariableStore`, `ChapterManager`, `EndingCalculator` | Story state, endings |
| **Gameplay** | `PlayerController`, `PlayerInteraction`, `Interactable`, `Door`, `ExamineObject`, `NPCInteractable`, `StoryTrigger` | Top-down exploration |
| **Inventory** | `InventoryManager`, `NotebookManager` | Items, evidence, notebook |
| **Save** | `SaveManager`, `SaveData`, `AutosaveTrigger` | Multi-slot + autosave |
| **UI** | `MainMenuUI`, `PauseMenuUI`, `SettingsManager`, `HUDController`, `ExamineUI`, `InventoryUI`, `NotebookUI` | All menus |
| **Audio** | `AudioManager`, `AmbientSoundZone`, `SfxLibrary` | Music, SFX, ambient |
| **Visual** | `RainController`, `LightningController`, `FlickeringLight`, `ScreenShake`, `FogController`, `DynamicLight2D` | Atmosphere |

---

## Scene Setup (First Time)

### Bootstrap Scene
1. Create empty scene `Bootstrap`.
2. Add `GameBootstrap` component to empty GameObject `[_Bootstrap]`.
3. Create manager prefabs (empty GameObjects with respective components + DontDestroyOnLoad):
   - `InputManager` → assign `GameInputActions`
   - `SaveManager`
   - `StoryFlagManager`, `RelationshipManager`, `DialogueVariableStore`, `DialogueHistory`
   - `DialogueManager` → assign CharacterData array
   - `InventoryManager`, `NotebookManager`
   - `AudioManager`, `SettingsManager`
   - `GameStateManager`, `ChapterManager`
4. Add `SceneLoader` with fade CanvasGroup overlay.
5. Add to Build Settings index 0.

### Gameplay Scene Template
1. Tilemap layers: Floor, Walls, Furniture, Collision.
2. Player prefab: Rigidbody2D, Animator, `PlayerController`, `PlayerInteraction`, tag `Player`.
3. Main Camera + `CameraFollow` + URP 2D Global Light.
4. Canvas (Screen Space) with HUD, Dialogue, Pause UI.
5. Empty `[Environment]` with Rain/Lightning/Fog prefabs.
6. Place `PlayerSpawnPoint` and `AutosaveTrigger` volumes.

---

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move | WASD | Left Stick |
| Interact | E | A / Cross |
| Inventory | Tab | Y / Triangle |
| Notebook | J | X / Square |
| Pause | Esc | Start |

Rebindable in Settings menu.

---

## Story Chapters

1. **Arrival** — Owner check-in, power outage, Visitor One (Maya), 3:06 knock cliffhanger
2. **Contradictions** — Officer Reed, basement locked, hidden photographs
3. **Distortion** — Rooms shift, Visitor Three (girl in lightning), memory unlocks
4. **Revelation** — Mr. Ashford, tape recorder, every conversation connects
5. **Confrontation** — Unknown Figure, multiple endings (Escape, Acceptance, Confrontation, Descent, Loop)

---

## Endings

Determined by `EndingCalculator` using flags + trust/fear:

- **Escape** — All clues, basement key, high trust, believed Maya
- **Confrontation** — Confronted Unknown Figure
- **Descent** — High fear + entered basement
- **Acceptance** — Accepted fate flag
- **Loop** — Default; wake at 3:06 again

---

## Editor Tools

- **Room306 → Generate Placeholder Dialogue** — Creates all 5 chapter dialogue graphs
- **Room306 → Generate Placeholder Data** — Creates characters, items, notebook entries

---

## Steam Readiness Checklist

- [ ] Replace placeholder art/audio with final assets
- [ ] Complete all dialogue graphs with voice acting hooks
- [ ] Add Steamworks SDK integration (achievements per ending)
- [ ] Build Windows/Mac/Linux via Unity Build Profiles
- [ ] Store page assets: capsule, screenshots, trailer
- [ ] ESRB/PEGI content rating ( horror themes, psychological )

---

## Documentation

- [Art Asset Guide](Docs/ART_ASSET_GUIDE.md)
- [Audio Asset Guide](Docs/AUDIO_ASSET_GUIDE.md)
- [Dialogue Authoring Guide](Docs/DIALOGUE_AUTHORING.md)

---

## License

Project architecture and code © Room306 Studio. Replace placeholder assets before commercial release.
