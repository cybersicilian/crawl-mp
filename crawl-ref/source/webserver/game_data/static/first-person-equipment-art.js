/* Sample the equipped inventory item's exact native layers, including variants. */
define(["./native-tile-art", "./tileinfo-main"], function (art, tiles) {
    "use strict";
    function create() {
        function sample(entry) {
            if (!entry || !entry.art && !entry.tile) return null;
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            var drawn = entry.art ? art.drawNative(canvas,entry.art) : art.drawIndices(canvas,entry.tile,tiles);
            if (!drawn) return null;
            var textures = entry.art ? Array.from(new Set(entry.art.layers.map(function (layer) {
                return layer.texture || entry.art.texture;
            }))) : ["main"];
            var versions = textures.map(function (id) {
                var image = document.getElementById(id);
                return [id,image && (image.currentSrc || image.src),image && image.naturalWidth,image && image.naturalHeight];
            });
            return { canvas:canvas, source:"inventory", width:32, height:32,
                key:JSON.stringify([entry.art || null,entry.tile || null,versions]) };
        }
        return { sample:sample };
    }
    return { create:create };
});
