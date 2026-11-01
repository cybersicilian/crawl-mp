/* Real source fidelity at large backing sizes, with native alpha and bypass contracts. */
module.exports = async function spriteResolutionChecks() {
    const m=window.benchModules, art=m['./tile-art-direction'], pack=m['texture-pack'];
    const tiles=m['./tileinfo-player'], dungeon=m['./tileinfo-dngn'], catalog=m['./environment-art'].humanBases;
    const raw=document.getElementById('player'), ratio=window.devicePixelRatio||1;
    function check(value,message){if(!value)throw new Error(message);}
    function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
    function pixels(image){const c=canvas(image.naturalWidth||image.width,image.naturalHeight||image.height),ctx=c.getContext('2d');
        ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
    const original=pixels(raw);
    // A known high-frequency input demonstrates actual retained source pixels, not just a larger canvas.
    const pattern=canvas(256),pctx=pattern.getContext('2d');
    for(let x=0;x<256;x++){pctx.fillStyle=x%2?'white':'black';pctx.fillRect(x,0,1,256);}
    const source=new Image();source.src=pattern.toDataURL();await source.decode();
    const engine=m['atlas-sprites'].create(),region={x:0,y:0,w:32,h:32,sprite:{x:0,y:0,w:256,h:256}};
    const four=engine.tile(source,region,null,4),eight=engine.tile(source,region,null,8),expected=pixels(pattern),actual=pixels(eight);
    check(four.width===128&&eight.width===256,'bounded four/eight resolution');
    check(actual.every((v,i)=>v===expected[i]),'eightfold source retains the exact known source pattern');
    const enlarged=canvas(256),ctx=enlarged.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.drawImage(four,0,0,256,256);
    const old=pixels(enlarged);let recovered=0;for(let i=0;i<actual.length;i+=4)if(actual[i]!==old[i])recovered++;
    check(recovered>10000,'authored high-frequency pixels survive beyond the fourfold cap');
    check(engine.tile(source,region,null,4)===four,'default and large cache entries remain independent');
    const entries=[],main=document.createElement('main');document.body.prepend(main);
    main.innerHTML='<h1>Large-zoom Illustrated detail</h1><p>Real body layers at DPR '+ratio+'; the original atlas and native-only rendering stay intact.</p>'
        +'<table><thead><tr><th>Appearance</th><th>4× reference</th><th>Adaptive 8×</th><th>Classic</th><th>Native-only path</th></tr></thead><tbody></tbody></table>';
    const requestTile=art.tile;
    const gear=['BODY_PLATE','HAND1_SHORT_SWORD_SLANT','HAND2_BUCKLER'];
    if(m['./environment-art'].hair?.entries.some(entry=>entry.names.includes('HAIR_SHORT_BLACK')))gear.push('HAIR_SHORT_BLACK');
    function draw(index,cssSize,legacy,native){const c=canvas(cssSize*ratio);c.style.width=cssSize+'px';c.style.height=cssSize+'px';
        const renderer=new m['./cell_renderer'].DungeonCellRenderer();renderer.native_art=Boolean(native);renderer.init(c);renderer.set_cell_size(cssSize,cssSize);
        const samples=[],drawImage=renderer.ctx.drawImage.bind(renderer.ctx);renderer.ctx.drawImage=(...args)=>{samples.push(args[0]);drawImage(...args);};
        if(legacy)art.tile=(id,tile)=>requestTile(id,tile,4);
        try{renderer.do_render_cell(2,2,0,0,{x:2,y:2,mon:{id:81,name:'Resolution fixture'},t:{
            bg:{value:dungeon.FLOOR_GREY_DIRT},fg:{value:tiles.MCACHE_START},doll:[index,tiles.LEG_PANTS_BLUE,tiles.BODY_PLATE,tiles.HAIR_SHORT_BLACK,tiles.HAND1_SHORT_SWORD_SLANT,tiles.HAND2_BUCKLER].map(i=>[i,32]),flv:{f:dungeon.FLOOR_GREY_DIRT,s:0}}});}
        finally{art.tile=requestTile;}
        return{canvas:c,samples};}
    for(const entry of catalog.entries){const index=tiles[entry.names[0]],info=tiles.get_tile_info(index);
        pack.select('illustrated');const normal=requestTile('player',index,4),large=requestTile('player',index,6);
        check(normal.width===(info.ex-info.sx)*4&&large.width===(info.ex-info.sx)*8,'actual body resolution follows requested backing scale');
        const reference=draw(index,96,true,false),adaptive=draw(index,96,false,false);
        check(reference.samples.includes(normal)&&adaptive.samples.includes(large),'actual renderer chooses source for DPR/zoom');
        for(const name of gear){const detail=requestTile('player',tiles[name],6);
            check(detail&&adaptive.samples.includes(detail),'composed gear uses high-resolution source: '+name);}
        const small=draw(index,32,false,false);check(small.samples.includes(normal),'normal-size source remains fourfold after a large draw');
        const data=pixels(large),nativePixels=original;let holes=0;
        for(let y=16;y<20;y++)for(let x=0;x<info.ex-info.sx;x++){
            const ny=y-info.oy;if(nativePixels[((info.sy+ny)*raw.naturalWidth+info.sx+x)*4+3]>12)continue;
            for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++)check(data[((ny*8+dy)*large.width+x*8+dx)*4+3]===0,'native grip openings at eightfold resolution');holes++;}
        check(holes>0,'real native attachment gaps exercised');
        pack.select('classic');const classic=draw(index,96,false,false);check(classic.samples.includes(raw)&&!requestTile('player',index,8),'Classic retains native atlas');
        pack.select('illustrated');const native=draw(index,96,false,true);check(native.samples.includes(raw)&&!native.samples.includes(large),'native-only path bypasses Illustrated detail');
        const row=document.createElement('tr'),name=document.createElement('th');name.textContent=entry.label;row.append(name);main.querySelector('tbody').append(row);
        for(const c of [reference.canvas,adaptive.canvas,classic.canvas,native.canvas]){const td=document.createElement('td');td.append(c);row.append(td);}
        entries.push({label:entry.label,defaultWidth:normal.width,largeWidth:large.width,nativeGripHoles:holes});
    }
    const caption=document.createElement('p');caption.textContent='Known source pattern: 4× sample enlarged at left, exact 8× sample at right.';main.append(caption);
    for(const c of [enlarged,eight]){c.style.width='128px';c.style.height='128px';main.append(c);}
    check(pixels(raw).every((v,i)=>v===original[i]),'original native atlas pixels remain immutable');
    pack.select('illustrated');
    return{passed:true,nativeEngine:false,density:ratio,recoveredPatternPixels:recovered,exactHighResolutionPattern:true,
        nativeAtlasImmutable:true,nativeBypass:true,classicNative:true,defaultFourfoldPreserved:true,entries};
};
