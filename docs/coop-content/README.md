# Co-op content and native flavour

The saved multiplayer mode owns content eligibility. Party size and connected
client count do not: a multiplayer game can temporarily have one hero, and a
solo game can have several locally controlled companions.

`coop-content.h` / `coop-content.cc` centralize dedicated item, artefact, monster
and spell classification. Generation, libraries, memorisation, casting, reading,
evocation and equipment selection use the same policy. The raw spell registry
remains independent of mode for save IDs, metadata export and engine validation.
Native Lua exposes `you.multiplayer()` to the three dedicated vault vetoes.
Normal solo-capable spells, Auramancy auras and the Paladin's intervention retain
their solo uses.

## Revised content

- **Prayer of Fellowship** replaces Pantheon Convergence at the same saved
  ability ID. Zin, Elyvilon and The Shining One can answer a prayer for nearby
  faithful companions. It heals and briefly regenerates participants, observes
  penance, sight and floor boundaries, and cannot grant other gods' signature
  powers or turn disagreement into a free attack.
- **Linked Ward**, **Song of Fellowship** and **Cleansing Mist** retain their
  saved spell IDs. Their schools and descriptions now use Translocations,
  Hexes, Alchemy and Auramancy. Casting requires a living companion in clear
  sight. The song grants slaying/evasion without universal cleaving; the mist
  removes exactly poison, corrosion and slow, with no extra smiting/torment ward.
- Religious compatibility follows native shared faith and the good gods'
  explicit affinity. Joining a faith, receiving a gift or witnessing another
  hero's conduct no longer causes invented jealousy, HP loss or piety theft.
  Native personal conduct, apostasy and wrath remain authoritative. Shared kill
  credit and Uskayaw/Beogh progress still use their native systems.
- Automatic elemental combo explosions and background-based passive buffs are
  removed. Backgrounds remain starting kits. Cooperation instead uses chosen
  spells, equipment, normal elemental interactions and positioning.
- Dedicated consumables, jewellery, four devices, six unrandarts, two specialist
  enemies and three vaults require multiplayer. Random and explicit generation,
  unweighted monster selection and polymorph selection observe the boundary.
  Existing IDs remain readable; remembered spells and carried equipment are
  checked when used.
- Paired weapons, support items and specialist enemies use expedition, dwarven,
  Vaults and Abyssal imagery instead of cosmic/eclipse terminology. The paired
  guardian vault uses ruined archways rather than allied TSO/Dithmenos altars.

## Selection and previews

Room mode travels through the browser preview request into the native party
configuration, and participates in cache identity. Native metadata exports the
multiplayer-only spell names. Background guides consume that metadata and
refresh when room mode changes. Starting libraries are obtained from the actual
native preview, including solo rosters and multiplayer leaders/companions.

## Validation scope

`run_validation.py` builds an isolated snapshot with two compiler jobs while
holding the shared host reservation. `check_native_preview.py` exercises six
actual no-save starting previews. Catch2 covers eligibility, explicit generation,
libraries, effect targeting, faith, penance, failed casts, native map vetoes,
religious collateral effects and the existing Paladin/party/save contracts.

The snapshot keeps unrelated concurrent artwork changes outside this task's
source overlay. Receipts record both the frozen integration source and the
working files owned by this change. Local verification does not constitute a
production deployment or a fresh multiplayer browser playtest.

The final [acceptance receipt](acceptance.json) records a successful native build,
108 assertions in eight co-op cases, 545 assertions in 42 regression cases, six
real no-save previews and ten preview-service tests. Final pure Node artwork
parity passes for 446 spells and 172 static abilities. Earlier failed build,
fixture and missing-mapping receipts remain in the numbered attempt folders;
their failures are not overwritten by the final acceptance receipt.

All owned heavy reservations are closed and released. No deployment or fresh
multiplayer browser gameplay acceptance was performed in this task.
