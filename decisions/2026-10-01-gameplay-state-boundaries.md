## Decision: Keep chapter rules, session state, persistence, and rendering in separate modules

## Context: The chapter's Phaser scenes directly mutated save data, item prerequisites were scattered across click handlers, storage failures were swallowed, and chapter completion lived in a second progress store.

## Alternatives considered: Keep state in the scenes and add local guards; move only save/load code out; or give the chapter a pure rule reducer and a non-Phaser session that uses a shared persistence adapter.

## Reasoning: The reducer makes prerequisite and completion rules independent of rendering, the session owns the active chapter snapshot across scene lifetimes, and the persistence adapter can keep an in-memory copy if browser storage rejects a write. Chapter one completion is recorded in the same chapter save as its three fragments, so the island derives that fact from the same source.

## Trade-offs accepted: Scenes still choose when to dispatch gameplay events and save snapshots. The island keeps a separate list for later chapters, so only chapter one's completion is unified with its room state. Memory fallback survives scene changes in the current page, not a full browser reload.
