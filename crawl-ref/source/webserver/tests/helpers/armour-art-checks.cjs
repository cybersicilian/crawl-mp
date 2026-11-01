/* Equipped paper-doll layers, native cutoffs and protected skin openings. */
module.exports = function armourArtChecks() {
    const m = window.benchModules, art = m['./tile-art-direction'], pack = m['texture-pack'];
    const tiles = m['./tileinfo-player'], dungeon = m['./tileinfo-dngn'], catalog = m['./environment-art'].armour;
    const raw = document.getElementById('player'), sheet = document.getElementById(catalog.id);
    const regions = m['./environment-sprites'].player.filter(r => r.sheet === catalog.id), cutoff = window.nativeArmourClip;
    function check(value, message) { if (!value) throw new Error(message); }
    function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function pixels(source) {
        const c = canvas(source.naturalWidth || source.width, source.naturalHeight || source.height);
        c.getContext('2d').drawImage(source, 0, 0); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    }
    check(sheet.naturalWidth === catalog.width && sheet.naturalHeight === catalog.height, 'armour source geometry');
    check(Number.isInteger(cutoff) && cutoff > 0 && cutoff < 32, 'owning native body-cut rule');
    const original = pixels(raw), source = pixels(sheet), details = new Map(), margins = [], maskChecks = [];
    for (const entry of catalog.entries) {
        const r = entry.sprite; let left = r.w, top = r.h, right = 0, bottom = 0;
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (source[((r.y+y)*catalog.width+r.x+x)*4+3] > 12) {
            left = Math.min(left,x); top = Math.min(top,y); right = Math.max(right,x+1); bottom = Math.max(bottom,y+1);
        }
        const margin = Math.min(left,top,r.w-right,r.h-bottom); check(right>left && margin>=8, 'isolated complete garment: '+entry.label);
        margins.push({ label: entry.label, margin });
        const index = tiles[entry.names[0]], region = regions.find(r => r.tile === index), detail = art.tile('player',index);
        check(detail && detail.width===region.w*4 && detail.height===region.h*4, 'fourfold garment detail'); details.set(index,detail);
    }
    sheet.id += '_held'; const baseline = pixels(art.image('player',raw));
    check(!art.tile('player',tiles.BODY_PLATE) && art.tile('player',tiles.MONS_ORC), 'missing armour preserves unrelated art'); sheet.id = catalog.id;
    const composed = art.image('player',raw), styled = pixels(composed), allowed = new Uint8Array(original.length/4);
    for (const r of regions) for (let y=r.y; y<r.y+r.h; y++) allowed.fill(1,y*raw.naturalWidth+r.x,y*raw.naturalWidth+r.x+r.w);
    let changed=0, outsideChanges=0;
    for (let n=0; n<allowed.length; n++) if ([0,1,2,3].some(k=>baseline[n*4+k]!==styled[n*4+k])) {
        if (allowed[n]) changed++; else outsideChanges++;
    }
    check(changed>0 && outsideChanges===0, 'only native armour rectangles change');
    for (const region of regions) {
        const detail=details.get(region.tile), data=pixels(detail), windows=[];
        for (const band of region.preserveAlpha) {
            let holes=0, painted=0;
            for (let y=band.y; y<band.y+band.h; y++) for (let x=band.x; x<band.x+band.w; x++) {
                const n=((region.y+y)*raw.naturalWidth+region.x+x)*4;
                if (original[n+3]<=12) {
                    check(styled[n+3]===0,'atlas neck/hand gap');
                    for (let dy=0;dy<4;dy++) for (let dx=0;dx<4;dx++) check(data[((y*4+dy)*detail.width+x*4+dx)*4+3]===0,'detail neck/hand gap');
                    holes++;
                } else if (data[((y*4+2)*detail.width+x*4+2)*4+3]>12) painted++;
            }
            check(holes>0 && painted>0,'protected window keeps openings and garment material'); windows.push({ holes,painted });
        }
        maskChecks.push({ tile:region.tile,windows });
        for (let n=0;n<20;n++) check(art.tile('player',region.tile)===detail,'stable multi-window source cache');
    }
    function hero(base,index,size,state={}) {
        const parts=[[base,32]];
        if (!state.cut && !state.hide) parts.push([tiles.LEG_PANTS_BLUE,32]);
        if (!state.hide) parts.push([index,state.cut?cutoff:32],[tiles.HAND1_SHORT_SWORD_SLANT,32],[tiles.HAND2_BUCKLER,32]);
        const c=canvas(size), renderer=new m['./cell_renderer'].DungeonCellRenderer();renderer.init(c);renderer.set_cell_size(size,size);
        const calls=[], draw=renderer.draw_player, sources=[], drawImage=renderer.ctx.drawImage.bind(renderer.ctx);
        renderer.draw_player=function(i,x,y,ox,oy,ymax){calls.push({i,ymax,alpha:this.ctx.globalAlpha});return draw.apply(this,arguments);};
        renderer.ctx.drawImage=(...args)=>{sources.push(args[0]);drawImage(...args);};
        renderer.do_render_cell(2,2,0,0,{x:2,y:2,mon:{id:77,name:'Fixture hero'},t:{
            bg:{value:state.water?dungeon.DNGN_SHALLOW_WATER:dungeon.FLOOR_GREY_DIRT,WATER:Boolean(state.water)},
            fg:{value:tiles.MCACHE_START},doll:parts,flv:{f:dungeon.FLOOR_GREY_DIRT,s:0},trans:Boolean(state.trans)}});
        const passes=state.water?2:1;check(calls.length===parts.length*passes,'native doll layer count');
        for (let pass=0;pass<passes;pass++) for (let n=0;n<parts.length;n++) {
            const call=calls[pass*parts.length+n];check(call.i===parts[n][0] && call.ymax===parts[n][1],'native part order and cutoff');
            const alpha = state.water ? (pass ? (state.trans ? 0.1 : 0.3) : (state.trans ? 0.5 : 1)) : 1;
            check(Math.abs(call.alpha-alpha)<.001,'native submerged doll alpha');
        }
        if (pack.illustrated()) check(sources.includes(details.get(index))===!state.hide,'armour detail follows visible native parts');
        return c;
    }
    function isolated(index,size) {
        const c=canvas(size), renderer=new m['./cell_renderer'].DungeonCellRenderer();renderer.init(c);renderer.set_cell_size(size,size);
        renderer.draw_player(index,0,0);return c;
    }
    function portrait(index,cut=false) {
        const c=canvas(128), info=tiles.get_tile_info(index), ctx=c.getContext('2d'), draw=ctx.drawImage.bind(ctx);let sampled=false;
        ctx.drawImage=(...args)=>{sampled ||= args[0]===details.get(index);draw(...args);};
        check(m['./native-tile-art'].draw(c,{layers:[{texture:'player',sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,
            ox:info.ox,oy:info.oy,ymax:cut?cutoff:32}]}),'native armour portrait');check(sampled,'portrait samples detailed garment');
        if (cut) {const data=pixels(c);for(let y=cutoff*4;y<128;y++)for(let x=0;x<128;x++)check(data[(y*128+x)*4+3]===0,'portrait waist cutoff');}
        return c;
    }
    const mounted=window.creaturePortraitFixture, fresh=canvas(mounted.frame.querySelector('canvas').width);
    check(m['./native-tile-art'].draw(fresh,mounted.art),'fresh armour portrait');
    const mountedPixels=pixels(mounted.frame.querySelector('canvas')), expectedPortrait=pixels(fresh);
    check(mountedPixels.every((v,i)=>v===expectedPortrait[i]),'deferred portrait refresh');
    const main=document.createElement('main');document.body.prepend(main);main.innerHTML='<h1>Painted player armour</h1>'
        +'<p>Nine native garment appearances · original doll geometry, hand/neck openings and waist cuts · controlled fixture</p>'
        +'<table><thead><tr><th>Armour</th><th>Native garment 96px</th><th>Illustrated garment 32px</th><th>Human 96px</th>'
        +'<th>Human 128px</th><th>Alternate base 96px</th><th>Naga 96px</th><th>Submerged 96px</th><th>Portrait 128px</th></tr></thead><tbody></tbody></table>';
    const entries=[];
    for (const entry of catalog.entries) {
        const index=tiles[entry.names[0]], row=document.createElement('tr'), label=document.createElement('th');label.textContent=entry.label;row.append(label);main.querySelector('tbody').append(row);
        pack.select('classic');const native=isolated(index,96);pack.select('illustrated');
        const cut=hero(tiles.BASE_NAGA,index,96,{cut:true});
        // Compare garment-only clipping in portraits; complete dolls also retain native held gear.
        portrait(index,true);hero(tiles.BASE_FELID,index,96,{hide:true});hero(tiles.BASE_HUMAN,index,96,{water:true,trans:true});
        for(const c of [native,isolated(index,32),hero(tiles.BASE_HUMAN,index,96),hero(tiles.BASE_HUMAN,index,128),
            hero(tiles.HUMAN_3,index,96),cut,hero(tiles.BASE_HUMAN,index,96,{water:true}),portrait(index)]) {
            const td=document.createElement('td');td.append(c);row.append(td);
        }
        entries.push({label:entry.label,portrait:true,cutoff,hiddenParts:true,water:true});
    }
    for(const name of ['BODY_PLATE_MAGIC','BODY_LEATHER_ARMOUR_RANDART','BODY_ROBE_OF_NIGHT','BODY_DRAGONARM_RED']) check(!art.tile('player',tiles[name]),'independent armour: '+name);
    check(pixels(raw).every((v,i)=>v===original[i]),'native source immutable');
    pack.select('classic');check(art.image('player',raw)===raw && !art.tile('player',tiles.BODY_PLATE),'Classic restores native armour');pack.select('illustrated');
    return {passed:true,nativeEngine:false,entries,margins,maskChecks,changed,outsideChanges,nativeSourceImmutable:true,
        nativePartOrder:true,nativeWaistCut:cutoff,hiddenParts:true,nativeSubmersion:true,deferredPortraitRefresh:true,classicNative:true};
};
