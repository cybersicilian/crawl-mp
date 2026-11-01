/* Isolated native hair candidate: actual layered renderer, source and mask checks. */
module.exports = function hairChecks() {
    const m=window.benchModules, art=m['./tile-art-direction'], pack=m['texture-pack'];
    const tiles=m['./tileinfo-player'], dngn=m['./tileinfo-dngn'], catalog=m['./environment-art'].hair;
    const raw=document.getElementById('player'), sheet=document.getElementById(catalog.id), errors=[];
    const check=(value,message)=>{if(!value)errors.push(message);};
    const canvas=(w,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const pixels=image=>{const c=canvas(image.naturalWidth||image.width,image.naturalHeight||image.height),ctx=c.getContext('2d');
        ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const native=pixels(raw), source=pixels(sheet), entries=[], bodies=m['./environment-art'].humanBases.entries;
    const details=new Map(), regions=m['./environment-sprites'].player.filter(r=>r.sheet===catalog.id);
    check(regions.length===6,'exact six native hair opt-ins');
    for(const entry of catalog.entries){
        const index=tiles[entry.names[0]], info=tiles.get_tile_info(index), detail=art.tile('player',index,8), data=pixels(detail);
        details.set(index,detail);check(detail.width===(info.ex-info.sx)*8,'eightfold hair detail');
        const rect=entry.sprite;let left=rect.w,top=rect.h,right=0,bottom=0;
        for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++)if(source[((rect.y+y)*catalog.width+rect.x+x)*4+3]>12){
            left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
        const gutter=Math.min(left,top,rect.w-right,rect.h-bottom);check(gutter>=8,'source gutter: '+entry.label);
        let holes=0, nativeOpaque=0, nativeBlue=0, paintedOpaque=0, blue=0, red=0, golden=0, gray=0;
        for(let y=0;y<info.ey-info.sy;y++)for(let x=0;x<info.ex-info.sx;x++){
            const at=((info.sy+y)*raw.naturalWidth+info.sx+x)*4, empty=native[at+3]<=12;
            if(!empty&&native[at+2]>native[at]*1.3&&native[at+2]>native[at+1]*1.05)nativeBlue++;
            if(empty)holes++;else nativeOpaque++;
            for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
                const n=((y*8+dy)*detail.width+x*8+dx)*4;
                if(empty)check(data[n+3]===0,'native face/silhouette opening: '+entry.label);
                if(data[n+3]<128)continue;
                paintedOpaque++;const r=data[n],g=data[n+1],b=data[n+2];
                if(b>r*1.3&&b>g*1.05)blue++;
                if(r>g*1.6&&r>b*2)red++;
                if(r>g*.9&&g>b*1.45&&r>100)golden++;
                if(Math.max(r,g,b)-Math.min(r,g,b)<35)gray++;
            }
        }
        check(holes>0,'native transparent openings exercised');
        check(paintedOpaque>nativeOpaque*64*.3,'retained painted hair mass: '+entry.label);
        if(entry.names[0].includes('BLACK'))check(gray>paintedOpaque*.8,'neutral black/gray identity: '+entry.label);
        if(entry.names[0]==='HAIR_FEM_RED')check(red>paintedOpaque*.5,'copper-red identity');
        if(['HAIR_HIGHTAIL','HAIR_PONYTAIL_YELLOW','HAIR_TOPKNOT'].includes(entry.names[0]))check(golden>paintedOpaque*.5,'blond identity: '+entry.label);
        if(nativeBlue)check(blue>8,'native blue tie: '+entry.label);
        if(entry.names[0]==='HAIR_TOPKNOT')check(red>8,'red topknot tie');
        entries.push({label:entry.label,gutter,holes,nativeOpaque,nativeBlue,paintedOpaque,blue,red,golden,gray});
    }
    const main=document.createElement('main');document.body.prepend(main);
    main.innerHTML='<h1>Painted hair composition candidate</h1><p>Each pair uses the same painted body: native hair at left, candidate hair at right. Isolated source validation; not selected or deployed.</p>'
        +'<table><thead><tr><th>Hair style</th>'+bodies.map(e=>'<th>'+e.label+'</th>').join('')+'</tr></thead><tbody></tbody></table>';
    function draw(body,hair,nativeHair,state={}){
        const c=canvas(128), renderer=new m['./cell_renderer'].DungeonCellRenderer();renderer.native_art=Boolean(state.native);renderer.init(c);renderer.set_cell_size(128,128);
        const layers=[[body,32],[tiles.LEG_PANTS_BLUE,32],[tiles.BODY_PLATE,32],[hair,32]];
        if(state.helmet)layers.push([tiles[state.helmet],32]);
        layers.push([tiles.HAND1_SHORT_SWORD_SLANT,32],[tiles.HAND2_BUCKLER,32]);
        const calls=[], samples=[], drawPlayer=renderer.draw_player, drawImage=renderer.ctx.drawImage.bind(renderer.ctx);
        renderer.ctx.drawImage=(...args)=>{samples.push(args[0]);drawImage(...args);};
        renderer.draw_player=function(index){calls.push(index);const before=this.native_art;
            if(index===hair&&nativeHair)this.native_art=true;
            try{return drawPlayer.apply(this,arguments);}finally{this.native_art=before;}};
        renderer.do_render_cell(2,2,0,0,{x:2,y:2,mon:{id:119,name:'Hair fixture'},t:{
            bg:{value:state.water?dngn.DNGN_SHALLOW_WATER:dngn.FLOOR_GREY_DIRT,WATER:Boolean(state.water)},
            fg:{value:tiles.MCACHE_START},doll:layers,flv:{f:dngn.FLOOR_GREY_DIRT,s:0},trans:Boolean(state.trans)}});
        const passes=state.water?2:1;check(calls.length===layers.length*passes,'hair layer pass count');
        for(let p=0;p<passes;p++)for(let n=0;n<layers.length;n++)check(calls[p*layers.length+n]===layers[n][0],'native hair/helmet/gear order');
        if(state.native)check(samples.includes(raw)&&!samples.includes(art.tile('player',body,4))
            &&!samples.includes(art.tile('player',hair,4)),'native-only renderer bypasses body and hair artwork');
        else{
            check(samples.includes(art.tile('player',body,4)),'painted body retained');
            if(nativeHair)check(samples.includes(raw),'native comparison hair retained');
            else check(samples.includes(art.tile('player',hair,4)),'candidate hair sampled');
        }
        return c;
    }
    draw(tiles[bodies[0].names[0]],tiles[catalog.entries[0].names[0]],false,{native:true});
    const mounted=window.creaturePortraitFixture, mountedCanvas=mounted.frame.querySelector('canvas');
    const fresh=canvas(mountedCanvas.width,mountedCanvas.height);
    check(m['./native-tile-art'].draw(fresh,mounted.art),'hair portrait draws');
    const freshPortrait=pixels(fresh), currentPortrait=pixels(mountedCanvas);
    check(freshPortrait.every((value,index)=>value===currentPortrait[index]),'deferred hair portrait refresh');
    let pairs=0;
    for(const entry of catalog.entries){const hair=tiles[entry.names[0]],row=document.createElement('tr'),name=document.createElement('th');
        name.textContent=entry.label;row.append(name);main.querySelector('tbody').append(row);
        for(const body of bodies){const id=tiles[body.names[0]],td=document.createElement('td');
            td.append(draw(id,hair,true),draw(id,hair,false));row.append(td);pairs++;
            draw(id,hair,false,{helmet:'HELM_HELM_IRON'});draw(id,hair,false,{helmet:'HELM_FHELM_GRAY'});
            draw(id,hair,false,{water:true,trans:true});}
    }
    for(const name of ['HAIR_SHORT_RED','HAIR_LONG_WHITE','HAIR_PONYTAIL_BLACK','HELM_HAT_NORMAL','HELM_CROWN'])
        if(Number.isInteger(tiles[name]))check(!art.tile('player',tiles[name]),'unselected headwear stays independent: '+name);
    const first=tiles[catalog.entries[0].names[0]], savedId=sheet.id;
    sheet.id+='_held';check(!art.tile('player',first),'missing hair sheet fallback');sheet.id=savedId;
    pack.select('classic');check(!art.tile('player',first),'Classic keeps native hair');pack.select('illustrated');
    check(pixels(raw).every((v,i)=>v===native[i]),'native atlas unchanged');
    const report={passed:errors.length===0,nativeEngine:false,entries,humanHairPairs:pairs,
        nativeOpeningsPreserved:true,nativeLayerOrder:true,nativeBypass:true,deferredPortraitRefresh:true,classicFallback:true,errors};
    window.hairDiagnostics=report;
    if(errors.length)throw new Error(Array.from(new Set(errors)).join('; '));
    return report;
};
