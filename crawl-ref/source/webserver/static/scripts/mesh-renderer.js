/* Dependency-free WebGL mesh renderer with alpha-tested soft shadow maps.
 * Scene contract: {mesh:{groups(),boxes},sprites,lights}; no game-specific state. */
define(["mesh-camera", "mesh-geometry", "mesh-shaders", "mesh-transparency", "mesh-fluid", "mesh-look", "mesh-intersections"], function (math, geometry, shaders, transparency, fluid, look, intersections) {
    "use strict";
    function create(canvas) {
        var gl = canvas.getContext("webgl", { alpha: false, antialias: true, preserveDrawingBuffer: true });
        if (!gl) return null;
        var textures = new Map(), terrain = [], actors = [], shadowActors = [], source = null, lastCamera, lost = false, framePhase = 0;
        var stats = { backend: "webgl", shadowMap: 1024, triangles: 0, draws: 0 };
        canvas.addEventListener("webglcontextlost", function (event) { event.preventDefault(); lost = true; });
        function program(fragment) {
            function shader(kind, text) {
                var object = gl.createShader(kind); gl.shaderSource(object, text); gl.compileShader(object);
                if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(object));
                return object;
            }
            var object = gl.createProgram(), vert = shader(gl.VERTEX_SHADER, shaders.vertex), frag = shader(gl.FRAGMENT_SHADER, fragment);
            gl.attachShader(object, vert); gl.attachShader(object, frag); gl.linkProgram(object);
            gl.deleteShader(vert); gl.deleteShader(frag);
            if (!gl.getProgramParameter(object, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(object));
            var uniforms = {}, attributes = {};
            ["uMatrix", "uShadowMatrix", "uTexture", "uShadow", "uEye", "uLightPos[0]", "uLightColor[0]", "uTint",
                "uSurface", "uMaterial", "uOptical", "uNormalRoughness", "uDetail", "uFluid", "uFluidShore", "uFluidVolume", "uFluidDepthEdges", "uFluidTime", "uShadowEnabled", "uContacts[0]", "uContactCount",
                "uAmbient", "uBounce", "uFogColor", "uAtmosphere", "uGold"].forEach(function (key) { uniforms[key] = gl.getUniformLocation(object, key); });
            ["aPosition", "aNormal", "aUV", "aShade"].forEach(function (key) { attributes[key] = gl.getAttribLocation(object, key); });
            return { object: object, uniforms: uniforms, attributes: attributes };
        }
        var main = program(shaders.fragment(Boolean(gl.getExtension("OES_standard_derivatives")))), depth = program(shaders.depth);
        var shadow = gl.createTexture(), shadowBuffer = gl.createFramebuffer(), shadowDepth = gl.createRenderbuffer();
        gl.bindTexture(gl.TEXTURE_2D, shadow); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowBuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadow, 0);
        gl.bindRenderbuffer(gl.RENDERBUFFER, shadowDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1024, 1024);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowDepth);
        var shadows = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        function texture(material) {
            var image = material.image, value = textures.get(image);
            if (value) return value;
            value = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, value);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            textures.set(image, value); return value;
        }
        function upload(group) {
            var buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, group.data, gl.STATIC_DRAW);
            return { buffer: buffer, count: group.data.length / 9, material: group.material,faces:transparency.faces(group.data) };
        }
        function drop(groups) { groups.forEach(function (group) { gl.deleteBuffer(group.buffer); }); }
        function bind(group, p) {
            gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
            [["aPosition",3,0],["aNormal",3,12],["aUV",2,24],["aShade",1,32]].forEach(function (entry) {
                var location = p.attributes[entry[0]];
                if (location >= 0) { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, entry[1], gl.FLOAT, false, 36, entry[2]); }
            });
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture(group.material)); gl.uniform1i(p.uniforms.uTexture, 0);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,group.material.pixelated?gl.NEAREST:gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,group.material.pixelated?gl.NEAREST:gl.LINEAR);
            var image=group.material.image,w=image.width,h=image.height;
            var repeat=group.material.tileScale && w>0 && h>0 && (w&(w-1))===0 && (h&(h-1))===0;
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
        }
        function draw(groups, p) {
            groups.forEach(function (group) {
                if(p===depth && (group.material.castShadow===false || group.material.opacity<1 || group.material.transmission>0))return;
                bind(group, p);
                if (p === main) {
                    var m = group.material;
                    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture({image:m.normalMap||m.image}));
                    if(m.normalMap){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
                        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
                    gl.uniform1i(p.uniforms.uNormalRoughness,2);
                    gl.uniform4fv(p.uniforms.uDetail,[m.normalMap?1:0,m.normalStrength===undefined?1:m.normalStrength,m.specularGain||0,0]);
                    gl.uniform4fv(p.uniforms.uGold,[m.finish==="gold"?1:0,m.goldMicrofacet||72,m.goldGlint===undefined?0.12:m.goldGlint,framePhase]);
                    var water=fluid.uniforms(m.fluid,m.fluidShore,framePhase,m.fluidDepthEdges);
                    gl.uniform4fv(p.uniforms.uFluidDepthEdges,water.depthEdges);gl.uniform4fv(p.uniforms.uFluidVolume,water.volume);gl.uniform4fv(p.uniforms.uFluid,water.fluid);gl.uniform4fv(p.uniforms.uFluidShore,water.shore);gl.uniform1f(p.uniforms.uFluidTime,water.time);
                    gl.uniform3fv(p.uniforms.uTint, m.tint || [1, 1, 1]);
                    gl.uniform4fv(p.uniforms.uSurface, [m.relief || 0, m.gloss || 0, m.actor ? 1 : 0, m.emission || 0]);
                    gl.uniform4fv(p.uniforms.uMaterial,[m.roughness===undefined?1-(m.gloss||0):m.roughness,m.metalness||0,m.preservePalette?1:0,m.pixelated?1:0]);
                    gl.uniform3fv(p.uniforms.uOptical,[m.opacity===undefined?1:m.opacity,m.transmission||0,m.ior||1.5]);
                }
                gl.drawArrays(gl.TRIANGLES, group.start||0, group.count); stats.draws++;
            });
        }
        function paint(scene, camera) {
            if (lost) return;
            framePhase=Number.isFinite(scene.phase)?scene.phase:0;
            if (source !== scene) {
                drop(terrain); terrain = scene.mesh.groups().map(upload); source = scene;
                textures.forEach(function (value) { gl.deleteTexture(value); }); textures.clear();
            }
            drop(actors); actors = (scene.sprites || []).slice().sort(function(a,c){return Math.hypot(c.x-camera.x,c.y-camera.y)-Math.hypot(a.x-camera.x,a.y-camera.y);})
                .map(function (sprite) { return upload(geometry.sprite(sprite, camera.angle)); });
            drop(shadowActors); shadowActors = (scene.shadowSprites || []).map(function (sprite) { return upload(geometry.sprite(sprite, camera.angle)); });
            lastCamera = camera; stats.draws = 0; stats.shadows = scene.shadows !== false;
            var b = math.basis(camera), key = [camera.x - 2.4, Math.max(4.6, b.eye[1] + 2), camera.y + 2.2];
            var nearby=(scene.lights||[]).slice().sort(function(a,c){return Math.hypot(a.position[0]-camera.x,a.position[2]-camera.y)-Math.hypot(c.position[0]-camera.x,c.position[2]-camera.y);});
            var torch=nearby.find(function(light){return light.kind==="torch";});
            if(torch)key=torch.position;
            var lightMatrix = math.shadowMatrix([camera.x, 0.7, camera.y], key, 10);
            gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
            if (shadows && scene.shadows !== false) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, shadowBuffer); gl.viewport(0, 0, 1024, 1024);
                gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(depth.object);
                gl.uniformMatrix4fv(depth.uniforms.uMatrix, false, lightMatrix); gl.uniformMatrix4fv(depth.uniforms.uShadowMatrix, false, lightMatrix);
                draw(terrain, depth); draw(actors, depth); draw(shadowActors, depth);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
            var atmosphere=look.resolve(scene.look);
            gl.clearColor(atmosphere.fogColor[0], atmosphere.fogColor[1], atmosphere.fogColor[2], 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(main.object);
            gl.uniform3fv(main.uniforms.uAmbient,atmosphere.ambient);gl.uniform3fv(main.uniforms.uBounce,atmosphere.bounce);
            gl.uniform3fv(main.uniforms.uFogColor,atmosphere.fogColor);
            gl.uniform3fv(main.uniforms.uAtmosphere,[atmosphere.fogDensity,atmosphere.fogStart,atmosphere.exposure]);
            gl.uniformMatrix4fv(main.uniforms.uMatrix, false, math.matrix(camera, canvas.width, canvas.height));
            gl.uniformMatrix4fv(main.uniforms.uShadowMatrix, false, lightMatrix); gl.uniform3fv(main.uniforms.uEye, b.eye);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shadow); gl.uniform1i(main.uniforms.uShadow, 1);
            gl.uniform1f(main.uniforms.uShadowEnabled, shadows && scene.shadows !== false ? 1 : 0);
            var primary=torch||{position:key,color:[1,0.85,0.65],strength:2.7};
            var lights=[primary].concat(nearby.filter(function(light){return light!==torch;})).slice(0,4);
            var positions = new Float32Array(16), colors = new Float32Array(16);
            lights.forEach(function (light, i) { positions.set(light.position.concat(1), i * 4); colors.set(light.color.concat(light.strength), i * 4); });
            gl.uniform4fv(main.uniforms["uLightPos[0]"], positions); gl.uniform4fv(main.uniforms["uLightColor[0]"], colors);
            var contactSprites=(scene.sprites||[]).filter(function(sprite){return sprite.castsShadow!==false;});
            var contacts = new Float32Array(96), count = scene.shadows === false ? 0 : Math.min(24, contactSprites.length);
            for (var i = 0; i < count; i++) {
                var sprite = contactSprites[i]; contacts.set([sprite.x + 0.5, sprite.y + 0.5, Math.max(0.09, sprite.width * 0.52), sprite.flying ? 0.2 : 0.68], i * 4);
            }
            gl.uniform4fv(main.uniforms["uContacts[0]"], contacts); gl.uniform1i(main.uniforms.uContactCount, count);
            draw(terrain.filter(function(group){return !transparency.blended(group.material);}), main);
            var blended=transparency.order(terrain.filter(function(group){return transparency.blended(group.material);}).concat(actors),b.eye,b.forward);
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
            draw(blended, main); gl.depthMask(true);gl.disable(gl.BLEND);stats.transparentFaces=blended.length;
            stats.triangles = terrain.concat(actors).reduce(function (sum, group) { return sum + group.count / 3; }, 0);
            canvas.dataset.renderer = "webgl"; canvas.dataset.shadowMap = scene.shadows === false ? "none" : shadows ? "soft" : "contact";
        }
        function pick(x, y) {
            if (!source || !lastCamera || lost) return null;
            var ray = math.ray(lastCamera, x, y, canvas.width, canvas.height), nearest = Infinity, selected = null;
            source.mesh.boxes.forEach(function (box) {
                var distance = box.outline ? intersections.prismRay(ray, box) : math.boxRay(ray, box.min, box.max);
                if (distance !== null && distance < nearest) { nearest = distance; selected = box.cell; }
            });
            var b = math.basis(lastCamera);
            (source.sprites || []).forEach(function (sprite) {
                var normal = [-b.forward[0], 0, -b.forward[2]], denominator = math.dot(ray.direction, normal);
                if (Math.abs(denominator) < 0.00001) return;
                var center = [sprite.x + 0.5, 0, sprite.y + 0.5];
                var distance = math.dot(center.map(function (v, i) { return v - ray.origin[i]; }), normal) / denominator;
                if (distance < 0 || distance >= nearest) return;
                var point = ray.origin.map(function (v, i) { return v + ray.direction[i] * distance - center[i]; });
                var u = math.dot(point, b.right) / sprite.width + 0.5;
                var v = 1 - (point[1] - (sprite.elevation || 0)) / sprite.height;
                if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && (!sprite.hit || sprite.hit(u, v))) { nearest = distance; selected = sprite; }
            });
            return selected && selected.x !== undefined ? { x: selected.x, y: selected.y } : null;
        }
        function clear() { drop(terrain); drop(actors); drop(shadowActors); terrain = []; actors = []; shadowActors = []; source = null; lastCamera = null; }
        function destroy() {
            clear(); textures.forEach(function (value) { gl.deleteTexture(value); }); textures.clear();
            gl.deleteTexture(shadow); gl.deleteFramebuffer(shadowBuffer); gl.deleteRenderbuffer(shadowDepth);
            gl.deleteProgram(main.object); gl.deleteProgram(depth.object);
        }
        return { paint: paint, pick: pick, clear: clear, destroy: destroy, stats: stats,
            pixels: function () { var pixels = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; } };
    }
    return { create: create };
});
