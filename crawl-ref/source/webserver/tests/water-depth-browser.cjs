/* Actual WebGL basin/transitions with canonical native floor pixels; no account/game writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{chromiumLaunchOptions}=require('./helpers/browser-launch.cjs');
const root=path.resolve(process.env.FIRST_PERSON_STATIC_ROOT||path.join(__dirname,'..'));
const output=process.env.FIRST_PERSON_PROOF_DIR;assert(output);fs.mkdirSync(output,{recursive:true});
(async()=>{
    const browser=await chromium.launch(chromiumLaunchOptions());
    try{
        const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('http://water-depth.test/**',route=>{
            const name=new URL(route.request().url()).pathname;
            if(name==='/')return route.fulfill({contentType:'text/html',body:'<style>body{background:#0b1117;color:#e9dfc7;font:16px system-ui;margin:24px}h1{font:26px Georgia}canvas{border:1px solid #645a41}</style><h1>Native materials · recessed water basins</h1><canvas id="preview" width="940" height="620"></canvas><img id="floor" hidden src="/game_data/static/floor.png"><script src="/static/scripts/contrib/require.js"></script>'});
            const file=path.join(root,name.slice(1));return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404});
        });
        await page.goto('http://water-depth.test/');
        const proof=await page.evaluate(()=>new Promise((resolve,reject)=>{
            require.config({baseUrl:'/static/scripts'});
            require(['mesh-renderer','mesh-geometry','grid-water','terrain-surface','/game_data/static/tileinfo-floor.js'],
            (render,geometry,water,terrain,tiles)=>{(async()=>{
                const atlas=document.getElementById('floor');await atlas.decode();
                function texture(index){
                    const info=tiles.get_tile_info(index),image=document.createElement('canvas');image.width=image.height=64;
                    const ctx=image.getContext('2d');ctx.imageSmoothingEnabled=false;
                    ctx.drawImage(atlas,info.sx,info.sy,info.ex-info.sx,info.ey-info.sy,0,0,64,64);
                    return {image,pixelated:true,roughness:.9,key:index,rect:{x:0,y:0,w:64,h:64}};
                }
                const stone=texture(tiles.FLOOR_GREY_DIRT),moss=texture(tiles.FLOOR_MOSS),nativeWater=texture(tiles.DNGN_SHALLOW_WATER);
                const blend=terrain.create({cell:64,period:1,maxScale:1}),neighbors=terrain.offsets.map(offset=>offset.x<0?moss:stone);
                const feathered=blend.tile(stone,neighbors,3,3,64);if(!feathered)throw new Error('Canvas material blending failed');
                const pixels=feathered.getContext('2d').getImageData(0,0,64,64).data;
                const s=stone.image.getContext('2d').getImageData(0,0,64,64).data;
                let blendedPixels=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-s[i])+Math.abs(pixels[i+1]-s[i+1])+Math.abs(pixels[i+2]-s[i+2])>5)blendedPixels++;
                const cells=new Map();
                for(let z=0;z<6;z++)for(let x=0;x<8;x++){
                    const wet=x>=2&&x<=5&&z>=1&&z<=4,deep=x>=4;
                    cells.set(x+','+z,{x,y:z,floorMaterial:wet?Object.assign({},nativeWater,{opacity:deep?.79:.46,castShadow:false,
                        fluid:{kind:'water',depth:deep?'deep':'shallow',strength:1}}):x<2?moss:stone});
                }
                for(const cell of cells.values())if(cell.floorMaterial.fluid){
                    const own=water.dimensions(cell.floorMaterial.fluid);
                    cell.floorMaterial.fluidDepthEdges=[[0,-1],[1,0],[0,1],[-1,0]].map(o=>{
                        const other=cells.get((cell.x+o[0])+','+(cell.y+o[1]));
                        return water.dimensions(other&&other.floorMaterial.fluid)?.depth||own.depth;
                    });
                }
                const canvas=document.getElementById('preview'),painter=render.create(canvas),camera={x:3.5,y:6.5,height:1.5,angle:-Math.PI/2,pitch:-.38};
                function scene(opaque){
                    const mesh=geometry.create(),models=[];
                    for(const cell of cells.values()){
                        if(cell.floorMaterial.fluid){
                            const surface=opaque?Object.assign({},cell.floorMaterial,{opacity:1}):cell.floorMaterial;
                            models.push(water.build(mesh,{x:cell.x,z:cell.y,surface,bed:stone,bank:stone,dark:stone,cell,
                                neighbors:[[0,-1],[1,0],[0,1],[-1,0]].map(o=>cells.get((cell.x+o[0])+','+(cell.y+o[1])))}));
                        }else mesh.floor(cell.x===2?Object.assign({},stone,{image:feathered}):cell.floorMaterial,cell.x,cell.y,0);
                    }
                    return {mesh,sprites:[],lights:[{kind:'torch',position:[1,2,2],color:[1,.7,.4],strength:2}],shadows:false,phase:0,models};
                }
                const visible=scene(false);painter.paint(visible,camera);const before=painter.pixels();
                window.depthCapture=canvas.toDataURL();painter.paint(scene(true),camera);const opaque=painter.pixels();
                let transparentPixels=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-opaque[i])+Math.abs(before[i+1]-opaque[i+1])+Math.abs(before[i+2]-opaque[i+2])>8)transparentPixels++;
                painter.paint(visible,camera);const staticPixels=painter.pixels();
                const stable=before.every((value,index)=>value===staticPixels[index]);
                const gl=canvas.getContext('webgl'),glError=gl.getError();
                resolve({models:visible.models,blendedPixels,transparentPixels,stable,glError,cache:blend.cacheStats()});painter.destroy();
            })().catch(error=>reject(error.stack));},reject);
        }));
        assert.deepEqual(errors,[]);assert(proof.models.some(model=>model.depth>1));assert(proof.models.some(model=>model.depth<.5));
        assert(proof.models.some(model=>model.steps>0));assert(proof.transparentPixels>1000);assert(proof.blendedPixels>100);
        assert(proof.stable);assert.equal(proof.glError,0);
        const capture=await page.evaluate(()=>window.depthCapture);fs.writeFileSync(path.join(output,'water-depth.png'),Buffer.from(capture.split(',')[1],'base64'));
        fs.writeFileSync(path.join(output,'water-depth-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
