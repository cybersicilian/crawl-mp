/* Two periodic 256px material fields in one GLSL draw. Native tile banks and
 * occluded source lighting are composed by the existing terrain adapters. */
define(["shader-atlas", "liquid-field"], function (shaders, field) {
    "use strict";
    var engine, frame, signature;
    var fragment = [
        "precision highp float;uniform sampler2D noiseMap;uniform float waterPhase;uniform float lavaPhase;",
        "float hash(vec2 p,float period){return texture2D(noiseMap,(mod(p,period)+.5)/256.).r;}",
        "float noise(vec2 p,float period){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
        "return mix(mix(hash(i,period),hash(i+vec2(1,0),period),f.x),mix(hash(i+vec2(0,1),period),hash(i+vec2(1,1),period),f.x),f.y);}",
        "void main(){vec2 p=vec2(gl_FragCoord.x-.5,511.5-gl_FragCoord.y);bool lava=p.y>=256.;p.y=mod(p.y,256.);",
        "float phase=lava?lavaPhase:waterPhase;float drift=lava?phase:phase*2.;",
        "float warp=noise((p+vec2(drift,-drift))/16.,16.);vec2 w=p+vec2(drift,-drift)+(warp-.5)*vec2(11,7);",
        "float body=noise(w/16.,16.)*.32+noise(w/8.,32.)*.42+noise(w/4.,64.)*.26;vec3 colour;",
        "if(lava){float molten=1.-smoothstep(.43,.62,body);float hot=pow(molten,3.5)*smoothstep(.2,.85,noise((w+vec2(37,-19))/4.,64.));",
        "float crust=noise(p/2.,128.);float seam=pow(max(0.,1.-abs(body-.455)*35.),3.);",
        "colour=vec3(45,23,20)+molten*vec3(153,36,2)+hot*vec3(49,128,24)+crust*vec3(12,7,6)+seam*vec3(12,16,6);",
        "}else{float wave=sin((p.x+phase*2.)*3.14159265/16.+warp*2.)*cos((p.y-phase*2.)*3.14159265/16.-body*3.);",
        "float caustic=pow(max(0.,1.-abs(body-.5)*16.),3.);float crest=pow(max(0.,wave),8.);",
        "colour=vec3(9,38,59)+body*vec3(12,21,23)+caustic*vec3(7,14,18)+wave*vec3(2,4,5)+crest*vec3(4,8,10);}",
        "gl_FragColor=vec4(colour/255.,1.);}"
    ].join("\n");
    function pixels(waterPhase, lavaPhase) {
        if (!engine) {
            var noise = new Uint8Array(256 * 256);
            for (var y = 0; y < 256; y++) for (var x = 0; x < 256; x++) noise[y * 256 + x] = Math.round(field.noise(x, y, 256) * 255);
            engine = shaders.create(fragment, 256, 512, noise);
        }
        var key = waterPhase + ":" + lavaPhase, state = engine.status().backend;
        if (signature !== key || state !== "webgl" || !frame) {
            frame = engine.render({ waterPhase: waterPhase, lavaPhase: lavaPhase }); signature = key;
        }
        return frame;
    }
    return { pixels: pixels, status: function () { return engine ? engine.status() : { backend: "idle", renders: 0 }; } };
});
