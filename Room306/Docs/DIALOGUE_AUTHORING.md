# Room 306 — Dialogue Authoring Guide

The dialogue system uses **DialogueGraph** ScriptableObjects with nodes, choices, conditions, and effects.

---

## Creating a Conversation

1. Right-click in Project → **Create → Room306 → Dialogue → Dialogue Graph**
2. Set `conversationId` (unique string, e.g. `ch2_officer_interrogation`)
3. Set `defaultSpeakerId` matching a `CharacterData` asset
4. Set `startNodeId` to your first node's `nodeId`
5. Add nodes to the `nodes` list

---

## Node Fields

| Field | Purpose |
|-------|---------|
| `nodeId` | Unique within graph |
| `speakerId` | Character ID or `narrator` |
| `emotion` | Portrait variant |
| `text` | Dialogue line (supports typing animation) |
| `nextNodeId` | Auto-advance target (if no choices) |
| `choices` | Branching options |
| `conditions` | Gate: skip node if false |
| `onEnterEffects` | Run when node displays |
| `endsConversation` | Close dialogue after this node |
| `addToHistory` | Record in dialogue history / notebook |
| `voiceClip` | Optional VO hook |

---

## Choices That Matter

Every **important** choice should:

1. Set a **flag** (`DialogueEffectType.SetFlag`)
2. Modify **trust/fear** or **relationship**
3. Gate future dialogue via `DialogueCondition`
4. Mark `isImportant = true` (red UI highlight)

Example — trusting Maya in Chapter 1:
```
Effect: SetFlag "believed_visitor_one"
Effect: ModifyTrust +10
Effect: ModifyRelationship "visitor_one" trust +15
```

This enables:
- Escape ending (requires `believed_visitor_one`)
- Different Officer Reed dialogue in Chapter 2
- Maya reference in Chapter 4 revelation

---

## Condition Types

| Type | Key | Value | Example |
|------|-----|-------|---------|
| HasFlag | flag name | — | `basement_key_obtained` |
| MissingFlag | flag name | — | `ch1_complete` |
| IntVariable | var name | int | `knock_count >= 3` |
| TrustLevel | — | int | trust >= 50 |
| FearLevel | — | int | fear >= 70 |
| HasItem | item id | — | `basement_key` |
| ChapterAtLeast | — | chapter index | chapter >= 3 |
| RelationshipTrust | character id | int | maya trust >= 40 |

---

## Effect Types

| Type | Usage |
|------|-------|
| SetFlag / ClearFlag | Story progression |
| ModifyTrust / ModifyFear | Global stats |
| ModifyRelationship | Per-character |
| SetIntVariable / SetBoolVariable | Custom counters |
| GiveItem / RemoveItem | Inventory |
| PlaySound | SFX by ID |
| AdvanceChapter | Chapter transition |

---

## Character Setup

1. Create **CharacterData** per NPC (`Assets/_Project/Data/NPCs/`)
2. Assign portraits for each emotion in `portraitSet`
3. Register in `DialogueManager` → `characterDatabase` array

---

## Conversation Memory

- `DialogueHistory` records all lines automatically
- `RecordChoice(choiceId)` tracks selected options
- Use `WasChoiceSelected(choiceId)` in conditions via flag pattern:
  - Important choices set flag `choice_used_{choiceId}` when `hideAfterSelected = true`

---

## Placeholder Content

Run **Room306 → Generate Placeholder Dialogue** to create:

| Asset | Content |
|-------|---------|
| CH1_OwnerAndVisitorOne | Check-in, outage, Maya, cliffhanger |
| CH2_PoliceOfficer | Contradictions, basement hint |
| CH3_RealityDistortion | Room shift, lightning girl |
| CH4_Revelation | Businessman, tape recorder |
| CH5_FinalConfrontation | Three ending branches |

---

## Wiring NPCs

On NPC prefab, add `NPCInteractable`:
- `defaultConversation` → base graph
- `conditionalConversations[]` → alternate graphs
- `conversationRequiredFlags[]` → parallel flag requirements

For Visitor Three (lightning only):
- Enable `onlyVisibleDuringLightning`
- Assign `spriteRenderer`

---

## Authoring Tips

1. **No fake choices** — every `isImportant` choice must set a flag or stat
2. **Plant callbacks** — reference earlier choices in later chapters
3. **Use narrator** for environmental storytelling
4. **Keep nodes short** — 1–3 sentences for typing readability
5. **Test branches** — use Dialogue History UI to verify all paths

---

## Flag Naming Convention

```
ch{N}_complete          # Chapter completion
believed_visitor_one    # Major choice outcomes
lied_to_police
found_all_clues
basement_key_obtained
examined_{object}       # Examine interactions
choice_used_{choiceId}  # Hidden one-time choices
```

---

## Example: Conditional Line

Officer Reed if player lied in Ch2:

**Node conditions:**
- Type: `HasFlag`
- Key: `lied_to_police`

**Text:** "Funny thing. The security camera shows you opened your door at 3:06."

If player told truth, use alternate node with `MissingFlag: lied_to_police`.
