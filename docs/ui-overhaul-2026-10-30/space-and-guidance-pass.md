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

The rail is a single flex column. Cards and Next step keep their natural height
and the Plan panel stays at the bottom. Spare height stays free for the enemy
rail and party cards, which grow during play.

The footer strip (minimap, tile panel and combat log) changes with the window's
shape. The map is a square limited by height, so a wide column has unused width
beside it. When that spare width is at least 150 px, the strip stands there at
240 to 380 px wide and the map takes the column's full height. Tall windows,
narrow windows and arranged panels keep the footer. Only the window's shape
decides this, so party size and hero card height cannot change the layout.

Next step first filled all spare height with a controls reference and a rotating
tip. Both moved into [tutorial tips](../tutorial-tips.md), which show them when
they apply.

| Window | Map before | Map now | Log now |
| --- | --- | --- | --- |
| 1280×720 | about 417 px tall | 557×557 | 355×336 |
| 1440×900 | 1050×651 | 804×804 | 245×568 |
| 1512×860 | about 600 px tall | 764×764 | 357×543 |
| 1920×1080 | about 825 px tall | 1150×984 | 379×763 |
| 1100×900 or narrower | Unchanged | Unchanged | Unchanged |

"Before" figures other than 1440×900 are calculated from the footer's height.
The log loses width and gains height: about 25 lines at 1440×900, up from 9.

