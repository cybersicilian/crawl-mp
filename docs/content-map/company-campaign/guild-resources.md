# Guild materials, personal property and buildings

[Current campaign](README.md) · [Inheritance, extraction and recovery](inheritance-extraction-recovery.md) · [Native contracts](contracts.md)

Detailed design: [building costs and upgrade trees](buildings.md) · [47 recipes](equipment-recipes.md) · [yields and worked budgets](guild-economy.md).

User-selected direction: resources are scattered through expeditions, players collect **their own** materials, and they may contribute them to a guild to construct buildings benefiting all members. Persistent company assets require a guild. Everything specified here is proposed gameplay, not implemented behavior.

## The guild is the persistent institution

“Company” in earlier documents now refers to this guild. A party is a temporary expedition roster; a guild is the lasting owner of buildings, shared stock and guild-owned equipment. They need not have the same membership.

Recommended solo support: a player can found a one-member guild. The native game remains playable without using guild progression. Membership in a guild enables persistent facilities and equipment inheritance; it does not grant the guild ownership of everything a member finds.

The founding guild has a basic ledger and secure settlement service so it can receive its first materials. The Armory, Forge and other functional buildings are constructed with resources. Until a needed building exists, secured personal property can remain packed, rather than being deleted or silently used as construction input.

On departure, a player's personal property is retained in a sealed departure account. It can move to a new/founded guild under the settlement rules. It does not create a separate private facility tree or continue supplying the old guild's building benefits. Guild property stays with the old guild.

## Four balances that must never be merged

| Balance | Owner | Exposed to expedition loss? | Who can spend it? |
| --- | --- | --- | --- |
| Personal field materials | Account that acquired them; hero/carrier is custody | Yes, until secured | Their owner under a valid native use, gift or later contribution rule |
| Secured personal supplies | That player | No new field exposure until reissued | That player; guild officers cannot confiscate them |
| Guild stock | Guild, following a voluntary transfer | Safe at the guild; a deployed shipment is exposed | Authorized guild projects/services, under visible permissions |
| Project pledge | Still the player while only reserved | Not field-exposed | Reserved for that project; cancellation releases it until construction consumes it |

Personal equipment, guild-owned equipment and temporary expedition loans use the same owner-versus-holder distinction. A guild member extracting a teammate's bag does not become its owner.

## A small resource palette with actual uses

Candidate names and sources below are authored design proposals, not existing native resource types.

| Material | Sources worth authoring | Buildings and uses |
| --- | --- | --- |
| Timber | Dungeon stores, abandoned works, Lair-side caches, fortified sites | Hall expansion, Armory structure, supply stations and return infrastructure |
| Metal | Ore stores, smithies, Orc works, fortress caches | Forge, equipment production, Armory improvements and defensive apparatus |
| Stone | Masonry stocks, quarry/ruin caches, deeper construction sites | Vaults, training facilities, infirmary structure and durable outposts |
| Hide / fibre | Prepared bundles in camps, Lair sites and workshops | Protective equipment, expedition packs, infirmary and field supplies |
| Reagents | Herbal/chemical stores, portal sites, magical laboratories | Apothecary, recovery supplies and specialized preparation |
| Arcane crystal | Magical research sites, Elf/Vaults caches and deeper sources | Library, relic work, relay/return apparatus and realm preparation |

Add a few specific late project components only when their physical identity matters: an infernal regulator, planar core or ritual seal, for example. These should enable a concrete apparatus or compete with a useful craft. They are not another universal renown wallet.

Common materials should remain useful in late construction and restocking. Deeper sites can carry better yields or valuable components; an advanced guild should not be required to repeat D:1-7 to collect basic timber before every serious expedition.

Material generation should use finite, themed placements within normal layouts, mini-vaults, branch sites and portals. Avoid turning every wall, tree and corpse into a mandatory harvesting click. Ordinary safe pickup can use native-style autopickup with an immediately reversible material filter. A dedicated material pouch prevents six resource types from consuming the whole equipment inventory; its quantities and owner labels remain visible.

Threat, approach and deciding whether to keep carrying valuables supply the collection gameplay. Re-entering a site, reloading or taking turns on another floor never replenishes a harvested node.

## Who owns a pickup?

Baseline proposal: a material pickup belongs to its collector's account. Solo companions collect on behalf of their controlling account. Being expedition host or guild leader creates no ownership claim over another member's resources.

An expedition may choose an equal-share rule for finite group caches before launch. That rule divides one actual total into personal allocations; it does not mint a complete cache for every hero. Keep the setting visible and remembered. No rolls, pop-up votes or manual distribution screen is needed for ordinary pickups.

Compare collector-owned scattered finds with automatically divided shared caches in co-op. If racing to click first dominates, favor shared-cache allocation while preserving each resulting share as personal property. Late arrival, odd remainders and solo companions need one declared allocation rule; neither host priority nor cache re-entry should create an extra share.

For either rule, a teammate can transport an identified sealed share for its owner. The distinction is **acquisition owner versus carrier**. Material transfers that are gifts explicitly change title; transport does not. Spending another owner's materials requires that owner's authorization.

These materials need their own typed ownership/source data. Existing native party gold is shared and cannot simply be relabeled as individual material ownership. For the initial building loop, pay construction with these personally sourced materials and voluntary guild stock. Gold operations need an explicit compatible allocation/spending policy; no one may donate another player's implicit share by acting as host.

## Construction uses your chosen contributions

There are two useful paths:

