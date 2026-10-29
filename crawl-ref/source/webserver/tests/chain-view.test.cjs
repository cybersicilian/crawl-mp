const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture() {
    const events = new Map(), frames = new Map(), canvases = [], paints = [];
    let serial = 0, module;
    const context = { clearRect() {} };
    const document = { hidden: false, body: { appendChild: canvas => canvases.push(canvas) },
        createElement() {
            return { style: {}, setAttribute() {}, getContext: () => context,
                remove() { canvases.splice(canvases.indexOf(this), 1); } };
        } };
    const window = {
        requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; },
        cancelAnimationFrame(id) { frames.delete(id); }
    };
    function $(element) {
        assert([document, window].includes(element));
        return { on(names, handler) {
            for (const name of names.split(' ')) events.set(name, handler);
            return this;
        } };
    }
    const map = { get: (x, y) => ({ x, y }), visible: cell => cell.x !== 9 };
    const modules = { jquery: $, './map_knowledge': map,
        './chain-painter': { paint: (...args) => paints.push(args.slice(1)) } };
    for (const name of ['frame-update', 'chain-view']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,
            '../game_data/static', name + '.js'), 'utf8'), {
            window, document, define(dependencies, factory) {
                module = factory(...dependencies.map(dependency => modules[dependency]));
                modules['./' + name] = module;
            }
        });
    }
    const renderer = { viewX: 0, element: { width: 640, height: 480, isConnected: true,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 240 }) },
        in_view: x => x >= 0 && x < 10,
        canvas_coords(x, y) { return { x: (x - this.viewX) * 64, y: y * 64, width: 64, height: 64 }; } };
    module.attach(renderer);
    return { document, renderer, events, frames, canvases, paints,
        emit(event, state) { events.get(event + '.livingChain')({}, state); },
        state(chains) { this.emit('party_state_rendered', { members: chains.map(chain => ({ chain })) }); },
        tick() {
            const pending = Array.from(frames.values());
            frames.clear();
            pending.forEach(callback => callback());
        } };
}

const chain = (pinned = false) => ({ anchor: { x: 1, y: 1 }, target: { x: 5, y: 1 }, pinned });

test('chains follow camera and renderer scale without capturing input or running idle frames', () => {
    const f = fixture();
    f.state([chain()]);
    f.tick();
    assert.equal(f.canvases.length, 1);
    assert.equal(f.canvases[0].width, 640);
    assert.equal(f.canvases[0].style.width, '320px');
    assert.equal(f.canvases[0].style.pointerEvents, 'none');
    assert.equal(f.paints[0][0].x, 96);
    assert.equal(f.paints[0][1].x, 352);
    assert.equal(f.frames.size, 0);
    f.renderer.viewX = 1;
    f.emit('game_camera_changed');
    f.tick();
    assert.equal(f.paints[1][0].x, 32);
    assert.equal(f.paints[1][1].x, 288);
});

test('a pin stays attached to its floor cell as the quarry moves', () => {
    const f = fixture();
    const pin = chain(true);
    pin.anchor = { x: 5, y: 1 };
    f.state([pin]); f.tick();
    assert.equal(f.paints[0][0].x, f.paints[0][1].x, 'same-cell pin still reaches the painter');
    pin.target = { x: 6, y: 2 };
    f.state([pin]); f.tick();
    assert.equal(f.paints[1][0].x, 352);
    assert.equal(f.paints[1][1].x, 416);
    assert.equal(f.paints[1][2], true);
});

test('hidden, off-screen and missing endpoints reveal no chain coordinates', () => {
    const f = fixture();
    for (const target of [{ x: 9, y: 1 }, { x: -1, y: 1 }, null, { x: NaN, y: 1 }]) {
        f.state([{ ...chain(), target }]); f.tick();
        assert.equal(f.canvases.length, 0);
    }
    f.state([chain(), { ...chain(), target: { x: 9, y: 1 } }]); f.tick();
    assert.equal(f.paints.length, 1, 'hidden relationships cannot suppress visible ones');
    f.document.hidden = true;
    f.emit('visibilitychange'); f.tick();
    assert.equal(f.canvases.length, 0);
});

test('release and connection lifecycle remove overlays and pending frames', () => {
    const f = fixture();
    f.state([chain()]); f.tick();
    f.state([]); f.tick();
    assert.equal(f.canvases.length, 0);
    for (const event of ['game_cleanup', 'game_connection_lost', 'game_preinit']) {
        f.state([chain()]); f.tick();
        f.emit('game_camera_changed');
        f.emit(event);
        assert.equal(f.canvases.length, 0);
        assert.equal(f.frames.size, 0);
    }
});
