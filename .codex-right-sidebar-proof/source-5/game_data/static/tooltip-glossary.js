define([], function () {
    "use strict";

    // Glossary used by nested tooltips. Condition text mirrors
    // dat/descript/status.txt; mechanic text summarises the engine rules.
    // Bodies deliberately mention other glossary terms: those mentions become
    // hoverable links, which is what lets tooltips nest.
    //
    // Fields: title, badge, aliases (case-insensitive phrases), cs
    // (case-sensitive phrases), property (item-properties key it explains).
    var E = [
        // --- Conditions -----------------------------------------------------
        { id: "hasted", title: "Hasted", badge: "Condition",
          aliases: ["hasted", "haste"],
          body: "All of your actions are 50% faster. Berserk also hastes you." },
        { id: "slowed", title: "Slowed", badge: "Affliction",
          aliases: ["slowed", "slowness", "slows down"],
          body: "All your actions take 50% longer. Being slowed while hasted cancels both out." },
        { id: "poisoned", title: "Poisoned", badge: "Affliction",
          aliases: ["poisoned", "poisoning"],
          body: "You are poisoned and will continually lose health. While poisoned, your current health will be partially recoloured to display the eventual poison damage that will be dealt. Poison can be cured immediately by potions of curing. rPois protects against most poisoning." },
        { id: "confused", title: "Confused", badge: "Affliction",
          aliases: ["confused", "confusion"],
          body: "You are confused. You may stumble in a random direction when attempting to move or attack, and are unable to cast spells or use most items other than potions. Confusion can be cured immediately by potions of curing. Willpower does not protect against it, but clarity does." },
        { id: "contamination", title: "Magical Contamination", badge: "Affliction",
          aliases: ["contamination", "contaminated", "mutagenic radiation"],
          body: "You are glowing with mutagenic radiation. This can inflict mutations over time (usually negative) or even cause you to suffer damage as the unstable magic explodes violently. In addition, your glow prevents invisibility and reduces your stealth." },
        { id: "drained", title: "Drained", badge: "Affliction",
          aliases: ["drained", "negative energy drains"],
          body: "Your maximum health has been temporarily drained by negative energy. This status will not wear off by waiting, but will gradually expire as you gain experience. rN reduces how often you are drained." },
        { id: "exhausted", title: "Exhausted", badge: "Affliction",
          aliases: ["exhausted", "exhaustion"],
          body: "You are exhausted, and are unable to activate divine powers that cause exhaustion until the status expires. Berserk rage usually leaves you slowed and unable to rage again for a while." },
        { id: "paralysed", title: "Paralysed", badge: "Affliction",
          aliases: ["paralysed", "paralysis", "paralyzed"],
          body: "You are paralysed, and completely unable to act. Willpower helps resist the magic that causes it." },
        { id: "asleep", title: "Asleep", badge: "Affliction",
          aliases: ["asleep", "fall asleep", "falls asleep"],
          body: "Completely unable to act. Taking damage wakes the sleeper. Stealth lets you approach sleeping monsters without waking them." },
        { id: "constricted", title: "Constricted", badge: "Affliction",
          aliases: ["constricted", "constriction", "constricts"],
          body: "You are being constricted by an enemy. Your evasion is impaired, and you will take damage over time. You are unable to move away from the enemy, although you can struggle to escape by attempting to do so, and will become increasingly more likely to succeed and break the constriction when doing so multiple times." },
        { id: "mesmerised", title: "Mesmerised", badge: "Affliction",
          aliases: ["mesmerised", "mesmerized", "mesmerising"],
          body: "You are mesmerised and cannot move away from the monster mesmerising you. The effect can be broken by killing or confusing the responsible monster or by breaking line of sight with them. Willpower helps resist it." },
        { id: "afraid", title: "Afraid", badge: "Affliction",
          aliases: ["afraid", "frightened", "terrified"],
          body: "You are overcome with fear and cannot move towards the monster causing fear in you. The effect can be broken by killing or confusing the responsible monster or by breaking line of sight with them. Willpower helps resist it." },
        { id: "corroded", title: "Corroded", badge: "Affliction",
          aliases: ["corroded", "corrodes", "corrosion"],
          body: "You are corroded, reducing your damage in physical combat and your armour class by an amount depending on the severity of the corrosion. rCorr protects against it." },
        { id: "weakened", title: "Weakened", badge: "Affliction",
          aliases: ["weakened", "weakness"],
          body: "Your melee attacks do 25% less damage." },
        { id: "frozen", title: "Frozen", badge: "Affliction",
          aliases: ["frozen", "encased in ice", "covered in ice"],
          body: "You are covered in ice, and your movement speed is reduced. rC reduces cold damage." },
        { id: "silenced", title: "Silenced", badge: "Affliction",
          aliases: ["silenced", "silence"],
          body: "You are silenced. This makes reading scrolls, casting spells, invoking divine abilities, or shouting impossible." },
        { id: "petrifying", title: "Petrifying", badge: "Affliction",
          aliases: ["petrifying", "petrified", "petrification", "turning to stone"],
          body: "You are turning to stone. Your actions are slowed, all damage taken is slightly reduced, and you will soon be completely petrified and unable to act." },
        { id: "berserk", title: "Berserk", badge: "Condition",
          aliases: ["berserk", "berserker rage", "berserk rage"],
          body: "You are hasted, deal increased damage in combat, and have increased health, but are unable to perform most actions other than moving and attacking in melee. The status will wear off very quickly unless you are attacking monsters, and when it expires you will be slowed and unable to berserk again for a short duration." },
        { id: "might", title: "Might", badge: "Condition",
          aliases: ["mighty"], cs: ["Might"],
          body: "You are unnaturally mighty, doing significantly more damage in physical combat." },
        { id: "agility", title: "Agility", badge: "Condition",
          aliases: ["agile", "agility"],
          body: "You are unnaturally agile, and gain a bonus to your evasion." },
        { id: "brilliance", title: "Brilliance", badge: "Condition",
          aliases: ["brilliance"],
          body: "You are unnaturally smart, and gain a bonus to your spell power as well as halving the magic cost of your spells (rounding up)." },
        { id: "invisible", title: "Invisible", badge: "Condition",
          aliases: ["invisible", "invisibility"],
          body: "Most enemies will be unable to see you and will suffer penalties to hit, though they may be able to guess at your general location. Contamination or standing in shallow water makes invisibility ineffective. See invisible reveals invisible creatures." },
        { id: "see-invisible", title: "See Invisible", badge: "Ability", property: "see-invisible",
          aliases: ["see invisible"], cs: ["SInv"],
          body: "Allows you to see invisible creatures as if they were visible." },
        { id: "flying", title: "Flying", badge: "Condition", property: "flight",
          aliases: ["flying", "flight", "levitating"],
          body: "You are flying above the ground, and are able to cross water and lava or fight above shallow water without penalties. Most types of flight will time out – be careful what you are above when that happens!" },
        { id: "regeneration", title: "Regeneration", badge: "Mechanic", property: "regeneration",
          aliases: ["regeneration", "regenerating"],
          body: "Natural recovery of health over time. Temporary regeneration speeds it up greatly. Being sickened stops it, and it pauses while you are in combat with nearby monsters." },
        { id: "sticky-flame", title: "Sticky Flame", badge: "Affliction",
          aliases: ["sticky flame", "sticky fire", "liquid flames"],
          body: "You are covered with sticky fire, which causes damage over a moderate duration. Moving will quell the fire much more rapidly, and entering water will extinguish it immediately. rF reduces the damage." },
        { id: "vertigo", title: "Vertigo", badge: "Affliction",
          aliases: ["vertigo", "dizzy"],
          body: "You are disoriented and dizzy, reducing your accuracy, evasion, and spell failure chance." },
        { id: "sickened", title: "Sickened", badge: "Affliction",
          aliases: ["sickened", "sickness"],
          body: "You have been sickened, and your health will no longer regenerate." },
        { id: "vitalised", title: "Vitalised", badge: "Condition",
          aliases: ["vitalised", "vitalized", "vitalisation"],
          body: "You are divinely vitalised, providing protection from poison, confusion, petrification, and sickness, and increasing and sustaining your strength, intelligence and dexterity." },
        { id: "doom", title: "Doom", badge: "Affliction",
          aliases: ["doom", "doomed"],
          body: "A malevolent fate is gathering around you. If your Doom reaches 100%, you will be afflicted by a random bane and your Doom will reset to 0. Both Doom and banes are only cured by gaining experience, though banes typically last much longer." },
        { id: "blind", title: "Blind", badge: "Affliction",
          aliases: ["blinded", "blindness"],
          body: "Your vision is badly impaired. All spells and attacks you perform (which do not automatically hit) have an increased chance to miss. This chance is much greater the further away you are from your target." },
        { id: "barbed", title: "Barbed", badge: "Affliction",
          aliases: ["barbs", "barbed"],
          body: "There are barbs embedded in your skin, and moving around will cause you to take damage. Remaining in place for a short time will allow you to remove the barbs without taking damage." },
        { id: "flayed", title: "Flayed", badge: "Affliction",
          aliases: ["flayed", "flaying"],
          body: "You are covered in illusionary wounds, causing severe damage while the effect remains active. Destroying the source of the illusion will restore all health lost to the flaying." },
        { id: "sapped", title: "Sapped Magic", badge: "Affliction",
          aliases: ["sapped", "magic is sapped"],
          body: "Your magic is sapped. Casting a spell will cause you to lose access to your magic, briefly preventing you from casting any further spells." },
        { id: "deaths-door", title: "Death's Door", badge: "Condition",
          aliases: ["death's door"],
          body: "You are temporarily invulnerable to harm, but are brought close to death in the process and cannot be affected by healing while the effect is active. After the spell expires, it cannot be immediately recast." },
        { id: "heroism", title: "Heroism", badge: "Condition",
          aliases: ["heroism"],
          body: "Your combat skills are temporarily increased." },
        { id: "finesse", title: "Finesse", badge: "Condition",
          aliases: ["finesse"],
          body: "Your combat speed is greatly increased." },
        { id: "horrified", title: "Horrified", badge: "Affliction",
          aliases: ["horrified"],
          body: "You are terrified of nearby monsters, reducing your damage and accuracy in combat as well as your spell power." },
        { id: "vexed", title: "Vexed", badge: "Affliction",
          aliases: ["vexed"],
          body: "Your mind is clouded by frustration. For the next several turns, you will uncontrollably attack random adjacent creatures (whether friendly or enemy) or even empty space." },
        { id: "drowsy", title: "Drowsy", badge: "Affliction",
          aliases: ["drowsy"],
          body: "You are rapidly growing sleepy and may soon fall asleep completely." },
        { id: "ostracised", title: "Ostracised", badge: "Affliction",
          aliases: ["ostracised", "ostracized"],
          body: "Your connection to the divine has been partially cut off, temporarily reducing your effective piety. Gaining experience will eventually recover all piety that has been locked away this way." },
        { id: "fragile", title: "Fragile", badge: "Affliction", property: "fragile",
          aliases: ["brittle as glass"],
          body: "Your body is as fragile and brittle as glass, increasing the damage you take from all sources." },
        { id: "clarity", title: "Clarity", badge: "Ability", property: "clarity",
          aliases: ["clarity"],
          body: "Protects from confusion, berserk rage, mesmerisation and fear." },

        // --- Mechanics ------------------------------------------------------
        { id: "willpower", title: "Willpower", badge: "Mechanic", property: "will",
          aliases: ["willpower"],
          body: "Resistance to hostile enchantments such as paralysis, mesmerisation and fear. Higher willpower makes such magic more likely to fail. Each + of Will is worth 40 willpower; ∞ means immune." },
        { id: "evasion", title: "Evasion (EV)", badge: "Mechanic", property: "evasion",
          aliases: ["evasion"], cs: ["EV"],
          body: "Your chance to dodge attacks and many projectiles. Raised by dexterity and the Dodging skill; reduced by heavy armour and shields." },
        { id: "armour-class", title: "Armour Class (AC)", badge: "Mechanic", property: "armour",
          aliases: ["armour class", "armor class"], cs: ["AC"],
          body: "Reduces the damage of physical attacks. Raised by armour, the Armour skill, and some spells and mutations. Corrosion lowers it." },
        { id: "shielding", title: "Shielding (SH)", badge: "Mechanic", property: "shielding",
          aliases: ["shielding"], cs: ["SH"],
          body: "Your chance to block attacks with a shield. Raised by the Shields skill and dexterity. Reflection can return blocked projectiles." },
        { id: "stealth", title: "Stealth", badge: "Mechanic", property: "stealth",
          aliases: ["stealth", "stealthy"],
          body: "How quietly you move. Higher stealth makes asleep or distracted monsters less likely to notice you. Heavy armour and contamination reduce it." },
        { id: "experience", title: "Experience", badge: "Mechanic",
          aliases: ["experience level", "experience"], cs: ["XL"],
          body: "Earned by killing monsters and exploring. Gaining experience raises your level (1–27), trains skills, and slowly recovers doom, banes, drained health and ostracised piety." },
        { id: "piety", title: "Piety", badge: "Mechanic",
          aliases: ["piety"],
          body: "Your standing with your god. Rising piety unlocks divine abilities and passives; misconduct and some abilities lower it. Abandoning your god brings penance." },
        { id: "penance", title: "Penance", badge: "Mechanic",
          aliases: ["penance", "divine wrath"],
          body: "A god's anger at a former or disobedient follower. While under penance you may be punished, and divine powers from that god are withheld." },
        { id: "mutation", title: "Mutation", badge: "Mechanic",
          aliases: ["mutation", "mutations", "mutated", "mutate"],
          body: "A change to your body, which may be beneficial or harmful. Contamination often inflicts harmful mutations. rMut protects against most of them." },
        { id: "bane", title: "Bane", badge: "Mechanic", property: "bane",
          aliases: ["bane", "banes"],
          body: "A lasting curse with diverse negative effects. Banes are inflicted when doom reaches 100% or by some items, and are only cured by gaining experience." },
        { id: "spell-power", title: "Spell Power", badge: "Mechanic",
          aliases: ["spell power", "spellpower", "power of your spells"],
          body: "How strong your spells are. Raised by spellcasting skills, intelligence, Brilliance and magical enhancers; reduced when horrified or dimmed." },
        { id: "spell-failure", title: "Spell Failure", badge: "Mechanic",
          aliases: ["spell failure", "spellcasting success", "failure rate", "fail rate"],
          body: "The chance that casting a spell fails and wastes the turn. Lowered by skills, intelligence and Wizardry; raised by heavy armour, shields and vertigo." },
        { id: "potion-curing", title: "Potion of Curing", badge: "Item",
          aliases: ["potions of curing", "potion of curing"],
          body: "Restores a little health and cures poison, confusion and sickness." },

        // --- Resistances ----------------------------------------------------
        { id: "rF", title: "Fire Resistance (rF)", badge: "Resistance", property: "fire",
          aliases: ["fire resistance", "resistance to fire"], cs: ["rF"],
          body: "Reduces damage from fire, including sticky flame. Each level (up to rF+++) protects further; rF- makes fire more dangerous." },
        { id: "rC", title: "Cold Resistance (rC)", badge: "Resistance", property: "cold",
          aliases: ["cold resistance", "resistance to cold"], cs: ["rC"],
          body: "Reduces damage from cold. Each level (up to rC+++) protects further; rC- makes cold more dangerous." },
        { id: "rN", title: "Negative Energy Resistance (rN)", badge: "Resistance", property: "life",
          aliases: ["negative energy resistance", "negative energy"], cs: ["rN"],
          body: "Protects against negative energy: necromantic damage and being drained. Up to rN+++." },
        { id: "rPois", title: "Poison Resistance (rPois)", badge: "Resistance", property: "poison",
          aliases: ["poison resistance", "resistance to poison"], cs: ["rPois"],
          body: "Prevents most attempts to make you poisoned and reduces poison damage." },
        { id: "rElec", title: "Electricity Resistance (rElec)", badge: "Resistance", property: "electricity",
          aliases: ["electricity resistance", "resistance to electricity"], cs: ["rElec"],
          body: "Reduces damage from electricity and lightning." },
        { id: "rCorr", title: "Corrosion Resistance (rCorr)", badge: "Resistance", property: "corrosion",
          aliases: ["corrosion resistance"], cs: ["rCorr"],
          body: "Protects you from becoming corroded and reduces damage from acid." },
        { id: "rMut", title: "Mutation Resistance (rMut)", badge: "Resistance", property: "mutation",
          aliases: ["mutation resistance"], cs: ["rMut"],
          body: "Protects against most mutations, including those caused by contamination." }
    ];

    var byId = Object.create(null), byProperty = Object.create(null);
    var lookup = Object.create(null), csLookup = Object.create(null), phrases = [];
    E.forEach(function (entry) {
        byId[entry.id] = entry;
        if (entry.property) byProperty[entry.property] = entry;
        (entry.aliases || []).forEach(function (a) {
            lookup[a.toLowerCase()] = entry;
            phrases.push(a);
        });
        (entry.cs || []).forEach(function (a) {
            csLookup[a] = entry;
            phrases.push(a);
        });
    });
    phrases.sort(function (a, b) { return b.length - a.length; });
    var basePhrases = phrases.slice(), contextIds = [], pattern;
    function rebuild() {
        var escaped = phrases.map(function (p) {
            return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]");
        });
        // Keep abbreviations, hyphens and apostrophes inside word boundaries.
        pattern = new RegExp("(^|[^A-Za-z0-9_'’-])(" + escaped.join("|") + ")(?![A-Za-z0-9_'’])", "gi");
    }
    rebuild();
    function set_context(entries) {
        contextIds.forEach(function (id) {
            var entry = byId[id];
            if (entry) entry.aliases.forEach(function (alias) {
                if (lookup[alias.toLowerCase()] === entry) delete lookup[alias.toLowerCase()];
            });
            delete byId[id];
        });
        contextIds = []; phrases = basePhrases.slice();
        entries.forEach(function (entry) {
            byId[entry.id] = entry; contextIds.push(entry.id);
            entry.aliases.forEach(function (alias) {
                if (!alias || lookup[alias.toLowerCase()] || csLookup[alias]) return;
                lookup[alias.toLowerCase()] = entry; phrases.push(alias);
            });
        });
        phrases.sort(function (a, b) { return b.length - a.length; }); rebuild();
    }

    function resolve(text) {
        if (csLookup[text]) return csLookup[text];
        var entry = lookup[text.toLowerCase().replace(/’/g, "'")];
        if (!entry) return null;
        // A case-insensitive alias that collides with a case-sensitive one
        // ("might" vs "Might") is rejected by not being in lookup at all.
        return entry;
    }

    var SKIP = "a, button, input, textarea, select, kbd, code, script, style, svg, " +
        ".dcss-term, .item-property, .dcss-tip-header, .dcss-tip-meta, .selectable, .actions, " +
        "[data-no-terms]";

    // Wrap glossary phrases found in text under root with hoverable spans.
    // options.exclude: ids not to link (e.g. the card's own term).
    function linkify(root, options) {
        if (!root || !root.ownerDocument) return 0;
        var exclude = (options && options.exclude) || {};
        var doc = root.ownerDocument, nodes = [], count = 0;
        var walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
            acceptNode: function (node) {
                var parent = node.parentNode;
                if (!node.nodeValue || node.nodeValue.length < 2) return 3;
                if (parent && parent.closest && parent.closest(SKIP)) return 2;
                return 1;
            }
        });
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            var text = node.nodeValue, last = 0, frag = null, match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(text))) {
                var start = match.index + match[1].length, word = match[2];
                var entry = resolve(word);
                if (!entry || exclude[entry.id]) {
                    pattern.lastIndex = start + 1;
                    continue;
                }
                frag = frag || doc.createDocumentFragment();
                if (start > last) frag.appendChild(doc.createTextNode(text.slice(last, start)));
                var span = doc.createElement("span");
                span.className = "dcss-term";
                span.setAttribute("data-term", entry.id);
                span.setAttribute("role", "button");
                span.setAttribute("tabindex", "0");
                span.setAttribute("aria-label", "Read about " + entry.title);
                span.textContent = word;
                frag.appendChild(span);
                last = start + word.length;
                pattern.lastIndex = last;
                count++;
            }
            if (!frag) return;
            if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
        });
        return count;
    }

    return {
        entries: E,
        set_context: set_context,
        get: function (id) { return byId[id] || null; },
        for_property: function (key) { return byProperty[key] || null; },
        resolve: resolve,
        linkify: linkify
    };
});
