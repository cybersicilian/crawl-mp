/* Real WebGL output contract: palette art, lit geometry and glass share display-space haze. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{chromiumLaunchOptions}=require('./helpers/browser-launch.cjs');
const root=path.resolve(process.env.FIRST_PERSON_STATIC_ROOT||path.join(__dirname,'..'));
const output=process.env.FIRST_PERSON_PROOF_DIR;assert(output);fs.mkdirSync(output,{recursive:true});
(async()=>{
    const browser=await chromium.launch(chromiumLaunchOptions());
    try{
        const page=await browser.newPage();const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('http://mesh-look.test/**',route=>{
            const name=new URL(route.request().url()).pathname;
            if(name==='/')return route.fulfill({contentType:'text/html',body:'<canvas id="preview" width="128" height="128"></canvas><script src="/static/scripts/contrib/require.js"></script>'});
            const file=path.join(root,name.slice(1));
            return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404});
        });
        await page.goto('http://mesh-look.test/');
        const proof=await page.evaluate(()=>new Promise((resolve,reject)=>{
            require.config({baseUrl:'/static/scripts'});
            require(['mesh-renderer','mesh-geometry','mesh-shaders','mesh-look'],(render,geometry,shaders,look)=>{
                let painter;
                try{
                    const canvas=document.getElementById('preview'),gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true});
                    if(!gl)throw new Error('WebGL unavailable');
                    // Compile/link both relief and fallback paths on the real driver.
                    const variants=[];
                    for(const bump of [false,true]){
                        if(bump&&!gl.getExtension('OES_standard_derivatives'))continue;
                        const program=gl.createProgram(),objects=[];
                        for(const [kind,source]of [[gl.VERTEX_SHADER,shaders.vertex],[gl.FRAGMENT_SHADER,shaders.fragment(bump)]]){
                            const object=gl.createShader(kind);gl.shaderSource(object,source);gl.compileShader(object);
                            if(!gl.getShaderParameter(object,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(object));
                            gl.attachShader(program,object);objects.push(object);
                        }
                        gl.linkProgram(program);
                        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
                        objects.forEach(object=>gl.deleteShader(object));gl.deleteProgram(program);variants.push(bump);
                    }
                    const image=document.createElement('canvas');image.width=image.height=4;
                    const context=image.getContext('2d');context.fillStyle='#ad523b';context.fillRect(0,0,4,4);
                    painter=render.create(canvas);
                    const camera={x:0,y:0,height:1,angle:-Math.PI/2,pitch:0};
                    function sample(material,config,empty){
                        const mesh=geometry.create();
                        if(!empty)mesh.quad(Object.assign({image,pixelated:true},material),[[-20,-20,-20],[20,-20,-20],[20,20,-20],[-20,20,-20]]);
                        painter.paint({mesh,sprites:[],lights:[],shadows:false,look:config},camera);
                        const pixel=new Uint8Array(4);gl.readPixels(64,64,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
                        if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error after atmosphere draw');
                        return Array.from(pixel);
                    }
                    const haze={fogColor:[.18,.23,.29],fogDensity:1,fogStart:0};
                    const fog={background:sample({},haze,true),terrain:sample({},haze),
                        palette:sample({preservePalette:true},haze),
                        glass:sample({transmission:.8,opacity:.6},haze)};
                    const dark={fogDensity:0,exposure:.6},bright={fogDensity:0,exposure:2};
                    const exposure={terrainDark:sample({},dark),terrainBright:sample({},bright),
                        paletteDark:sample({preservePalette:true},dark),paletteBright:sample({preservePalette:true},bright)};
                    const defaults=look.resolve();
                    resolve({variants,fog,exposure,defaults});
                }catch(error){reject(error.stack);}finally{if(painter)painter.destroy();}
            },reject);
        }));
        assert.deepEqual(errors,[]);assert(proof.variants.includes(false));
        for(const pixels of Object.values(proof.fog))for(let channel=0;channel<3;channel++)
            assert(Math.abs(pixels[channel]-proof.fog.background[channel])<=1,'All materials converge to the same displayed fog color');
        assert(proof.exposure.terrainBright[0]>proof.exposure.terrainDark[0]+15,'Exposure affects lit geometry');
        assert.deepEqual(proof.exposure.paletteBright,proof.exposure.paletteDark,'Native art bypasses tone mapping');
        fs.writeFileSync(path.join(output,'mesh-look-proof.json'),JSON.stringify(proof,null,2)+'\n');
        console.log(JSON.stringify(proof));
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
