# Equipment inheritance, separate extraction and recovery

[Campaign overview](README.md) · [Guild materials and buildings](guild-resources.md) · [Native contracts and probes](contracts.md)

Design proposal, 18 October 2026. The user selected tangible inheritance, individually owned resources, voluntary guild contributions and shared guild buildings. The detailed rules below are recommended policies to test, not implemented native behavior or a settled choice of loss severity.

## Inheritance belongs to accounts and guilds

Heroes can die permanently while their secured property, their owner's resources and the guild's buildings persist. A fresh hero can inherit actual eligible equipment through the guild Armory. It keeps its real properties and remaining usable state. Compatible gear can fill multiple slots; inherited strength is an intended reward.

There are four different questions about an item:

| Question | Meaning | Example |
| --- | --- | --- |
| Who owns it? | Player account or guild with title | The guild owns a Conduit Staff |
| Who borrowed it? | Hero/expedition accountable for its deployment | Beren was issued the staff |
| Who carries it now? | Current native holder or world location | Cora brings it out after Beren falls |
| Who can use the facility? | Membership and service eligibility | All current members can use the Armory, subject to available stock |

Death, trade, transport and disconnection do not silently change ownership. A guild leader cannot confiscate personal materials. An expedition host cannot donate everyone's haul. A player cannot keep a guild loan merely by leaving the guild.

## Acquiring and issuing equipment

Baseline proposal: newly acquired ordinary equipment belongs to its collecting account, unless a visible pre-agreed acquisition rule applies. Players may retain it, gift it or donate it to the guild. A native trade must distinguish an actual gift from a loan/custody handoff; its current inventory movement alone does not establish title.

The Armory displays personal holdings and shared stock together with clear owner labels. Personal gear requires the owner's chosen permission before another player can take it. Guild gear follows the issuing guild's loan policy. Available, reserved, deployed and recoverable items are visible without making users visit separate inventory pages.

Recommended default permissions:

- Members can equip eligible available guild stock; a launch preset reserves its exact instances until launch commits or is cancelled.
- Rare-item commitments and any configured officer approval are visible in the same preparation flow. Ordinary accepted loadouts need no extra checkout ceremony.
- Borrowing equipment permits normal combat use and authorized teammate handoffs. It does not permit donating, selling, dismantling or crafting it into private property.
- Issued consumables explicitly permit consumption. A loaned sword is expected back if recovered; a supplied potion is expected to be used when needed.
- Personal lending names the return owner and whether a teammate may use the item during a rescue. Permission to transport a sealed bag is not permission to equip or spend its contents.
- Lending a guild item to a guest is an explicit issuing-guild choice. Sharing an expedition does not automatically grant access to every participant's guild bank.

Building benefits are shared capabilities. Physical gear remains finite. A new member can use an existing Forge immediately, but cannot borrow a shield already deployed in another run. A completed recipe spends its actual inputs and produces one declared output.

## Four different ways to stop playing

| Event | Hero's status | What happens to property? | Can peers continue? |
| --- | --- | --- | --- |
| Close client / disconnect | Still a participant with reserved control | Remains in the native run; no deposit, death or surrender | Under existing floor/control rules; a threatened waiting hero may still block its local floor |
| Save and suspend | Same hero, same expedition | Remains exposed run property, preserved in the save | Saving is not a new extraction service; existing scheduling applies |
| Deposit cargo | Hero remains in the expedition | Selected property leaves field custody and becomes secured once | Yes; the hero continues without the deposited equipment |
| Extract hero | This hero permanently returns from this expedition | Eligible carried cargo settles once; other heroes' cargo stays where it is | Yes; only the extracting hero leaves |
| Explicitly abandon hero | Consequential final retirement without a secure return | Eligible cargo stays exposed in field recovery custody; no free banking | Yes, under the new participant lifecycle; departure never transfers control of peers |

The basic guild return is at an explicit safe departure point, such as an eligible entrance-side return service. It is available before advanced buildings so the first successful material return can finance construction. Waystations create additional field deposits/returns; later relays can create more powerful but scoped departure options.

A safe service must have defined native access, threat and action rules. It cannot be activated from any fight merely by clicking the Hall. If under-pressure extraction later involves a protected activation, its timing uses explicit native actions and cancellation rules. It does not advance silently while that floor is frozen.

