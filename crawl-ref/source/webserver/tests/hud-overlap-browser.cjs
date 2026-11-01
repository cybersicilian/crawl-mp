/* Whole-HUD geometry and input access through real adapters; no native game or server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(process.env.HUD_OVERLAP_WEB_ROOT || path.join(__dirname, '..'));
const output = process.env.HUD_AUDIT_OUTPUT || '/tmp/dcss-hud-overlap-proof';
fs.mkdirSync(output, { recursive: true });

function hero(slot, count = 18) {
    return { slot, player_id:'audit-hero-'+slot, name: ['Moss', 'Lyra', 'Orin', 'Nessa'][slot], species: 'Human', job: 'Fighter',
        xl: 5, xl_next: 34, str: 18, intel: 9, dex: 12, ac: 8, ev: 10, sh: 4, hp: 40, hp_max: 40, mp: 8, mp_max: 8,
        alive: true, active: slot === 0, place: 'D:1', on_same_level: true, weapon: '',
        zot_clock: {active:true,immune:false,remaining_aut:135000,capacity_aut:270000,warning:0,short_lifespans:0,lifespan_divisor:1},
        move_aut: 10, atk_aut: 10, speed_stat: 10, adjusted_noise: 0,
        resists: { rFire: 1, rCold: -1, rElec: 0, rPois: 0, rNeg: 0, rCorr: 0, Will: 40, SeeInvis: slot === 0, Stlth: 50 },
        runes:['serpentine','silver','abyssal'],runes_known:true, statuses: [{id:1,text:'Hasted',is_bad:false,dur:12},{id:2,text:'Poisoned',is_bad:true,dur:4}], banes: slot === 0 ? [{id:1,name:'Bane of Claustrophobia',desc:'Nearby walls oppress you.',recovery_xl_tenths:13}] : [], mutations: [], abilities: [],
        spells: [{ id: 0, name: 'Magic Dart', letter: 'a', level: 1, casting_cost:{resource:'mp',amount:8,additional_hp:10}, fail: 0 },{id:1,name:'Blink',letter:'b'}], inventory_known: true,
        floor_items_known:true, pos:{x:0,y:0}, floor_items:[{id:1,name:'a potion of curing',kind_name:'potion',qty:1}],
        inventory: Array.from({ length: count }, (_, i) => ({ slot: i, letter: String.fromCharCode(97 + i),
            name: i === 0 ? '+0 short sword' : 'potion of curing ' + i, kind_name: i === 0 ? 'weapon' : 'potion',
            qty: i === 1 ? 99999 : i % 3 + 1, equipped: i === 0, description: 'Known item description.' })) };
}

(async () => {
    const browser = await (process.env.HUD_AUDIT_BROWSER==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,channel:'chrome'}));
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
        hasTouch: process.env.SIDEBAR_TOUCH === '1', deviceScaleFactor: Number(process.env.SIDEBAR_DPR || 1) });
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));

    try {
        let html = fs.readFileSync(path.join(root, 'game_data/templates/game.html'), 'utf8').split('{% include "popup-templates.html" %}')[0];
        html = html.replace(/\{% for stylesheet in stylesheets\("game"\) %\}[\s\S]*?\{% end %\}/g, '');
        html = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<link[\s\S]*?\/>/g, '');
        html = html.replace(/{% include "([^"]+)" %}/g, (_, file) => fs.readFileSync(path.join(root, 'game_data/templates', file), 'utf8'));
        html = html.replace('style="display: none" data-loading-readiness="dungeon"', 'style="display:block"');
        await page.route('http://hud.test/**', async route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/') return route.fulfill({contentType:'text/html', body:'<!doctype html><html><body></body></html>'});
            const rel = url.pathname.startsWith('/gamedata/fixture/') ? 'game_data/static/' + url.pathname.slice('/gamedata/fixture/'.length) : url.pathname.slice(1);
            const file = path.join(root, rel);
            if (!file.startsWith(root+'/') || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
            const mime = {'.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)] || 'application/octet-stream';
            return route.fulfill({contentType:mime,path:file});
        });
        await page.goto('http://hud.test/');
        await page.setContent('<!doctype html><html><head><link rel="stylesheet" href="/gamedata/fixture/style.css"></head><body class="workflow-compact-roster">'+html+'</body></html>');
        await page.addStyleTag({content:'body{margin:0}#normal{display:block;width:100vw;height:100vh}#normal #left_column{display:flex;flex-direction:column;flex:none;min-width:0}#normal #right_column{flex:none}#dungeon{background:#111c22}#messages{overflow-wrap:anywhere}'});
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const noop = () => {};
            window.sent = []; window.inspected = [];
            window.modules = { jquery: window.jQuery,
                comm: { register_handlers: noop, send_message: (...args) => window.sent.push(args) },
                client: { is_party_member: () => true, is_watching: () => false },
                './enums': { mouse_mode: { COMMAND: 0 }, ui: { NORMAL: 0, VIEW_MAP:2 }, gxm:120,gym:104 }, './player': { inv: [] },
                './dungeon_renderer': { set_view_center: noop, ui_state:999,view:{x:0,y:0},cols:20,rows:20 }, './display': { invalidate: noop, display: noop },
                './minimap': { update_overlay: noop, fit_to: width => { for(const id of ['minimap','minimap_overlay']) { const canvas=document.getElementById(id);canvas.width=64;canvas.height=64;canvas.style.width='64px';canvas.style.height='64px'; } } },
                './party-inspector': { open: (...args) => window.inspected.push(args), render: noop },
                './party-controls': { toggle_drawer: noop, bind: noop }, './tileinfo-dngn': {}, './tileinfo-main': {}, './tileinfo-gui': {},
                './party-doom': { update: noop }, './party-trade': { button: () => window.jQuery('<button>Trade</button>') },
                './chat-context': { update: noop }, './item-context-menu': { bind: noop },
                './inspection-dialog': { open: noop }, './power-picker': {init:noop,open:noop},
                './equipment-paperdoll': { itemRestriction: () => null },
                './game-context': {get_ui_state:()=>0,get_input_mode:()=>0},key_conversion:{codes:{}},
                './context-menu': {bind:noop},'./party-skill-training': {signature:()=>'',itemEntries:()=>[]},
                'character-catalog': {species:{}}, './tileinfo-player': {TILEP_PLAYER_MAX:10000},
                './enemy-initiative':{init:noop},'./options':{ready:()=>true,get:key=>key==='tile_window_col'?{r:100,g:100,b:100}:key==='tile_map_pixels'?1:0},
                './view_data':{cursor_locs:{},place_cursor:noop,remove_cursor:noop},'./map_knowledge':{get:()=>({})},
                './cell_renderer':{DungeonCellRenderer:class {init(){} clear(){} render_cell(){} draw_main(){}}},
                './util':{init_canvas:(canvas,w,h)=>{canvas.width=w;canvas.height=h}},'./dungeon-context-menu':{open:noop},
                './monster_list':{contacts:()=>[]}   };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(dep => {
                    if (!(dep in window.modules)) throw new Error('Missing fixture dependency: ' + dep);
                    return window.modules[dep];
                }));
            };
        });
        const files = [['item-properties', 'static/scripts/item-properties.js'],
            ['character-stat-help', 'static/scripts/character-stat-help.js'], ['heat-help','static/scripts/heat-help.js'], ['spell-cost', 'static/scripts/spell-cost.js'],
            ...['minimap','effect-icon-catalog','effect-icon-art','status-icons', 'party-model', 'party-status-model', 'party-doom-model', 'party-doom', 'party-faith', 'portrait-status', 'party-card-status',
                'player-card-details', 'party-initiative', 'workflow-actions', 'party-navigation', 'party', 'native-tile-art', 'frame-update',
                'party-power-cards', 'shell-dash-art', 'power-art', 'hud-inventory', 'party-sidebar', 'player-card-sections', 'party-card-readings', 'hud-iconography','menu-keyboard','quickbar-model','quickbar-commands','quickbar','gameplay-controls','hud-bottom-strip','floor-items','route-plan','direction-pad','party-progress-model','enemy-banner-model','creature-roster-model','collapsible-roster','indexed-paint','enemy-initiative','party-progress','hud-polish','hud-layout']
                .map(name => [name === 'party' ? name : './' + name, 'game_data/static/' + name + '.js'])];
        for (const [name, file] of files) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
            assert(await page.evaluate(name => Boolean(window.modules[name]), name), 'Module loaded: ' + name);
        }
        const state = {mode:'explore',floor:'D:1',enemy_initiative:[{id:1,x:3,y:3,name:'a very long named goblin carrying an ancient standard',att:0,damage_level:2,energy_deficit:3,speed:10,ready:false,statuses_known:true,statuses:[]},{id:2,x:4,y:3,name:'a very long named goblin carrying an ancient standard',att:0,damage_level:2,energy_deficit:3,speed:10,ready:false,statuses_known:true,statuses:[]},{id:3,x:6,y:3,name:'friendly summoned ice beast',att:4,damage_level:0,energy_deficit:0,speed:10,ready:true}], gold:123456, runes:['serpentine','silver','abyssal'], floor_monsters:{known:true,total:25,killed:5}, snapshot_version: 2, controlled_slot: 0, active_slot: 0, controllable_slots: [0, 1, 2, 3],
            inventory_use: true, inventory_secondary: true, members: [hero(0), hero(1),hero(2),hero(3)] };
        async function render() {
            await page.evaluate(data => {
                window.modules.party.state(data);
                window.modules['./player-card-sections'].init();
                window.modules['./hud-inventory'].init();
                window.modules['./party-card-readings'].init();
                window.modules['./hud-iconography'].init();
                window.modules['./hud-polish'].init();
                window.modules['./gameplay-controls'].init();
                window.jQuery('#party_banner_center').before('<span id="hud_zoom_controls"><button type="button" aria-label="Zoom out">−</button><button type="button" aria-label="Zoom reset">1</button><button type="button" aria-label="Zoom in">+</button></span>');
                window.modules['./hud-bottom-strip'].init();
                localStorage.setItem('dcss.quickbar.v1.audit-hero-0',JSON.stringify([{kind:'spell',id:0},{kind:'spell',id:1},...Array.from({length:8},(_,i)=>({kind:'item',id:i+1}))]));
                window.modules['./quickbar'].init();
                window.modules['./floor-items'].init();
                window.modules['./direction-pad'].init();
                window.modules['./party-progress'].init();
                window.jQuery('#messages').html('<p>You see here a potion of curing.</p><p>The goblin attacks. The attack misses you.</p>');
                for (const [name, value] of Object.entries({ ac: 8, ev: 10, sh: 4, str: 18, int: 9, dex: 12 }))
                    document.getElementById('stats_' + name).textContent = value;
                window.jQuery(document).trigger('game_input_changed', [0]);
                window.modules['./party-sidebar'].update();
            }, state);
        }
        async function settled() {
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        async function geometry() {
            await settled();
            return page.evaluate(() => {
                const scroll = document.getElementById('hud_sidebar_scroll');
                const box = node => {
                    const r = node.getBoundingClientRect();
                    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
                };
                return { height: scroll.clientHeight, content: scroll.scrollHeight,
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    cards: [...document.querySelectorAll('.party-card')].map(box),
                    clippedControls: [...document.querySelectorAll('.party-card button')].filter(node => {
                        if (!node.getClientRects().length) return false;
                        const control = box(node), card = box(node.closest('.party-card'));
                        return control.left < card.left || control.right > card.right;
                    }).map(node => node.id || node.className),
                    previews: [...document.querySelectorAll('.party-sidebar-pack')].filter(node => !node.hidden).length,
                    extras: [...document.querySelectorAll('.party-sidebar-extra')].filter(node => !node.hidden).length,
                    inventoryHeight: box(document.querySelector('#hud_inventory .hud-item-grid')).height };
            });
        }
        await render();
        for (const [width,height] of [[1440,900],[1280,800],[1024,768],[800,600],[900,450],[680,700],[600,800],[390,844],[720,450]]) {
            await page.setViewportSize({width,height});
            await page.evaluate(() => {
                const left=document.getElementById('left_column'),view=document.getElementById('dungeon_viewport');
                const layout=window.modules['./hud-layout'];
                left.style.width=Math.max(1,innerWidth-layout.sidebarWidth())+'px';
                view.style.height=Math.max(1,innerHeight-layout.messageHeight(112)-layout.height())+'px';view.style.width=left.clientWidth+'px';
                const canvas=document.getElementById('dungeon');canvas.style.width=view.style.width;canvas.style.height=view.style.height;
                window.dispatchEvent(new Event('resize'));
            });
            await settled();
            const findings=await page.evaluate(() => {
                const issues=[];
                const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
                const visible=el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && el.getBoundingClientRect().width>0;
                const intersect=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.8 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.8;
                const name=el=>el.id||el.className||el.tagName;
                function siblings(selector,part=':scope > *') {
                    document.querySelectorAll(selector).forEach(root=>{
                        const children=[...root.querySelectorAll(part)].filter(visible);
                        for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++) {
                            if(intersect(box(children[i]),box(children[j]))) issues.push({kind:'overlap',container:name(root),a:name(children[i]),b:name(children[j])});
                        }
                    });
                }
                siblings('#hud_bottom_row,#hud_bottom_map,#party_progress,#party_progress_runes,.hud-inventory-tools,.party-card-toolbar,.party-icon-meta,#hud_map_tools,#hud_floor_items > header,#dcss_quick_dock');
                siblings('.enemy-timing',':scope > .enemy-timing-icon,:scope > .enemy-timing-details');
                siblings('.hud-item-slot',':scope > .hud-slot-letter,:scope > .hud-slot-quantity');
                siblings('.hud-quick-slot',':scope > .quickbar-key,:scope > .quickbar-quantity,:scope > canvas,:scope > .quickbar-cast-mode');
                for(const selector of ['#hud_map_tools','#dcss_quick_dock','.party-card','.hud-item-slot','.hud-quick-slot','#hud_bottom_row','#hud_floor_items > header','#party_progress']) {
                    document.querySelectorAll(selector).forEach(root=>{
                        if(!visible(root))return;
                        const parent=box(root);const style=getComputedStyle(root);
                        if(root.scrollWidth>root.clientWidth+1 && !['auto','scroll'].includes(style.overflowX)) issues.push({kind:'overflow',container:name(root),width:root.clientWidth,content:root.scrollWidth});
                        if(['hud_floor_items','hud_bottom_map','message_pane','right_column','direction_pad'].includes(root.id) && parent.right>innerWidth+1)issues.push({kind:'offscreen',container:name(root)});
                    });
                }
                const map=box(document.getElementById('hud_bottom_map')),tools=box(document.getElementById('hud_map_tools'));
                if(tools.right>map.right+1) issues.push({kind:'map-tools-outside',map,tools});
                const dock=box(document.getElementById('dcss_quick_dock')),pad=box(document.getElementById('direction_pad'));
                if(visible(document.getElementById('direction_pad')) && intersect(dock,pad))issues.push({kind:'direction-pad-covers-dock',dock,pad});
                document.querySelectorAll('[data-hud-obstacle]').forEach(node => {
                    if (visible(node) && visible(document.getElementById('direction_pad')) && intersect(box(node), pad))
                        issues.push({ kind: 'direction-pad-covers-overlay', overlay: node.className });
                });
                return {html:{footer:document.getElementById('hud_bottom_row').outerHTML,quickbar:document.getElementById('quickbar_slots').outerHTML},issues,documentOverflow:document.documentElement.scrollWidth>innerWidth,boxes:Object.fromEntries(['right_column','left_column','hud_bottom_map','hud_map_tools','hud_bottom_row','dcss_quick_dock','direction_pad','hud_floor_items','message_pane','enemy_initiative_rail','dungeon_viewport','minimap_block'].map(id=>[id,box(document.getElementById(id))]))};
            });
            evidence[width+'x'+height]=findings;
            assert.deepEqual(findings.issues,[], 'No HUD overlaps at '+width+'x'+height);
            assert.equal(findings.documentOverflow,false,'No page overflow');
            assert(findings.boxes.hud_bottom_row.right<=findings.boxes.left_column.right+1,'Footer fits playfield');
            assert(findings.boxes.hud_bottom_row.bottom<=height+1,'Footer stays on screen');
            const padState=await page.locator('#direction_pad').evaluate(pad=>({visibility:getComputedStyle(pad).visibility,position:getComputedStyle(pad).position}));
            assert.equal(padState.position,'absolute','Movement pad does not enter document flow');
            if(padState.visibility!=='hidden') {
                const p=findings.boxes.direction_pad,v=findings.boxes.dungeon_viewport;
                assert(p.x>=v.x && p.y>=v.y && p.right<=v.right+1 && p.bottom<=v.bottom+1,'Movement pad fits dungeon viewport');
                const r=findings.boxes.enemy_initiative_rail;
                const floating=await page.locator('#enemy_initiative_rail').evaluate(el=>getComputedStyle(el).position==='fixed');
                if(floating) assert(p.right<=r.x+.5 || p.x>=r.right-.5 || p.bottom<=r.y+.5 || p.y>=r.bottom-.5,'Movement pad stays clear of creature rail');
            }
            assert.match(await page.locator('#hud_item_0_1').getAttribute('aria-label'),/Quantity: 99999/,'Exact stack count remains accessible');
            await page.screenshot({path:path.join(output,`hud-${width}x${height}.png`)});
            await page.locator('#quickbar_more > summary').click({timeout:2000});await settled();
            const palette=await page.locator('#quickbar_more_content').evaluate(root=>({width:root.clientWidth,content:root.scrollWidth,rect:root.getBoundingClientRect().toJSON(),tools:root.querySelector('.quickbar-picker-tools').scrollWidth}));
            evidence[width+'x'+height].palette=palette;fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(evidence,null,2));
            await page.screenshot({path:path.join(output,`palette-${width}x${height}.png`)});
            await page.locator('#quickbar_more > summary').click({timeout:2000});
            await page.locator('#quickbar_more > summary').press('Enter');
            assert(await page.locator('#quickbar_more').evaluate(el=>el.open),'Keyboard opens palette');
            await page.locator('#quickbar_more > summary').press('Enter');
            if(findings.boxes.left_column.width<=420) {
                await page.locator('#hud_floor_items').focus();
                const loot=await page.locator('#hud_floor_items').boundingBox(),footer=await page.locator('#hud_bottom_row').boundingBox();
                assert(loot.y<footer.y+footer.height && loot.y+loot.height>footer.y,'Loot remains reachable by scrolling footer');
                await page.locator('#hud_bottom_row').evaluate(el=>{el.scrollTop=0});
            }
        }
        evidence.errors=errors;
        fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(evidence,null,2));
        assert.match(await page.locator('#quickbar_slot_0 .quickbar-quantity').innerText(),/8 MP \+ 10 HP/);
        assert.equal(await page.locator('.hud-quick-slot:not(.is-empty)').count(),10,'All saved quick slots retained');
        assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,output,cases:Object.keys(evidence).length-1,errors}));
    } catch(error) {
        fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(evidence,null,2));await page.screenshot({path:path.join(output,'failure.png')});
        console.error('Page errors:',errors);throw error;
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
