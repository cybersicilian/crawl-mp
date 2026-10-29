/* Run inside the shared host gate. Requires sharp and the existing native tilegen. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const tiles = path.resolve(__dirname, '../../rltiles');
const web = path.resolve(__dirname, '../game_data/static');
function catalog() {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(tiles, 'tileinfo-gui.js'), 'utf8'), {
        define(deps, factory) { result = factory({ TILEP_PLAYER_MAX: 10000 }); }
    });
    return result;
}
async function generate() {
    const before = catalog();
    const original = await sharp(path.join(tiles, 'gui.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await sharp(path.join(tiles, 'gui/abilities/shell_dash.svg'))
        .png().toFile(path.join(tiles, 'gui/abilities/shell_dash.png'));
    execFileSync(path.join(tiles, 'tool/tilegen.elf'), ['-i', '-c', 'dc-gui.txt'], { cwd: tiles, stdio: 'inherit' });
    assert(fs.readFileSync(path.join(tiles, 'tileinfo-gui.js'), 'utf8').split('\n').length <= 600,
        'Rebuild rltiles/tool/tilegen.elf from current source to keep generated browser metadata within 600 lines');
    const after = catalog();
    const updated = await sharp(path.join(tiles, 'gui.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let preserved = 0;
    for (const [name, index] of Object.entries(before)) {
        if (name === 'ABILITY_SHELL_DASH' || !Number.isInteger(index) || !before.get_tile_info(index)) continue;
        assert.equal(after[name], index, name + ' keeps its atlas index');
        const a = before.get_tile_info(index), b = after.get_tile_info(index);
        assert.equal(a.ex - a.sx, b.ex - b.sx); assert.equal(a.ey - a.sy, b.ey - b.sy);
        assert.equal(a.ox, b.ox); assert.equal(a.oy, b.oy);
        for (let y = 0; y < a.ey - a.sy; y++) {
            const startA = ((a.sy + y) * original.info.width + a.sx) * 4;
            const startB = ((b.sy + y) * updated.info.width + b.sx) * 4;
            assert(original.data.subarray(startA, startA + (a.ex - a.sx) * 4)
                .equals(updated.data.subarray(startB, startB + (b.ex - b.sx) * 4)), name + ' keeps its pixels');
        }
        preserved++;
    }
    for (const name of ['gui.png', 'tileinfo-gui.js']) fs.copyFileSync(path.join(tiles, name), path.join(web, name));
    console.log(JSON.stringify({ shellDash: after.ABILITY_SHELL_DASH, jump: after.ABILITY_JUMP,
        preservedNativeTiles: preserved, webAtlasSynchronized: true }));
}
generate().catch(error => { console.error(error); process.exitCode = 1; });
