# Space and guidance pass

A follow-up to the gameplay shell. It answers two questions: where does the
screen waste space, and what does a player who doesn't know the keys need to
see? Measurements use a solo Minotaur Fighter on D:1 at 2000×1154.

## Where the space went

| Area | Before | Now |
| --- | --- | --- |
| Rail below the Plan panel | 390 px empty solo, about 120 px with two heroes | None: the rail is one flex column at every party size and height |
| Turn order, solo | 60 px for a single "Now" row | Hidden when there is one hero |
| Party signals, solo | 44 px for signals nobody receives | Hidden when there is one hero |
| "On this tile" | 300 × 159 px holding one line | Moves into the rail solo, so the log gains 300 px |
| Hero card stats | Two headed rows plus a third row on its own grid | One 3 × 3 matrix sharing a left edge |
| Hero card faith | Own 16 px row | Shares the level and floor row |
| "Banes None" | Own row, often floating | Hidden until there is a bane |
| Bribe chip | Empty 18 px chip in the top bar | Hidden unless a bribe is active |
| Direction pad | Fixed 152 × 152 px over the map | Collapses to 52 × 52 px, remembered per browser |

## The rule

The rail is a single flex column. Cards keep their natural height, the Plan
panel stays at the bottom, and the Next step panel takes whatever height is
left. Nothing is sized for one party size, so a new hero or a taller window
cannot reopen a gap. When cards overflow, the guide shrinks to its minimum and
the rail scrolls as it did before.

Two steps change with room: a lone hero on a window at least 860 px tall gets
the tile panel in the rail, and the reference and tip blocks appear only when
that free height exists. Short windows and parties keep the footer layout.

## Guidance for less experienced players

- **Next step** names one sensible action and why. It reads hit points, nearby
  enemies, ground items, stairs and floor completion. The same action is lit in
  the action row. It only suggests: the engine still decides what is legal.
- **Click preview** shows what a click will do before it happens. The cursor
  changes for walking, attacking, grabbing and blocked tiles, a dashed route
  shows the path, and the readout gives the move count. It is cleared when the
  pointer leaves the map.
- **Go** is in the action row and the command palette. It walks to the nearest
  known stairs, or opens the native `G` prompt for any other destination. The
  `G` key itself is unchanged for players who already use it.
- **Attack info** (`@`) is now a card instead of log lines: damage per hit,
  attack speed, damage per turn, the engine's breakdown, and how to attack. It
  takes no turn.

## Known limits

The move count comes from a client route search limited to 32 steps, so longer
routes read "Walk here" with no count. Native travel can take a different path
when it avoids traps or exclusions. Stairs in Go use remembered map cells, so a
staircase the hero has not seen is not offered.
