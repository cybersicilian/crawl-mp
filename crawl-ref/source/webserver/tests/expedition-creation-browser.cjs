/* Real creation and lobby modules; isolated transport, no accounts or native games. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{chromiumLaunchOptions}=require('./helpers/browser-launch.cjs');
const root=path.resolve(__dirname,'..'),output=process.env.FIRST_PERSON_PROOF_DIR;
assert(output);fs.mkdirSync(output,{recursive:true});
function setup(){
    window.fixture={sent:[],room:null,errors:[]};
    require.config({baseUrl:'/static/scripts',paths:{jquery:'contrib/jquery'}});
    define('comm',[],()=>({register_handlers(){},send_message(type,payload){fixture.sent.push({type,payload});return true;}}));
    define('hero-role',[],()=>({decorate(){}}));
    define('party-roster-strip',[],()=>({init(){}}));
    define('client-staging-data',[],()=>({DCSS_SPECIES:[],DCSS_BACKGROUNDS:[]}));
    define('character-guide',[],()=>({init(){},refresh(){}}));
    define('client-staging-weapons',[],()=>({create:()=>'<select class="party-slot-weapon"></select>'}));
    define('client-staging-traits',[],()=>({create:()=>'<select class="party-slot-trait"><option value="none">None</option></select>'}));
    define('character-builder',[],()=>({identity:()=>'',refresh(){}}));
    define('party-composition',[],()=>({init(){}}));
    define('client-staging-modifiers',[],()=>({create:()=>''}));
    require(['lobby-overview','client-staging-controls','party-lobby-tools'],(overview,controls,tools)=>{
        try{
            overview.init(document.getElementById('lobby_body'));
            for(let i=0;i<20;i++)overview.refresh();
            controls({find_my_party_room:()=>fixture.room},{current_user:'Host'}).init_party_staging_ui();
            fixture.render=room=>{fixture.room=room;document.getElementById('lobby').classList.toggle('has-party-room',Boolean(room));document.getElementById('lobby_home').hidden=Boolean(room);tools.render(room,'Host');};
            document.querySelector('[data-lobby-create]').addEventListener('click',()=>document.getElementById('btn_create_party_room').click());
            fixture.ready=true;
        }catch(error){fixture.errors.push(error.stack);}
    });
}
const styles=Array.from(new Set(Array.from(fs.readFileSync(path.join(root,'templates/client.html'),'utf8').matchAll(/static_url\(["']([^"']+\.css)["']\)/g),match=>match[1])));
const html='<!doctype html><meta charset="utf-8">'+styles.map(name=>'<link rel="stylesheet" href="/static/'+name+'">').join('')
    +'<style>body{margin:20px}#lobby{display:block;max-width:1000px;margin:auto}.party-slot-box,.party-setup-tools{display:none}#party_room_view{margin-top:30px}</style>'
    +'<main id="lobby" class="has-chapter-index"><div id="lobby_body"><section id="party_lobby_panel"><div id="party_room_view"><div class="party-room-banner">Current expedition</div></div>'
    +'<div class="party-setup-tools"></div><div id="party_slots_grid"></div><button id="btn_create_party_room">Create expedition</button>'
    +'<button id="btn_create_party_room_empty">Create first expedition</button><button id="btn_toggle_party_ff">Friendly fire</button></section>'
    +'<section id="game_library_panel"></section><section id="play_now" hidden><a href="#play-tut-web-trunk">Tutorial</a></section></div></main><script src="/static/scripts/contrib/require.js"></script><script>('+setup.toString()+')()</script>';
(async()=>{
    const browser=await chromium.launch(chromiumLaunchOptions());
    try{
        const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.stack));
        await page.route('http://creation.test/**',route=>{
            const name=new URL(route.request().url()).pathname;
            if(name==='/')return route.fulfill({contentType:'text/html',body:html});
            const file=path.join(root,name.slice(1));
            return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:name});
        });
        await page.goto('http://creation.test/');await page.waitForFunction(()=>fixture.ready||fixture.errors.length);
        assert.deepEqual(await page.evaluate(()=>fixture.errors),[]);
        const choice=page.locator('#lobby_creation_presentation');assert(await choice.getByRole('radio',{name:'Overhead view'}).isChecked());
        assert.match(await page.locator('.lobby-home-hint').textContent(),/View is fixed/);
        await choice.getByText('3D',{exact:true}).click();await page.locator('[data-lobby-create]').click();
        let sent=await page.evaluate(()=>fixture.sent.at(-1));assert.equal(sent.type,'party_room_create');assert.equal(sent.payload.presentation,'first_person');
        await page.evaluate(()=>{window.__PEBBLE_PENDING_DAILY={name:'Daily',seed:'123',seasonings:[]};});
        await page.locator('#btn_create_party_room_empty').evaluate(node=>node.click());sent=await page.evaluate(()=>fixture.sent.at(-1));
        assert.equal(sent.payload.presentation,'first_person');assert.equal(sent.payload.seed,'123');
        await choice.getByText('2D',{exact:true}).click();await page.locator('#btn_toggle_party_ff').evaluate(node=>node.click());
        assert.equal((await page.evaluate(()=>fixture.sent.at(-1))).payload.presentation,'overhead');
        await page.evaluate(()=>fixture.render({room_id:'created',host:'Host',presentation:'first_person',status:'staging',visibility:'public',slots:[{username:'Host'}]}));
        assert.equal(await page.locator('#party_lobby_presentation').evaluate(node=>node.tagName),'SPAN');
        assert.match(await page.locator('#party_lobby_presentation').textContent(),/Immersive 3D.*locked/);
        assert.equal(await page.locator('#party_lobby_presentation select').count(),0);
        await page.evaluate(()=>fixture.render({...fixture.room,resume_id:'saved-3d'}));
        const fresh=page.locator('#party_new_presentation');assert(await fresh.getByRole('radio',{name:'First-person view'}).isChecked());
        await fresh.getByText('2D',{exact:true}).click();await page.evaluate(()=>fixture.render(fixture.room));assert(await fresh.getByRole('radio',{name:'Overhead view'}).isChecked());
        await page.locator('#party_new_expedition').click();sent=await page.evaluate(()=>fixture.sent.at(-1));
        assert.equal(sent.payload.presentation,'overhead');assert.equal(sent.payload.replace_save,'saved-3d');
        assert.equal(await page.evaluate(()=>fixture.room.presentation),'first_person');
        assert.equal(await page.evaluate(()=>fixture.sent.filter(message=>message.type==='party_room_settings'&&'presentation'in message.payload).length),0);
        for(const width of [390,1200]){
            await page.setViewportSize({width,height:900});await page.evaluate(()=>{scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
            assert.equal(await page.locator('#lobby_home').count(),1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            const saved=await page.evaluate(()=>fixture.room);await page.evaluate(()=>fixture.render(null));
            await page.locator('#lobby_home').screenshot({path:path.join(output,'creation-locked-'+width+'.png')});
            await page.evaluate(room=>fixture.render(room),saved);
            await page.locator('.party-lobby-tools').screenshot({path:path.join(output,'existing-game-locked-'+width+'.png')});
        }
        assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,creationMessages:await page.evaluate(()=>fixture.sent),errors},null,2));
        console.log('Creation-time mode selection and fixed lobby display passed.');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
