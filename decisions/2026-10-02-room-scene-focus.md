## Decision: Keep the room exploration view free of development-only puzzle shortcuts

## Context: The room scene combines a finished illustrated background with greybox progression cards and keyboard shortcuts that expose inventory and the shadow-boat puzzle outside the intended story flow. The transparent puzzle overlay also leaves the room visible beneath large shadow geometry, making the puzzle look like unrelated graphics pasted onto the room.

## Alternatives considered: Keep the shortcuts and label them more clearly; hide only the keyboard handler; or remove the shortcuts and focus the puzzle with a proper modal treatment.

## Reasoning: The room should communicate the story and clickable objects without visible development controls. The puzzle is a distinct observation interaction, so dimming the room and containing its light-and-shadow composition in a focused overlay makes its visual language legible.

## Trade-offs accepted: Developers lose the I/B keyboard shortcuts for previewing inventory and opening the puzzle directly; reaching the puzzle now follows its actual progression prerequisites.
