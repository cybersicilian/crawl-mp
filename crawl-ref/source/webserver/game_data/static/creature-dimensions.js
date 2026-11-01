/* Native size classes determine world scale; atlas framing never defines size. */
define(["./creature-size-data"], function (data) {
    "use strict";
    var heights = [0.3, 0.7, 1.02, 1.48, 2.12, 2.9];
    var eyes = [0.27, 0.54, 0.79, 1.1, 1.57, 2.15];
    var widths = [0.30,0.45,0.60,0.90,1.30,1.70];
    function valid(value) { return Number.isInteger(value) && value >= 0 && value < heights.length; }
    function native(monster) {
        if (!monster) return [3, "humanoid"];
        // A known visible name survives native enum revisions; generated
        // numeric fallbacks are useful when no canonical name is available.
        var name = String(monster.name || "").trim().toLowerCase();
        var named = Object.prototype.hasOwnProperty.call(data.names, name) ? data.names[name] : null;
        var base = named || data.monsters[monster.btype] || data.monsters[monster.type] || [3, "humanoid"];
        var shape = typeof monster.body_shape === "string" && monster.body_shape.trim()
            ? monster.body_shape : base[1];
        return [valid(monster.body_size) ? monster.body_size : base[0], shape];
    }
    function heroSize(hero) {
        if (valid(hero.body_size)) return hero.body_size;
        if (valid(data.forms[hero.form])) return data.forms[hero.form];
        var species = String(hero.species || "human").toLowerCase();
        return valid(data.species[species]) ? data.species[species] : 3;
    }
    function describe(monster, hero, aspect, flags) {
        var profile = hero ? [heroSize(hero), "humanoid"] : native(monster);
        var size = profile[0], shape = profile[1], height = heights[size];
        if (/quadruped|arachnid|centipede|insect|fish/.test(shape)) height *= 0.55;
        else if (/snake/.test(shape)) height *= 0.32;
        else if (/bat|bird/.test(shape)) height *= 0.55;
        var logicalHeight=height;
        var flying = Boolean(flags && flags.FLYING);
        var maximum=widths[size]*1.15,ratio=Math.max(0.2,Math.min(4,aspect||0.6));
        var width=height*ratio,fit=Math.min(1,maximum/width);
        // A wide cutout fits its footprint uniformly; logical body scale stays
        // explicit. Camera and shadow anchors follow the rendered art, not an
        // unfitted standing height that could put the eyes above its head.
        width*=fit;height*=fit;
        var elevation=flying?Math.max(0.28,height*0.5):0.015;
        var eyeRatio=Math.max(0.1,Math.min(0.95,eyes[size]/heights[size]));
        return { size: size, logicalHeight:logicalHeight, height: height, width: width,artScale:fit,
            eye:elevation+height*eyeRatio,elevation:elevation,flying:flying,shape:shape };
    }
    return { describe: describe, heroSize: heroSize, eyeHeight: function (hero, renderedProfile) {
        return renderedProfile&&Number.isFinite(renderedProfile.eye)&&renderedProfile.eye>0
            ?renderedProfile.eye:eyes[heroSize(hero)];
    },
        catalog: data };
});
