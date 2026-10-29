/* Full client and real native games. Only an isolated localhost QA server is allowed. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {webkit, chromium} = require('playwright');
const repository = path.resolve(__dirname, '../../..');
const {signInTestAccount} = require(path.join(repository,
    'crawl-ref/source/webserver/tests/helpers/test-account.cjs'));
const url = process.env.ELDRITCH_QA_URL;
assert.equal(new URL(url).hostname, '127.0.0.1');
const out = process.env.ELDRITCH_PROOF;
fs.mkdirSync(out, {recursive:true});
const engineName = process.env.ELDRITCH_BROWSER || 'webkit';
const engine = engineName === 'webkit' ? webkit : chromium;
const executablePath = engineName === 'webkit'
    ? '/Users/iancaltabiano/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'
    : '/Users/iancaltabiano/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const proof = {url, engine:engineName, atlasFault:!!process.env.ELDRITCH_ATLAS_FAULT, pageErrors:[], consoleErrors:[], requestFailures:[], scenes:[]};
const send = (page, msg, data={}) => page.evaluate(({msg,data}) =>
    require('comm').send_message(msg,data), {msg,data});
const own = page => page.evaluate(() => window.crawl_party.state.members[0]);
async function ready(page) {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(n=>n.endsWith('/workflow-actions'));
        return name && require(name).ready() && !require('jquery')('#loader').is(':visible');
    },null,{timeout:120000});
    await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function scene(page, label) {
    const data = await page.evaluate(() => {
        const mod = suffix => require(Object.keys(require.s.contexts._.defined).find(n=>n.endsWith('/'+suffix)));
        const view = mod('dungeon_renderer'), map = mod('map_knowledge'), tiles = mod('tileinfo-dngn');
        const context = view.element.getContext('2d'), cells=[];
        for(let y=view.view.y;y<view.view.y+view.rows;y++)
            for(let x=view.view.x;x<view.view.x+view.cols;x++) {
                const cell=map.get(x,y);
                if(!cell.t||!map.visible(cell))continue;
                const rect=view.canvas_coords(x,y), pixels=context.getImageData(rect.x,rect.y,rect.width,rect.height).data;
                let painted=0;
                for(let p=0;p<pixels.length;p+=4)if(pixels[p]+pixels[p+1]+pixels[p+2]>12)painted++;
                cells.push({x,y,g:cell.g,bg:cell.t.bg.value,fg:cell.t.fg.value,
                    doll:cell.t.doll,painted,pixels:pixels.length/4});
            }
        return {hero:window.crawl_party.state.members[0],
            atlases:['floor','wall','feat','main','player','gui','icons'].map(id=>{
                const image=document.getElementById(id);
                return {id,complete:image?.complete,width:image?.naturalWidth,height:image?.naturalHeight,src:image?.src};
            }), actor:cells.find(c=>c.g==='@'),
            floors:cells.filter(c=>c.bg>tiles.DNGN_ERROR&&c.bg<tiles.FLOOR_MAX&&!c.fg),
            zoom:document.getElementById('hud_zoom_status')?.textContent,
            viewport:{x:view.view.x,y:view.view.y,cols:view.cols,rows:view.rows,
                cell:view.cell_width,ratio:devicePixelRatio},
            packetAtlasStates:window.renderProbeAtlasStates};
    });
    await page.screenshot({path:path.join(out,label+'.png')});
    fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(data,null,2)+'\n');
    const summary = {label,species:data.hero.species,turns:data.hero.turns,position:data.hero.pos,
        actorPixels:data.actor?.painted,blankFloors:data.floors.filter(c=>!c.painted).length,
        floors:data.floors.length,atlases:data.atlases.map(a=>({id:a.id,width:a.width})),zoom:data.zoom};
    proof.scenes.push(summary);console.log(JSON.stringify(summary));
    return data;
}
function validate(data, species) {
    assert.equal(data.hero.species,species);
    assert(data.atlases.every(a=>a.complete&&a.width>0),'Every actual atlas image is ready');
    assert(data.actor&&data.actor.painted>100,'The actual game canvas contains the player');
    assert(data.floors.length>0&&data.floors.every(c=>c.painted>0),'Visible floor tiles are painted');
}
(async()=>{
    const server=await engine.launchServer({headless:true,executablePath});
    fs.writeFileSync(path.join(out,'browser-process.json'),JSON.stringify({pid:server.process().pid})+'\n');
    const browser=await engine.connect({wsEndpoint:server.wsEndpoint()});
    let page;
    try {
        const context=await browser.newContext({viewport:{width:1711,height:877},deviceScaleFactor:2});
        if(process.env.ELDRITCH_ATLAS_FAULT)await context.route(/\/(floor|main|player)\.png(?:\?|$)/, async route=>{
            const requestURL=new URL(route.request().url());
            if(!requestURL.searchParams.has('asset_retry')) {
                proof.injectedFaults=proof.injectedFaults||[];
                proof.injectedFaults.push(requestURL.pathname);
                await route.fulfill({status:503,body:'Temporary QA atlas failure'});
            } else await route.continue();
        });
        await context.addInitScript(()=>localStorage.setItem('dcss.viewport.zoom.v1','1.5'));
        page=await context.newPage();page.setDefaultTimeout(30000);
        proof.assetRequests=[];proof.loadedCode=[];
        page.on('response',async response=>{
            if(/\/(floor|main|player)\.png(?:\?|$)/.test(response.url()))
                proof.assetRequests.push({url:response.url(),status:response.status()});
            if(/\/(asset-readiness|client-transport|game-loading|loading-ui)\.js(?:\?|$)/.test(response.url()))
                proof.loadedCode.push({url:response.url(),sha256:crypto.createHash('sha256').update(await response.body()).digest('hex')});
        });
        page.on('pageerror',error=>proof.pageErrors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')proof.consoleErrors.push(message.text());});
        page.on('requestfailed',request=>proof.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
        await page.goto(url);
        await signInTestAccount(page,'ER'+crypto.randomBytes(4).toString('hex'),crypto.randomBytes(20).toString('hex'));
        console.log('Signed in to isolated QA account');
        await page.evaluate(()=>{
            window.renderProbeAtlasStates=[];
            window.renderProbeMessages={};window.renderProbeBarriers=[];
            const client=require('client');
            for(const key of ['inhibit_messages','uninhibit_messages']) {
                const original=client[key];
                client[key]=function(){window.renderProbeBarriers.push({key,at:performance.now()});
                    return original.apply(this,arguments);};
            }
            const comm=require('comm'), original=comm.handle_message;
            comm.handle_message=function(packet){
                window.renderProbeMessages[packet.msg]=(window.renderProbeMessages[packet.msg]||0)+1;
                if(packet.msg==='map')window.renderProbeAtlasStates.push({at:performance.now(),
                    images:['floor','main','player','feat'].map(id=>{
                        const image=document.getElementById(id);
                        return {id,complete:image?.complete,width:image?.naturalWidth};
                    })});
                return original.apply(this,arguments);
            };
        });
        const speciesList=process.env.ELDRITCH_SPECIES?.split(',')||['Eldritch','Human','Eldritch'];
        for(let index=0;index<speciesList.length;index++) {
            const species=speciesList[index], prefix=index+'-'+species;
            if(index) {
                await page.locator('#lobby_navigation a.lobby-chapter-link[data-workspace-target="play"]').click();
                await page.locator('#btn_leave_party_room').click();
            }
            await page.locator('#lobby_home [data-lobby-create]').click();
            await page.locator('#party_slot_species_0').selectOption(species);
            await page.locator('#party_slot_job_0').selectOption('Fighter');
            await page.locator('#party_slot_weapon_0').selectOption('war axe');
            for(const slot of [1,2,3])
                await page.locator(`.party-slot-box[data-slot="${slot}"] [data-mode="closed"]`).click();
            await send(page,'party_room_settings',{seed:'10219438576718897615'});
            await page.locator('#btn_launch_party_room').click();
            console.log('Launched '+species);
            await page.waitForFunction(species=>window.crawl_party?.state?.members?.length===1
                &&window.crawl_party.state.members[0].species===species,species,{timeout:60000});
            console.log('Native '+species+' state received');
            await ready(page);
            validate(await scene(page,prefix+'-start'),species);
            for(const direction of ['south','east']) {
                const before=await own(page);
                await page.locator(`#direction_pad [data-direction="${direction}"]`).click();
                await page.waitForFunction(turns=>window.crawl_party.state.members[0].turns>turns,before.turns);
                await ready(page);
                validate(await scene(page,prefix+'-'+direction),species);
            }
            const before=await own(page);
            await send(page,'library_save',{exit:true});
            await page.locator('#lobby_navigation').waitFor({state:'visible'});
            const record=await page.locator('#game_library_panel [data-library-load]').first().getAttribute('data-library-load');
            assert(record,'The saved native expedition has a load action');
            await send(page,'library_load',{id:record});
            await page.locator('#lobby_navigation').waitFor({state:'hidden'});
            await ready(page);
            const resumed=await scene(page,prefix+'-resumed');validate(resumed,species);
            assert.equal(resumed.hero.turns,before.turns);
            for(const key of ['species','hp','mp'])assert.equal(resumed.hero[key],before[key]);
            await send(page,'library_save',{exit:true});
            await page.locator('#lobby_navigation').waitFor({state:'visible'});
        }
        assert.deepEqual(proof.pageErrors,[]);
        proof.unexpectedErrors=proof.consoleErrors.filter(message=>
            !/^Options not set, wanted option: tile_(realtime_anim|web_mouse_control)$/.test(message)
            &&!(proof.atlasFault&&message.includes('503 (Service Unavailable)')));
        assert.deepEqual(proof.unexpectedErrors,[]);
        proof.passed=true;
    } catch(error) {
        proof.failure=error.stack;
        if(page) {
            proof.stalledState=await page.evaluate(()=>({
                gameLoading:window.game_loading,party:window.crawl_party?.state,
                problem:require('game-loading').problem?.(),blocking:require('game-loading').blocking(),
                messages:window.renderProbeMessages,barriers:window.renderProbeBarriers,
                images:[...document.querySelectorAll('#game img')].map(image=>({id:image.id,src:image.src,
                    complete:image.complete,width:image.naturalWidth})),
                modules:Object.keys(require.s.contexts._.defined)
            })).catch(error=>({error:String(error)}));
            await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
            proof.body=await page.locator('body').innerText().catch(()=>null);
        }
        throw error;
    } finally {
        fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(proof,null,2)+'\n');
        if(page)await send(page,'library_save',{exit:true}).catch(()=>{});
        await browser.close();await server.close();
        fs.writeFileSync(path.join(out,'browser-closure.json'),JSON.stringify({pid:server.process().pid,
            exitCode:server.process().exitCode,signalCode:server.process().signalCode})+'\n');
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