1. **Donate to guild stock:** choose type/quantity and confirm that ownership becomes the guild's. The guild can use the material for authorized projects. It is no longer a personal refundable balance.
2. **Contribute to a named building:** reserve an exact personal amount for that project. Before the project commits, the pledge can be withdrawn. Once all inputs are present and construction commits, they are consumed and the building belongs to the guild.

One contextual **Contribute & build** action can perform a clear contribution plus immediate construction when sufficient authorized resources exist. There is no requirement to visit separate deposit, treasury and construction screens. A funded, authorized project completes without an offline timer.

The interface shows personal holdings, the guild's available stock, the remaining project requirements and exactly whose input will be consumed. It never assumes that a member's entire personal wallet is available for guild spending. Personal balances are private unless the player shares or pledges them; project contributions are visible.

Illustrative accounting, not tuned building costs: an Armory project needs 8 timber, 6 metal and 4 stone. One player contributes the metal, another the timber, another the stone. Construction consumes those quantities once. Every guild member can use the Armory afterward, including a new member who contributed nothing. There is no personal donation threshold, proportional benefit or contribution rank.

The same metal may also be useful for a personally owned crafted weapon. Choosing individual preparation versus a shared building is the real resource decision.

## Buildings and tangible shared benefits

The [building trees](buildings.md) now specify exact first-pass costs and effects, backed by a [numeric design catalogue](guild-catalogue.json). These authored numbers require economy/play tests. The functional roles are:

| Building | Initial benefit | Useful upgrade direction | Resource identity |
| --- | --- | --- | --- |
| Armory | Enables inherited personal loadouts and guild equipment loans across fresh heroes | Broader rearm/consignment capability and better equipment support services | Timber, metal, stone; actual equipment remains separately owned |
| Forge | Craft or improve compatible equipment using explicit recipes | Brands/egos, specialized devices and authored cooperative relic production | Metal/stone plus compatible real inputs and later apparatus |
| Library | Archive authorized field research and expose it to eligible fresh members' spell libraries | Broader preparations and ritual/device research | Timber, crystal and research acquisitions |
| Training Hall | Funded starting skill preparations available to all members | Stronger or broader starting curricula and tested cooperative techniques | Timber, stone and relevant manuals/research |
| Apothecary | Manufacture finite healing/support supplies | Resistance, empathy and expensive soul ambrosia | Hide/fibre, reagents and crystal; rare ritual input for strong revival |
| Recovery Lodge / Infirmary | Dispatch valid salvage and prepare finite native recall tools | Material-preserving caskets, XP beacon support and equipment-specific insurance tethers | Hide/fibre, reagents, crystal and ritual inputs |
| Waystation network | Secure personal/guild property at an accessible field contact | Planned consignments, separate extraction support and eventually explicit advanced starts | Timber, stone, stock and later crystal/apparatus |
| Realm workshop / relay | Construct a particular protection or return device | More useful capacity or additional defined effects | Core materials plus a meaningful realm component |

Facilities benefit every eligible member through the same rules. A recipe unlock is guild-wide; producing an item still spends its declared inputs. A facility's service can be available to all without duplicating one finite device, stockpile or loan item.

If a member crafts using personal inputs, the result is personal property by default. A craft funded entirely from guild stock yields a guild item by default. Mixed-input crafts declare the output owner before confirmation. Construction consumes contributed material into guild-owned infrastructure; donating does not buy a fractional ownership share.

Guild departure does not refund timber from an already built Forge. It does not confiscate unspent personal materials either.

## Benefits during membership changes

Recommended policy: one active progression guild per fresh expedition, pinned at launch. This prevents stacking several guilds' initial training, inventories and services while still allowing a later switch.

- A new member can use current guild buildings without replaying the guild's construction history.
- Leaving stops new facility/loan use from that guild. A new expedition uses the new guild's actual facilities.
- An already launched hero keeps its supplied initial skills and learned spells for that run. Membership changes do not strip skills, HP, equipment or control in the middle of combat.
- Existing guild loans remain owned by the issuing guild and settle there. Remaining personal property belongs to the departing player.
- A kicked member receives the same property protection. Guild ownership controls future permissions, not another person's private wallet or current hero.

Active-run settlement can still accept returns of old guild loans and route personal property into the departure account. It cannot grant new benefits from another guild to that already configured run.

## Why the materials create continuing co-op content

Early resource finds finance the first shared Armory and preparations. Lair/Orc holdings support production and a stocked field contact. Later magical materials and devices support formations, rescue and specialized loadouts. Realm components fund tools for the Hells, Pan and Tomb. All members can benefit, so returning with material for a needed guild improvement can matter even when that player did not find a personal gear upgrade.

Players keep the choice to contribute. Guild projects make shared needs legible; they do not impose automatic donations or a hidden tax. One member may craft a personal shield, another may fund the Waystation, and both can then make use of the shared extraction capability.

## Inspiration and evidence

Cephalofair's [resource/building design discussion](https://cephalofair.com/blogs/chronicle/what-to-do-with-those-resources) describes material costs for equipment, upgrades that expand crafting capability, and scarce resources competing between powerful items and building improvements. That is the useful inspiration here. The personal/guild title, departure, collection and extraction rules above are our proposed adaptation, not claims about Frosthaven's exact current rules.

The [native contract boundary](contracts.md) still applies: new material types, per-player resource custody, construction transactions and guild benefit policy are unproven primitives. This pass authored their design; it did not generate or collect a material in the native game.
