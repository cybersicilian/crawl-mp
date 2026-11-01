/* Human appearance identity, native grips and composed armour/hair/helmet layers. */
module.exports = function humanBaseChecks() {
    const m=window.benchModules, art=m['./tile-art-direction'], pack=m['texture-pack'], tiles=m['./tileinfo-player'];
    const catalog=m['./environment-art'].humanBases, regions=m['./environment-sprites'].player.filter(r=>r.sheet===catalog.id);
    const sheet=document.getElementById(catalog.id), raw=document.getElementById('player'), dungeon=m['./tileinfo-dngn'];
    function check(v,message){if(!v)throw new Error(message);}
    function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
    function pixels(image){const c=canvas(image.naturalWidth||image.width,image.naturalHeight||image.height);const ctx=c.getContext('2d');
        ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
    check(sheet.naturalWidth===catalog.width&&sheet.naturalHeight===catalog.height,'human source dimensions');
    const original=pixels(raw), source=pixels(sheet), details=new Map(), entries=[], signatures=new Set();
    const nativeHair=tiles.get_tile_info(tiles.HAIR_SHORT_BLACK), hairBottom=nativeHair.oy+nativeHair.ey-nativeHair.sy;
    for(const entry of catalog.entries){const index=tiles[entry.names[0]], r=regions.find(r=>r.tile===index), detail=art.tile('player',index);
        check(detail&&detail.width===r.w*4&&detail.height===r.h*4,'fourfold base detail');details.set(index,detail);
        const rect=entry.sprite;let left=rect.w,top=rect.h,right=0,bottom=0;
        for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++)if(source[((rect.y+y)*catalog.width+rect.x+x)*4+3]>12){
            left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
        const margin=Math.min(left,top,rect.w-right,rect.h-bottom);check(margin>=8,'complete isolated human crop');
        const data=pixels(detail);let hash=2166136261;for(const value of data)hash=Math.imul(hash^value,16777619)>>>0;
        check(!signatures.has(hash),'six appearances retain distinct artwork');signatures.add(hash);
        let brightness=0,faceSamples=0;
        const info=tiles.get_tile_info(index), outline=[];
        // Compare in native attachment coordinates; a thin/short head disappears under native bangs.
        for(let y=nativeHair.oy+1;y<=hairBottom+3;y+=.25){
            const row=Math.floor((y-info.oy)*4);let first=detail.width,last=-1;
            for(let x=0;x<detail.width;x++)if(data[(row*detail.width+x)*4+3]>128){first=Math.min(first,x);last=x;}
            outline.push({y,width:last>=first?(last-first+1)/4:0});
        }
        const headWidth=Math.max(...outline.filter(r=>r.y<=hairBottom-1).map(r=>r.width));
        const neck=outline.filter(r=>r.y>=hairBottom-1).reduce((a,b)=>b.width<a.width?b:a);
        for(let y=4;y<8;y++)for(let x=13;x<19;x++)for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){
            const n=(((y-info.oy)*4+dy)*detail.width+(x-info.ox)*4+dx)*4;
            if(data[n+3]>128){brightness+=data[n]*.2126+data[n+1]*.7152+data[n+2]*.0722;faceSamples++;}}
        check(faceSamples>30,'readable opaque face source');entries.push({label:entry.label,index,margin,faceBrightness:brightness/faceSamples,headWidth,neckY:neck.y,nativeHairBottom:hairBottom});
    }
    sheet.id+='_held';const baseline=pixels(art.image('player',raw));check(!art.tile('player',tiles.BASE_HUMAN),'missing base fallback');sheet.id=catalog.id;
    const styled=pixels(art.image('player',raw)), allowed=new Uint8Array(original.length/4);let changed=0,outsideChanges=0;
    for(const r of regions)for(let y=r.y;y<r.y+r.h;y++)allowed.fill(1,y*raw.naturalWidth+r.x,y*raw.naturalWidth+r.x+r.w);
    for(let n=0;n<allowed.length;n++)if([0,1,2,3].some(k=>baseline[n*4+k]!==styled[n*4+k])){if(allowed[n])changed++;else outsideChanges++;}
    check(changed>0&&outsideChanges===0,'only human base rectangles change');
    const grips=[];
    for(const r of regions){const data=pixels(details.get(r.tile)), band=r.preserveAlpha;let holes=0;const overlap=[0,0];
        for(let y=band.y;y<band.y+band.h;y++)for(let x=0;x<r.w;x++){
            const a=original[((r.y+y)*raw.naturalWidth+r.x+x)*4+3];
            if(a<=12){check(styled[((r.y+y)*raw.naturalWidth+r.x+x)*4+3]===0,'native base grip gap');
                for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)check(data[((y*4+dy)*details.get(r.tile).width+x*4+dx)*4+3]===0,'detail base grip gap');holes++;}
            else{const worldX=x+tiles.get_tile_info(r.tile).ox;if((worldX<10||worldX>=22)&&data[((y*4+2)*details.get(r.tile).width+x*4+2)*4+3]>128)
                overlap[worldX<10?0:1]++;}}
        check(holes>0&&overlap.every(n=>n>0),'both hands overlap native attachment zones');grips.push({tile:r.tile,holes,overlap});
    }
    window.humanBaseDiagnostics = { entries, grips, changed, outsideChanges };
    function parts(index,state={}){
        const result=[[index,32]], hair=tiles[state.hair||'HAIR_SHORT_BLACK'];
        check(typeof hair==='number','configured native hair exists');
        if(state.hairOnly){result.push([hair,32]);return result;}
        if(!state.bare){result.push([tiles.LEG_PANTS_BLUE,32],[state.robe?tiles.BODY_ROBE_NORMAL:tiles.BODY_PLATE,32],[hair,32]);
            if(state.helmet){const helm=tiles[typeof state.helmet==='string'?state.helmet:'HELM_NORMAL'];
                check(typeof helm==='number','configured native headwear exists');result.push([helm,32]);}
            result.push([tiles.HAND1_SHORT_SWORD_SLANT,32],[tiles.HAND2_BUCKLER,32]);}
        return result;
    }
    function draw(index,size,state={}){const c=canvas(size), renderer=new m['./cell_renderer'].DungeonCellRenderer();renderer.init(c);renderer.set_cell_size(size,size);
        const layers=parts(index,state), samples=[], drawImage=renderer.ctx.drawImage.bind(renderer.ctx), calls=[], drawPlayer=renderer.draw_player;
        renderer.ctx.drawImage=(...args)=>{samples.push(args[0]);drawImage(...args);};
        renderer.draw_player=function(i,x,y,ox,oy,ymax){calls.push({i,ymax,alpha:this.ctx.globalAlpha});return drawPlayer.apply(this,arguments);};
        renderer.do_render_cell(2,2,0,0,{x:2,y:2,mon:{id:77,name:'Fixture human'},t:{bg:{value:state.water?dungeon.DNGN_SHALLOW_WATER:dungeon.FLOOR_GREY_DIRT,WATER:Boolean(state.water)},
            fg:{value:tiles.MCACHE_START},doll:layers,flv:{f:dungeon.FLOOR_GREY_DIRT,s:0},trans:Boolean(state.trans)}});
        const passes=state.water?2:1;check(calls.length===layers.length*passes,'human doll layer count');
        for(let p=0;p<passes;p++)for(let n=0;n<layers.length;n++){const call=calls[p*layers.length+n];check(call.i===layers[n][0]&&call.ymax===32,'native body/garment/hair/helmet/gear order');
            const alpha = state.water ? (p ? (state.trans ? 0.1 : 0.3) : (state.trans ? 0.5 : 1)) : 1;
            check(Math.abs(call.alpha-alpha)<.001,'native human submersion alpha');}
        if(pack.illustrated())check(samples.includes(details.get(index)),'native renderer samples selected human detail');return c;}
    function portrait(index){const c=canvas(128), ctx=c.getContext('2d'), drawImage=ctx.drawImage.bind(ctx);let sampled=false;
        ctx.drawImage=(...args)=>{sampled ||= args[0]===details.get(index);drawImage(...args);};
        const layers=parts(index).map(([i,ymax])=>{const r=tiles.get_tile_info(i);return{texture:'player',sx:r.sx,sy:r.sy,w:r.ex-r.sx,h:r.ey-r.sy,ox:r.ox,oy:r.oy,ymax};});
        check(m['./native-tile-art'].draw(c,{layers})&&sampled,'composed portrait keeps selected human appearance');return c;}
    const mounted=window.creaturePortraitFixture, fresh=canvas(mounted.frame.querySelector('canvas').width);
    check(m['./native-tile-art'].draw(fresh,mounted.art),'fresh human portrait');const expected=pixels(fresh), current=pixels(mounted.frame.querySelector('canvas'));
    check(current.every((v,i)=>v===expected[i]),'deferred human portrait refresh');
    const main=document.createElement('main');document.body.prepend(main);main.innerHTML='<h1>Painted human appearances</h1>'
        +'<p>Six native appearance choices · actual doll layers · controlled renderer fixture</p><table><thead><tr><th>Appearance</th><th>Native + hair 128px</th>'
        +'<th>Painted + hair 128px</th><th>Base 128px</th><th>Plate + hair 96px</th><th>Robe 96px</th><th>Helmet 96px</th><th>Submerged 96px</th><th>Portrait 128px</th></tr></thead><tbody></tbody></table>';
    for(const e of entries){const row=document.createElement('tr'), label=document.createElement('th');label.textContent=e.label;row.append(label);main.querySelector('tbody').append(row);
        pack.select('classic');const native=draw(e.index,128,{hairOnly:true});pack.select('illustrated');
        for(const c of [native,draw(e.index,128,{hairOnly:true}),draw(e.index,128,{bare:true}),draw(e.index,96),draw(e.index,96,{robe:true}),
            draw(e.index,96,{helmet:true}),draw(e.index,96,{water:true}),portrait(e.index)]){const td=document.createElement('td');td.append(c);row.append(td);}
        draw(e.index,32,{bare:true});draw(e.index,96,{water:true,trans:true});}
    const headwearCases=[
        {label:'Short black',hair:'HAIR_SHORT_BLACK'}, {label:'Long black',hair:'HAIR_LONG_BLACK'},
        {label:'Feminine red',hair:'HAIR_FEM_RED'}, {label:'High tail',hair:'HAIR_HIGHTAIL'},
        {label:'Yellow ponytail',hair:'HAIR_PONYTAIL_YELLOW'}, {label:'Topknot',hair:'HAIR_TOPKNOT'},
        {label:'Ordinary hat',helmet:'HELM_HAT_NORMAL'}, {label:'Blue cap',helmet:'HELM_CAP_BLUE'},
        {label:'Open iron helm',helmet:'HELM_HELM_IRON'}, {label:'Closed grey helm',helmet:'HELM_FHELM_GRAY'},
        {label:'Grey hood',helmet:'HELM_HOOD_GRAY'}, {label:'Crown',helmet:'HELM_CROWN'}];
    const selectedHair=new Set((m['./environment-art'].hair?.entries||[]).flatMap(entry=>entry.names));
    const heading=document.createElement('h2');heading.textContent='Hair and headwear across all six identities';main.append(heading);
    const explanation=document.createElement('p');explanation.textContent='Each pair: Classic left, Illustrated right. Unselected headwear retains native art; native layer order is preserved.';main.append(explanation);
    const comparison=document.createElement('table'), head=document.createElement('tr');comparison.append(head);main.append(comparison);
    for(const label of ['Headwear',...entries.map(e=>e.label)]){const th=document.createElement('th');th.textContent=label;head.append(th);}
    for(const state of headwearCases){
        for(const symbol of [state.hair,state.helmet].filter(Boolean))check(Boolean(art.tile('player',tiles[symbol]))===selectedHair.has(symbol),'explicit hair selection and independent headwear: '+symbol);
        const row=document.createElement('tr'), title=document.createElement('th');title.textContent=state.label;row.append(title);comparison.append(row);
        for(const e of entries){const td=document.createElement('td');row.append(td);
            pack.select('classic');td.append(draw(e.index,80,state));pack.select('illustrated');td.append(draw(e.index,80,state));}
    }
    for(const name of ['BASE_ELF','BASE_DWARF','BASE_NAGA','BASE_DJINNI','BASE_TROLL'])check(!art.tile('player',tiles[name]),'independent player species: '+name);
    for(const e of entries){
        check(e.headWidth>=nativeHair.ex-nativeHair.sx,'painted head must fill native hair width: '+e.label);
        check(e.neckY>=hairBottom+.25,'lower face must extend below native hair: '+e.label);
    }
    for(const sex of [0,1]){check(entries[sex].faceBrightness>entries[4+sex].faceBrightness+10,'light/tan appearance contrast');
        check(entries[4+sex].faceBrightness>entries[2+sex].faceBrightness+20,'tan/deep-brown appearance contrast');}
    check(pixels(raw).every((v,i)=>v===original[i]),'native atlas immutable');pack.select('classic');check(!art.tile('player',tiles.BASE_HUMAN)&&art.image('player',raw)===raw,'Classic restoration');pack.select('illustrated');
    return{passed:true,nativeEngine:false,entries,grips,changed,outsideChanges,distinctAppearances:true,nativeLayerOrder:true,nativeSubmersion:true,
        nativeSourceImmutable:true,deferredPortraitRefresh:true,classicNative:true,
        headwearCases:headwearCases.map(state=>state.label),headwearIdentityPairs:headwearCases.length*entries.length};
};