One clear departure action previews what leaves with the hero, which loans return and what remains exposed. Keep the consequential confirmation. Settlement itself is automatic; there is no later claim-rewards step.

## One hero returns; the others keep their expedition

An extraction settles only property actually in that hero's valid cargo or explicitly deposited by them. It does not recall a loan another teammate is still using, teleport an off-floor bag, distribute every guild member's materials or end the party's run.

Settlement destinations follow title:

| Extracted cargo | Destination |
| --- | --- |
| Extracting player's personal gear/materials | Their secured personal holdings under the guild persistence rules |
| Teammate's sealed material share or recovery bag | That teammate's secured personal holdings, with a recovery notification |
| Guild-owned loan | Issuing guild's available Armory/store stock |
| Another player's explicitly lent item | That owner's holdings under the recorded return agreement |
| Consumed or destroyed object | No return; retain the actual consumed/lost state |
| Quest object or special native class | Its explicit native campaign adapter; never assume generic banking is legal |

If a building required for use is absent, the property can remain secured and packed. Securing property does not automatically donate it or construct the building needed to use it.

Once the source item is durably removed and settlement commits, its owner may use it in another expedition even while the original peers continue. An uncertain transfer stays pending and reconciles; it is not simultaneously usable in both places. An extracted hero cannot reconnect into the old incarnation, collect more XP or re-enter to carry another free shipment. A later expedition has a different identity and uses normal launch rules.

The departing player can start another hero while the original expedition continues, subject to real account/session capacity. This includes the host. Ownership of the server process or party room must not make the host's hero a permanent mandatory participant. It does not authorize taking over a peer's hero.

An inactive borrower creates a real deployment cost: gear in a paused save remains unavailable. Show where it is, let the owner resume, extract or explicitly abandon that hero, and allow the guild to restrict future loans. An officer cannot solve inactivity by making a second usable copy or remotely stripping an unsafe hero. A later automated return service would require prior borrower authorization and a valid native safe-return boundary, not merely an elapsed offline timeout.

The expedition closes only when its defined lifecycle has no continuing/returnable participants. Participants retain separate outcomes. A material return is not an Orb victory. Orb acquisition/escape requires a specific quest/outcome adapter before claiming independent native victories; an Orb event cannot automatically secure absent peers' bags or erase their unresolved custody.

## Downed is different from finally fallen

The existing fork has recoverable downing and last-stand behavior. A downed teammate is still part of its run, with native inventory and revival possibilities. A corpse or ghost visual is not sufficient evidence that a second bag of its equipment can be created.

Recommended campaign lifecycle:

| State | Recovery rule |
| --- | --- |
| Alive | Ordinary native use, transfer, deposit and extraction |
| Downed | Native revival remains possible; no inheritance or cross-run duplicate |
| Fallen | Explicit final per-hero loss; eligible remaining cargo has moved once into field recovery custody |
| Extracted | Settled hero is absent from active play; no revival or return to the same incarnation |

An owner can explicitly accept final loss rather than remain a downed participant indefinitely. That is a consequential retirement action, not an inference from being offline. No wall-clock bleed-out is required. Exact last-stand and whole-party terminal transitions need a native adapter.

An alive owner who explicitly abandons a hero follows the same final-loss custody boundary, rather than receiving extraction proceeds. It is a usable way to leave the expedition permanently; the remaining party may recover eligible cargo, but the quitter cannot bank it by retiring in a fight.

On a valid fallen transition, eligible item/resource state moves out of the hero into a recovery bundle at a defined native location. The bundle preserves the owner of each share. A survivor can retrieve it, carry it and extract it. If compatible and authorized, the survivor can take over a guild weapon for the remaining mission; that changes the loan/custody record, not its owner.

Do not assume the bundle appears wherever the existing downed ghost happens to move. Select and persist a recoverable position from authoritative native state when final loss commits. Recovery access, inventory space and equipment restrictions still apply. A material pouch can carry tagged shares without requiring manual redistribution.

A player receiving their recovered property remains dead in that expedition. The benefit is that their next hero can use what a teammate saved. The survivor does not need to wait for the dead player to be online to finish the return.

## Full wipe and cross-run salvage

Recommended loss hypothesis: built facilities, learned guild capabilities and secured stock survive; remaining eligible field gear/materials may be recovered through a bounded salvage attempt. Whether ordinary materials survive fully, partially or not at all needs economy comparison. These are alternatives to full destruction or paid insurance, not an already selected harshness level.

