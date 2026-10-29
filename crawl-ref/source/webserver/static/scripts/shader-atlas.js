/* One bounded offscreen GPU surface, copied once per frame into CPU-addressable
 * pixels. Consumers share the frame; there is no per-tile GPU readback. */
define([], function () {
    "use strict";
    function create(fragment, width, height, noise) {
        var canvas, snapshot, ctx, gl, program, buffer, texture, locations = {}, state = "idle", error = null, renders = 0;
        function compile(type, source) {
            var shader = gl.createShader(type);
            gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                var message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message);
            }
            return shader;
        }
        function setup() {
            var vertex, pixel;
            try {
                vertex = compile(gl.VERTEX_SHADER, "attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}");
                pixel = compile(gl.FRAGMENT_SHADER, fragment);
                program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, pixel); gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                gl.useProgram(program);
                buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
                var position = gl.getAttribLocation(program, "position");
                gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
                if (noise) {
                    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, noise);
                    gl.uniform1i(gl.getUniformLocation(program, "noiseMap"), 0);
                }
                locations = {}; state = "webgl"; error = null;
            } catch (failure) { state = "fallback"; error = String(failure.message || failure); }
            finally {
                if (vertex) gl.deleteShader(vertex);
                if (pixel) gl.deleteShader(pixel);
            }
        }
        function initialize() {
            canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
            canvas.addEventListener("webglcontextlost", function (event) {
                if (state !== "disposed") { event.preventDefault(); state = "lost"; }
            });
            canvas.addEventListener("webglcontextrestored", function () { if (state !== "disposed") setup(); });
            gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
            if (!gl) { state = "fallback"; return; }
            snapshot = document.createElement("canvas"); snapshot.width = width; snapshot.height = height;
            ctx = snapshot.getContext("2d", { willReadFrequently: true });
            if (!ctx) { state = "fallback"; return; }
            setup();
        }
        function render(uniforms) {
            if (state === "idle") initialize();
            if (state !== "webgl" || gl.isContextLost()) return null;
            try {
                gl.useProgram(program); gl.viewport(0, 0, width, height);
                Object.keys(uniforms).forEach(function (key) {
                    if (!(key in locations)) locations[key] = gl.getUniformLocation(program, key);
                    gl.uniform1f(locations[key], uniforms[key]);
                });
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                // Copy synchronously before WebGL may discard its drawing buffer.
                ctx.drawImage(canvas, 0, 0); renders++;
                return ctx.getImageData(0, 0, width, height).data;
            } catch (failure) { state = "fallback"; error = String(failure.message || failure); return null; }
        }
        function dispose() {
            if (gl && !gl.isContextLost()) {
                if (program) gl.deleteProgram(program);
                if (buffer) gl.deleteBuffer(buffer);
                if (texture) gl.deleteTexture(texture);
            }
            state = "disposed";
        }
        return { render: render, dispose: dispose, status: function () {
            return { backend: state, renders: renders, error: error, width: width, height: height };
        } };
    }
    return { create: create };
});
