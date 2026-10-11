# BDD fidelity audit (Phase 13.3)

Inventory of world/step helpers that used to compute what the app computes, and their replacements.

| Helper | Was | Now |
| --- | --- | --- |
| `ClubboxWorld.filteredHallway` | Local `topicKey === selectedTopic` filter (missed live `logging_context.topic_key = null`) | Renamed `hallwayRoomsForSelection` → calls `prepareHallwayChannels` |
| `ClubboxWorld.applyHallwayDisplay` | Already called `prepareHallwayFeedRooms` | Renamed `hallwayDisplayRoomsFromPrefs` — still real module |
| `features/steps/hallwayLive.steps.ts` | Uses `prepareHallwayChannels` / `usableFeedTopics` | Unchanged — real module |
| `features/steps/hallway.steps.ts` keyword/highlight | `roomTitleKeywordHits`, `splitKeywordHighlight` from src | Unchanged |
| `ClubboxWorld.refreshModerationControls` / `refreshHostControls` | `roomControlFlags` from src | Unchanged |
| `ClubboxWorld.refreshClipButtonVisibility` | `clipButtonVisible` from src | Unchanged |
| `ClubboxWorld.persistStudioDevices` | `readAudioPrefs` / `writeAudioPrefs` from src | Unchanged |

Guard: `tests/bddFidelity.test.ts` fails if `world.ts` reintroduces `/^(filter|sort|apply|compute|derive|prepare)/` local functions, or if a non-`@local` feature's step file imports nothing from `src/`.