While an expedition continues, recover its property there. Do not create a parallel salvage mission with a second copy. When that expedition truly closes, a recovery seal can move eligible unresolved field property into durable escrow before native terminal cleanup removes the source save. It contains the actual remaining state, not a regenerated version of the original loadout.

A new rescue expedition can claim that escrow into one recovery site. Another team cannot claim the same contents concurrently. A failed salvage follows its declared loss/retry rule; reopening a site does not refill spent consumables or create another staff. Banked materials and returned equipment from an earlier partial extraction remain safe regardless of what happens to the remaining party.

Recovery should create an attractive choice: risk reserves to reclaim a valuable shield and the missing construction material, use other equipment instead, or pay for a limited recovery service. Avoid compulsory recovery of every mundane drop after every run. A guild's Infirmary and Waystations can improve recovery reach or provide a finite emergency tool; they do not turn all exposed items into automatic home inventory.

## Guild departures, kicks and mixed parties

| Change | Personal property | Guild property / benefits |
| --- | --- | --- |
| Member leaves voluntarily | Secured personal holdings move to a protected departure account; field personal property keeps its owner | Buildings and donated stock stay; existing loans still return to their issuing guild |
| Member is kicked | Same personal protection; no confiscation or instant loss of hero control | Future loans/services stop; no officer can strip equipped gear during combat |
| Membership changes mid-run | Active hero keeps its configured starting skills/spells and current lawful cargo | No new benefits from another guild stack onto that live run; returns to the old guild remain valid |
| Mixed-guild party extracts tagged cargo | Each personal share reaches its recorded owner | Each guild loan reaches its issuing guild; party host never becomes omnibus owner |

One active progression guild is pinned for each player's launched expedition. A party may contain members of different guilds; shared play does not merge those guilds' treasuries. New lending, construction and services require the appropriate guild authorization. Facility contributions remain voluntary even when rescuing someone else's property.

Personal property can be transferred into a new/founded guild's persistence service. A player without a current guild retains protected custody of what they own but cannot operate an independent building tree or launch inherited equipment without the required guild service. Departure accounts accept late returns, including after a kick. Outstanding loan records also need a durable destination if the issuing guild later dissolves; dissolution must settle outstanding claims before deleting its ledger.

## Worked three-player expedition

Illustrative quantities, not balanced yields. Arin, Beren and Cora belong to one guild. Arin carries a guild shield and 6 personally collected timber. Beren carries a guild staff and 4 personally collected metal. Cora wears personal armour and carries 3 personally collected stone.

1. **Arin extracts early.** The shield returns to the guild Armory; the timber becomes Arin's secured supplies. Beren and Cora keep playing. The guild can issue that shield to a different expedition after settlement commits.
2. **Beren goes down.** Native revival is still possible. The staff and metal have not appeared at home or in another recovery run.
3. **Beren accepts final loss.** One real field bundle receives the remaining staff and Beren-owned metal. Beren can launch a fresh hero without retaining a usable copy.
4. **Cora retrieves the bundle.** If authorized, she uses the guild staff; she carries Beren's tagged metal without gaining ownership. She still owns her armour and stone.
5. **Cora extracts.** Staff to guild; metal to Beren; armour and stone to Cora. Arin's earlier settlement is unchanged. No member's material is automatically donated.
6. **They choose a project.** Arin pledges timber, Beren pledges recovered metal and Cora pledges stone. When the remaining authorized cost is funded, construction consumes it once. Every guild member, including a later newcomer, benefits from the completed building.

Alternative: Cora falls before extraction. Arin's secured timber and shield remain safe. The staff, Beren's metal and Cora's eligible property remain exposed and then follow the single recovery-escrow policy. The guild's already built facilities survive. This gives Arin's earlier departure a real benefit without granting a free return to the rest of the party.

## What must be proved

The current native end path finalizes a game and propagates an outcome across party snapshots. Separate hero retirement/extraction is therefore a new lifecycle primitive, not a bank-screen feature. It must detach the exact hero from scheduling, XP, alive/last-stand checks, input and passive support while preserving stable identities and the remaining save. Host departure and party-slot-zero departure must be tested explicitly.

The [contracts and assessments](contracts.md#discriminating-assessments) cover complete item state, material conservation, interrupted settlement, membership changes and the three-player sequence above. No gameplay implementation or live co-op proof is claimed by this design pass.
