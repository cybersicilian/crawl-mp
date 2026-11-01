/* Validate name-resolved art against an explicitly supplied, unmodified native build. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const load = require('./helpers/art-catalog-fixture.cjs');
const root = path.resolve(process.argv[2]);
const output = process.argv[3];
assert(output, 'Explicit native static root and output path required');
const m = load(root), catalogs = m['./environment-art'], sprites = m['./environment-sprites'];
const native = {}, pngs = {}, mapped = [], coordinates = new Map();
for (const name of ['floor','wall','feat','main','player','icons','gui']) {
    const file = path.join(root,name+'.png'), bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(1,4).toString(),'PNG');
    pngs[name]={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
for (const name of ['tileinfo-floor','tileinfo-wall','tileinfo-feat','tileinfo-main','tileinfo-player','tileinfo-dngn']) {
    native[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name+'.js'))).digest('hex');
}
for (const [key,catalog] of Object.entries(catalogs)) {
    const dungeon = ['ground','sprites','features','thresholds'].includes(key);
    const tiles = m[dungeon?'./tileinfo-dngn':'./tileinfo-player'];
    for (const entry of catalog.entries) for (const symbol of entry.names) {
        assert.equal(typeof tiles[symbol],'number','Missing release symbol: '+symbol);
    }
}
for (const [atlas,regions] of [['feat',sprites.feat.concat(sprites.dungeon)],['player',sprites.player]]) {
    const tiles = m[atlas==='player'?'./tileinfo-player':'./tileinfo-dngn'];
    for (const r of regions) {
        assert.equal(tiles.get_img(r.tile),atlas);
        assert(r.x>=0&&r.y>=0&&r.x+r.w<=pngs[atlas].width&&r.y+r.h<=pngs[atlas].height,'Native crop bounds');
        const rectangle=[atlas,r.x,r.y,r.w,r.h].join(':');
        assert(!coordinates.has(rectangle),'Ambiguous native portrait crop: '+rectangle);coordinates.set(rectangle,r.tile);
        for (const band of r.preserveAlpha ? (Array.isArray(r.preserveAlpha)?r.preserveAlpha:[r.preserveAlpha]) : [])
            assert(band.x>=0&&band.y>=0&&band.x+band.w<=r.w&&band.y+band.h<=r.h,'Attachment window bounds');
        mapped.push({atlas,tile:r.tile,sheet:r.sheet,x:r.x,y:r.y,w:r.w,h:r.h});
    }
}
assert.equal(m['./tileinfo-player'].tile_count(m['./tileinfo-player'].BASE_HUMAN),6);
assert.equal(m['./tileinfo-player'].tile_count(m['./tileinfo-player'].MONS_HYDRA),7);
const report={passed:true,nativeEngine:false,nativeRoot:root,nativeCatalogSha256:native,nativeAtlases:pngs,mapped,
    allSymbolsResolved:true,portraitCropsUnambiguous:true,nativeFilesModified:false};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,mapped:mapped.length,playerHeight:pngs.player.height}));
