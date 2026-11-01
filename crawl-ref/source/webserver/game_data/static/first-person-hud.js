/* A passive view of native hero facts. No input, targeting or gameplay state. */
define(["./enemy-banner-model"], function (enemies) {
    "use strict";
    var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    function node(tag, className, text) {
        var element = document.createElement(tag); element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function resource(kind) {
        var root = node("div", "first-person-vital " + kind);
        var label = node("span", "first-person-vital-label"), value = node("span", "first-person-vital-value");
        var track = node("div", "first-person-vital-track"), fill = node("span", "first-person-vital-fill");
        track.append(fill); root.append(label, value, track); root.setAttribute("role", "meter");
        return { root: root, label: label, value: value, fill: fill };
    }
    function setResource(meter, label, current, maximum) {
        var known = Number.isFinite(current) && Number.isFinite(maximum) && maximum >= 0;
        var value = known ? Math.max(0, Math.min(current, maximum)) : 0;
        meter.label.textContent = label; meter.value.textContent = known ? value + " / " + maximum : "—";
        meter.fill.style.width = (known && maximum > 0 ? value / maximum * 100 : 0) + "%";
        meter.root.setAttribute("aria-label", label + ": " + meter.value.textContent);
        meter.root.setAttribute("aria-valuemin", "0");
        meter.root.setAttribute("aria-valuemax", String(known ? Math.max(1, maximum) : 1));
        meter.root.setAttribute("aria-valuenow", String(value));
        meter.root.dataset.low = String(known && maximum > 0 && value / maximum <= .25);
    }
    function create(host) {
        var root = node("div", "first-person-hud"); root.hidden = true;
        var navigation = node("div", "first-person-navigation");
        var place = node("div", "first-person-location"), compass = node("div", "first-person-bearing");
        compass.setAttribute("aria-hidden", "true");
        var tape = node("div", "first-person-compass-tape");
        // Repeated bearings let the tape wrap continuously at north.
        for (var n = -8; n <= 16; n++) tape.append(node("span", "", directions[(n + 8) % 8]));
        compass.append(tape);
        var target=node("div","first-person-target"),targetName=node("strong",""),targetHealth=node("div","first-person-target-health"),targetFill=node("i","");
        targetHealth.append(targetFill);target.append(targetName,targetHealth);target.hidden=true;navigation.append(place,compass,target);
        var reticle = node("span", "first-person-crosshair", "·"); reticle.setAttribute("aria-hidden", "true");
        var vitals = node("div", "first-person-vitals"), magic = resource("magic"), health = resource("health");
        vitals.setAttribute("data-hud-obstacle", "");
        var progress = node("div", "first-person-level");
        vitals.append(magic.root, health.root, progress); root.append(navigation, reticle, vitals); host.append(root);
        var summary = document.getElementById("party_progress");
        function layout() {
            var top = 44;
            if (summary && summary.getClientRects().length)
                top = Math.max(top, summary.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 8);
            navigation.style.top = top + "px";
            host.style.setProperty("--first-person-tools-top", top + 52 + "px");
        }
        var observer = new ResizeObserver(layout); observer.observe(host);
        if (summary) observer.observe(summary);
        layout();
        return {
            update: function (hero, angle, active, inspected) {
                root.hidden = !active;
                if (!active) return;
                target.hidden=!(inspected&&inspected.location&&(inspected.active||inspected.hovering)&&inspected.label!=="visible tile");
                if(!target.hidden){
                    targetName.textContent=inspected.label;
                    var state=window.crawl_party&&window.crawl_party.state;
                    var enemy=state&&(state.enemy_initiative||[]).find(function(entry){return entry.x===inspected.location.x&&entry.y===inspected.location.y&&entry.perception!=="last_known";});
                    var reading=enemy&&enemies.project(enemy);targetHealth.hidden=!reading||reading.health===null;
                    if(reading){targetFill.style.width=reading.health+"%";targetHealth.setAttribute("aria-label",reading.healthText);}
                    target.dataset.range=inspected.range;
                }
                var bearing = ((angle + Math.PI / 2) / (Math.PI / 4) % 8 + 8) % 8;
                tape.style.transform = "translateX(" + (-bearing * 48) + "px)";
                place.textContent = (hero.place || "Dungeon") + (Number.isInteger(hero.depth) && hero.depth > 0 ? ":" + hero.depth : "");
                setResource(health, "Health", hero.hp, hero.hp_max);
                var heat = hero.species === "Automaton";
                magic.root.classList.toggle("heat", heat);
                setResource(magic, heat ? "Heat" : "Magicka", heat && Number.isFinite(hero.mp_max) && Number.isFinite(hero.mp)
                    ? hero.mp_max - hero.mp : hero.mp, hero.mp_max);
                progress.style.setProperty("--xp",(Number.isFinite(hero.progress)?Math.max(0,Math.min(100,hero.progress)):0)+"%");
                progress.textContent = Number.isInteger(hero.xl) ? "Level " + hero.xl : "";
                if (Number.isFinite(hero.progress) && hero.xl < 27)
                    progress.textContent += " · " + Math.max(0, Math.min(100, hero.progress)) + "% to next";
                reticle.hidden = Boolean(host.querySelector(".first-person-targeting-active"));
            },
            destroy: function () { observer.disconnect(); root.remove(); host.style.removeProperty("--first-person-tools-top"); }
        };
    }
    return { create: create };
});
