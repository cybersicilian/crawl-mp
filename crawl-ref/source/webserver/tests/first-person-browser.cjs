/* Real AMD loader, native atlases, tile compositors and camera adapter. No game or account writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(process.env.FIRST_PERSON_STATIC_ROOT || path.join(__dirname, '..'));
const output = process.env.FIRST_PERSON_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
const schema = JSON.parse(fs.readFileSync(path.join(root, 'static/graphics-settings.json')));
function setup(schema) {
    window.assert = value => { if (!value) throw new Error('Native tile assertion'); };
    window.fixture = { mode: 1, keys: 0, clicks: [], errors: [],handlers:{},sent:[] };
    window.addEventListener('keydown', () => fixture.keys++);
    require.config({ baseUrl: '/static/scripts', paths: { jquery: 'contrib/jquery', game: '/game' },
        shim: { 'contrib/jquery.json': ['jquery'] } });
    define('comm', [], () => ({ register_handlers(values) {Object.assign(fixture.handlers,values);}, send_message(type,payload) {fixture.sent.push({type,payload});return true;} }));
    define('client', [], () => ({ is_watching: () => false }));
    define('game/player', [], () => ({ name: 'Preview',species:'Human', pos: { x: 8, y: 8 }, place: 'Dungeon', depth: 1,
        hp: 20, hp_max: 20, mp: 5, mp_max: 5, status: [], inv: {}, poison_survival: 20 }));
    const settings = fixture.options = { tile_display_mode: 'tiles', tile_realtime_anim: false,
        tile_water_anim: false, tile_misc_anim: false, tile_filter_scaling: false, tile_web_mouse_control: true,
        tile_cell_pixels: 32, tile_viewport_scale: 100, tile_map_scale: 60, tile_show_minihealthbar: false,
        tile_show_minimagicbar: false, tile_font_lbl_size: 0, tile_font_lbl_family: 'monospace' };
    define('game/options', [], () => ({ ready: () => true, get: key => settings[key], add_listener() {} }));
    define('game/game-context', [], () => ({ get_input_mode: () => fixture.mode, can_target: () => fixture.mode >= 2,
        get_ui_state: () => fixture.renderer.ui_state }));
    define('game/mouse_control', [], () => ({}));
    const attach = { attach() {}, draw() { return false; }, animated: () => false, point() {}, leave() {} };
    ['party-hover', 'traversal-effects', 'planned-route', 'hero-feedback', 'encounter-feedback', 'premium-movement',
        'premium-effects', 'premium-regions', 'chain-view', 'shell-animation', 'terrain-edges', 'environment-ground']
        .forEach(name => define('game/' + name, [], () => attach));
    require(['jquery', 'game/dungeon_renderer', 'game/map_knowledge', 'game/tileinfo-dngn', 'game/tileinfo-main',
        'game/tileinfo-player', 'game/player', 'expedition-presentation', 'game/first-person-scene', 'texture-pack'],
    ($, renderer, map, tiles, main, playerTiles, player, presentation, scene, pack) => { (async () => {
        try {
            await Promise.all(Array.from(document.images).filter(image=>image.hasAttribute('src')).map(image => image.decode()));
            Object.assign(fixture, { renderer, map, tiles, main, playerTiles, player, presentation, scene, pack });
            $(document).trigger('game_preinit'); $(document).trigger('game_init');
            function itemArt(index) {
                const info = main.get_tile_info(index);
                return { texture: 'main', layers: [{ sx: info.sx, sy: info.sy, w: info.ex-info.sx, h: info.ey-info.sy,
                    ox: info.ox+16-info.w/2, oy: info.oy+32-info.h, ymax: 32 }] };
            }
            const shield = main[Object.keys(main).find(name => /^ARM_BUCKLER/.test(name) && Number.isInteger(main[name]))];
            fixture.hero = { slot: 0, player_id: 'preview', name: 'Preview', species: 'Human', place: 'D:1', pos: player.pos,
                actions: [], actions_known: true, equipment_profile: { version: 1, hands: "hands", unarmed_attack: "Fists",
                    portrait:{texture:'player',layers:[playerTiles.BASE_HUMAN,playerTiles.HUMAN_1,playerTiles.HAND1_LONG_SWORD_SLANT,playerTiles.HAND2_BUCKLER].map(index=>{
                        const info=playerTiles.get_tile_info(index);return {sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,ox:0,oy:0,ymax:32};
                    })},
                    slots: [{ type: 'weapon', state: 'equipped', inv_slot: 0, name: 'long sword' },
                        { type: 'offhand', state: 'equipped', inv_slot: 1, name: 'buckler' }],
                    items: [{ inv_slot: 0, hands: 1, art: itemArt(main.WPN_LONG_SWORD) }, { inv_slot: 1, art: itemArt(shield) }] } };
            window.crawl_party = { state: { controlled_slot: 0, members: [fixture.hero] } };
            map.set_player_on_level(true);
            const cells = [];
            for (let y = 3; y <= 12; y++) for (let x = 3; x <= 13; x++) {
                const wall = y === 3 || y === 12 || x === 3 || x === 13 || x === 11 && y < 8;
                const floor = tiles.FLOOR_GREY_DIRT + (x + y) % tiles.tile_count(tiles.FLOOR_GREY_DIRT);
                let bg = wall ? tiles.WALL_BRICK_DARK_2 : floor;
                if (x === 6 && y === 4) bg = tiles.DNGN_STONE_STAIRS_DOWN;
                if(x===5&&y===7)bg=tiles.DNGN_STONE_STAIRS_UP;
                if(x===11&&y===6)bg=tiles.DNGN_OPEN_DOOR;
                if (x >= 9 && x <= 10 && y >= 5 && y <= 6) bg = tiles.DNGN_SHALLOW_WATER;
                if (x === 8 && y === 3) bg = tiles.DNGN_CLOSED_DOOR;
                if(x===5&&y===3||x===11&&y===5)bg=tiles.WALL_BRICK_DARK_2_TORCH;
                if(x===10&&y===7)bg=tiles.DNGN_TRANSPARENT_WALL;
                if(x===10&&y===6)bg=tiles.DNGN_TRANSPARENT_STONE;
                if(x===12&&y===7)bg=tiles.DNGN_CRYSTAL_WALL;
                if(x===4&&y===5)bg=tiles.DNGN_TREE;
                if(x===5&&y===5)bg=tiles.DNGN_GRANITE_STATUE;
                if(x===6&&y===5)bg=tiles.DNGN_ALTAR_ZIN;
                if(x===4&&y===7)bg=tiles.DNGN_FOUNTAIN;
                if(x===12&&y===9)bg=tiles.DNGN_LAVA;
                if(x===7&&y===9)bg=tiles.DNGN_SHALLOW_HONEY;
                if(x===12&&y===10)bg=tiles.DNGN_ENTER_LAIR;
                if(x===12&&y===8)bg=tiles.DNGN_RUNED_DOOR;
                if(x===10&&y===10)bg=tiles.DNGN_TRAP_SHAFT;
                if(x===11&&y===9)bg=tiles.DNGN_TRAP_PLATE;
                if(x===11&&y===8)bg=tiles.DNGN_TRAP_ALARM;
                if(x===11&&y===10)bg=tiles.DNGN_TRAP_TELEPORT;
                if(x===6&&y===11)bg=tiles.DNGN_CLOSED_DOOR;
                if(x===7&&y===11)bg=tiles.DNGN_OPEN_DOOR;
                if(x===9&&y===8)bg=tiles.DNGN_CLOSED_DOOR;
                if(x===9&&y===9)bg=tiles.DNGN_OPEN_DOOR;
                if(x===11&&y===11)bg=tiles.WALL_BRICK_DARK_2;
                if(y===12&&[6,7,11].includes(x))bg=floor;
                if(x===4&&y===11)bg=tiles.FLOOR_MOSS;
                if(x===5&&y===11)bg=tiles.FLOOR_SANDSTONE;
                if(x===10&&y===5)bg=tiles.DNGN_DEEP_WATER;
                if(x===4&&y===8)bg=tiles.DNGN_BROKEN_DOOR;
                if(x===4&&y===9)bg=tiles.DNGN_ESCAPE_HATCH_DOWN;
                if(x===5&&y===9)bg=tiles.DNGN_ESCAPE_HATCH_UP;
                if(y===3&&x>=9&&x<=11)bg=[tiles.DNGN_GATE_CLOSED_LEFT,tiles.DNGN_GATE_CLOSED_MIDDLE,tiles.DNGN_GATE_CLOSED_RIGHT][x-9];
                if(x===6&&y===10)bg=tiles.DNGN_SEALED_DOOR;
                if(x===4&&y===10)bg=tiles.DNGN_RUNED_CLEAR_DOOR;
                if(x===5&&y===10)bg=tiles.DNGN_SEALED_CLEAR_DOOR;
                if(x===8&&y===10)bg=tiles.DNGN_SEALED_STAIRS_DOWN;
                if(x===9&&y===10)bg=tiles.DNGN_ONE_WAY_STAIRS_UP;
                const cell = { x, y, t: { bg, flv: { f: floor, s: x * 31 + y } } };
                if(x===8&&y===8){cell.t.fg=playerTiles.MONS_HUMAN;cell.t.doll=[[playerTiles.BASE_HUMAN,32],[playerTiles.HUMAN_1,32]];}
                if (x === 9 && y === 6) {
                    cell.mon = { id: 1, name: 'Orc', att: 0 };
                    cell.t.fg = playerTiles.MONS_ORC;
                    cell.t.doll = [[playerTiles.MONS_ORC, 32]];
                }
                if (x === 7 && y === 7) cell.t.fg = main.WPN_DAGGER+0x00040000; // Native S_UNDER.
                if(x===8&&y===7)cell.t.fg=main.GOLD23;
                if (x === 7 && y === 5) {
                    cell.mon = { id: 2, name: 'Rat', att: 0 };
                    cell.t.fg = playerTiles.MONS_RAT; cell.t.doll = [[playerTiles.MONS_RAT, 32]];
                }
                if (x === 6 && y === 6 || x === 10 && y === 4) {
                    const giant=x===10,id=giant?playerTiles.MONS_TITAN:playerTiles.MONS_OGRE;
                    cell.mon={id:giant?4:3,name:giant?'titan':'ogre',att:0,body_size:giant?5:4};
                    cell.t.fg=id;cell.t.doll=[[id,32]];
                }
                cells.push(cell);
            }
            cells.push({ x: 8, y: 2, t: { bg: tiles.FLOOR_NORMAL + 0x40000, fg: main.WPN_DAGGER }, mon: { name: 'Hidden' } });
            map.merge(cells); renderer.set_ui_state(0); renderer.set_view_center(8, 8); renderer.fit_to(960, 600, 13);
            $(document).trigger('player_state_changed');
            fixture.handlers.game_presentation({mode:'first_person',expedition_id:'preview'});
            renderer.render_view();
            $('#dungeon').on('cell_click cell_contextmenu', event => fixture.clicks.push({ type: event.type, cell: event.cell }));
            fixture.ready = true;
        } catch (error) { fixture.errors.push(error.stack); }
    })(); }, error => fixture.errors.push(String(error)));
}
const html = '<!doctype html><html><meta charset="utf-8"><title>First-person dungeon preview</title>'
    + '<link rel="stylesheet" href="/game/styles/first-person.css"><style>'
    + 'body{margin:0;background:#0c1117;color:#e9dfc7;font:15px system-ui}main{padding:24px;max-width:1000px;margin:auto}'
    + 'h1{font:28px Georgia;margin:0 0 8px}p{margin:8px 0 18px;color:#a8b4b8}'
    + '#dungeon_viewport{position:relative;overflow:hidden;width:960px;height:600px;border:1px solid #77664b}'
    + '#dungeon{position:absolute}</style><main id="game"><h1>Into the dungeon</h1>'
    + '<p>Optional first-person 3D · native tile art · controlled renderer preview</p>'
    + '<div id="dungeon_viewport"><canvas id="dungeon"></canvas></div></main><div hidden>'
    + ['floor', 'wall', 'feat', 'main', 'player', 'icons', 'gui'].map(id => `<img id="${id}" src="/game/${id}.png">`).join('')
 + '<img id="illustrated_dungeon" src="/static/tabletop/assets/dungeon-features-v1.png">'
 + [['equipment','held-equipment-v2.png'],['melee','held-melee-v1.png'],['weapon_forms','held-weapon-forms-v1.png'],['ranged','held-ranged-v2.png'],['shields','shield-variants-v1.png']]
    .map(([id,file])=>`<img data-asset-optional id="illustrated_${id}" data-src="/static/tabletop/assets/${file}">`).join('')
 + '</div><script src="/static/scripts/contrib/require.js"></script><script>('
    + setup.toString() + ')(' + JSON.stringify(schema) + ')</script></html>';
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage({ viewport: { width: 1040, height: 760 } });
        async function cameraButton(name){
            await page.getByRole('button',{name:'Inventory',exact:true}).click();
            await page.getByRole('button',{name:'Controls',exact:true}).click();
            await page.getByRole('button',{name,exact:true}).click();
            await page.keyboard.press('Escape');
        }
        const errors = []; page.on('pageerror', error => errors.push(error.stack));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.route('http://perspective.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            if (name === '/') return route.fulfill({ contentType: 'text/html', body: html });
            const file = name.startsWith('/game/') ? path.join(root, 'game_data/static', name.slice(6))
                : name.startsWith('/static/') ? path.join(root, name.slice(1)) : null;
            if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: name });
            return route.fulfill({ path: file });
        });
        await page.goto('http://perspective.test/');
        await require('./helpers/fixture-readiness.cjs')(page, output, errors);
        assert.deepEqual(await page.evaluate(() => fixture.errors), []);
        const canvas = page.locator('#first_person_dungeon');
        await canvas.waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelector('.first-person-compass').textContent === 'Facing N');
        if(process.env.FIRST_PERSON_STARTUP_ONLY==='1'){
            const startup=await page.evaluate(()=>{
                const canvas=document.getElementById('first_person_dungeon'),gl=canvas.getContext('webgl');
                const pixels=gl?new Uint8Array(canvas.width*canvas.height*4):canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
                if(gl)gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                const colors=new Set();for(let i=0;i<pixels.length;i+=16)colors.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));
                return {backend:canvas.dataset.backend,renderer:canvas.dataset.renderer,width:canvas.width,height:canvas.height,
                    colors:colors.size,cells:fixture.scene.build(fixture.player.pos,fixture.player).cells.length};
            });
            assert(['mesh','raycast'].includes(startup.backend));assert(startup.width>0&&startup.height>0);
            assert(startup.colors>16&&startup.cells>0,'3D startup must render a nonblank native-art scene');
            assert.deepEqual(errors,[]);
            await page.screenshot({path:path.join(output,'first-person-startup.png')});
            fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({...startup,passed:true,
                scope:'3D entry/startup only; full visual, gameplay and multiplayer validation follows deployment'},null,2));
            return;
        }
        if(process.env.FIRST_PERSON_DIAGONAL_ONLY==='1'){
            const proof=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint'],function(render){
                const c=document.createElement('canvas');c.width=c.height=480;const painter=render.create(c);
                const scene=fixture.scene.build(fixture.player.pos,fixture.player);
                painter.paint(scene,{x:11.5,y:12.5,angle:-Math.PI/4,pitch:-Math.atan2(.55,Math.SQRT2),height:.55});
                const image=c.toDataURL(),pick=painter.pick(240,240);painter.destroy();resolve({image,pick});
            })));
            fs.writeFileSync(path.join(output,'diagonal-passage-trim-corrected.png'),Buffer.from(proof.image.split(',')[1],'base64'));delete proof.image;
            assert.deepEqual(proof.pick,{x:12,y:11});assert.deepEqual(errors,[]);
            fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'Targeted diagonal trim correction component proof',passed:true,...proof},null,2));return;
        }
        assert.equal(await page.getByRole('meter', { name: 'Health: 20 / 20' }).getAttribute('aria-valuenow'), '20');
        assert.equal(await page.locator('html').getAttribute('data-expedition-view'), 'first_person');
        assert.equal(await page.locator('.first-person-held-item').count(), 2);
        assert.equal(await page.locator('.first-person-held-item[data-side="offhand"]').getAttribute('aria-label'), 'Offhand: buckler');
        assert(Number(await page.locator('.first-person-held-item[data-side="main"]').getAttribute('data-voxels')) > 20);
        assert.equal(await page.locator('.first-person-held-item[data-side="main"]').getAttribute('data-source-art'),'inventory');
        assert.equal(await page.locator('.first-person-held-item[data-side="offhand"]').getAttribute('data-source-art'),'inventory');
        assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>/held-(equipment|melee|ranged|weapon)|shield-variants/.test(entry.name)).length),0);
        const proof = await page.evaluate(() => {
            const canvas = document.getElementById('first_person_dungeon');
            const gl=canvas.getContext('webgl');const pixels=new Uint8Array(canvas.width*canvas.height*4);
            gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            const colors = new Set(); for (let i = 0; i < pixels.length; i += 16) colors.add([pixels[i], pixels[i + 1], pixels[i + 2]].join(','));
            const scene = fixture.scene.build(fixture.player.pos,fixture.player);
            return { colors: colors.size,backend:canvas.dataset.backend,eye:Number(canvas.dataset.eyeHeight), dimensions: [canvas.width, canvas.height],
                hidden: scene.get(8, 2) === null, door: scene.get(8, 3).solid,ownShadow:scene.shadowSprites.length,
                doorArt:scene.get(8,3).doorMaterial.sourceArt,runed:scene.get(12,8).runed,connector:scene.get(12,10).connector,
                torchFlames:scene.cells.filter(cell=>cell.flameMaterial).length,lights:scene.lights.length,
                bakedTorchRemoved:scene.get(5,3).wallMaterial.image.toDataURL()===scene.get(3,3).wallMaterial.image.toDataURL(),
                sprites: scene.sprites.map(sprite => ({ x: sprite.x, y: sprite.y, label: sprite.label,height:sprite.height,width:sprite.width,
                    size:sprite.size,pixelated:sprite.pixelated,sourceArt:sprite.sourceArt,imageWidth:sprite.image.width })) };
        });
        assert(proof.colors > 150); assert(proof.hidden); assert(proof.door);
        assert.equal(proof.backend,'mesh');
        assert.equal(proof.ownShadow,1);assert.equal(proof.doorArt,'dungeon-features-v1.png');assert(proof.runed);
        assert(proof.connector&&proof.connector.kind==='branch');
        assert.equal(proof.torchFlames,2);assert(proof.lights>=2);
        assert(proof.bakedTorchRemoved,'Modeled torches replace the torch baked into the wall graphic');
        assert(proof.sprites.every(sprite=>sprite.pixelated&&sprite.sourceArt==='native'));
        const height=name=>proof.sprites.find(sprite=>sprite.label.toLowerCase()===name).height;
        assert(height('rat')<height('orc')/4);assert(height('ogre')>height('orc'));assert(height('titan')>height('ogre'));
        assert(proof.sprites.some(sprite => sprite.label === 'Orc'));
        assert(proof.sprites.some(sprite => sprite.x === 7 && sprite.y === 7));
        assert(!proof.sprites.some(sprite => sprite.label === 'Hidden'));
        await page.screenshot({ path: path.join(output, 'first-person-native.png') });
        if(process.env.FIRST_PERSON_MENUS==='1')await require('./first-person-menu-browser.cjs')(page,output);
        if(process.env.FIRST_PERSON_HANDS==='1')await require('./first-person-hands-browser.cjs')(page,output);
        const originalWeapon=await page.locator('.first-person-held-item[data-side="main"]').evaluate(canvas=>canvas.toDataURL());
        await page.evaluate(()=>{
            fixture.originalArt=fixture.hero.equipment_profile.items[0].art;
            const info=fixture.main.get_tile_info(fixture.main.UNRAND_SINGING_SWORD);
            fixture.hero.equipment_profile.items[0].art={texture:'main',layers:[{sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,ox:info.ox+16-info.w/2,oy:info.oy+32-info.h,ymax:32}]};
            fixture.hero.equipment_profile.slots[0].name='Singing Sword';jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        });
        assert.notEqual(await page.locator('.first-person-held-item[data-side="main"]').evaluate(canvas=>canvas.toDataURL()),originalWeapon,'Artefact source cannot reuse the generic weapon model');
        await page.screenshot({path:path.join(output,'held-artefact-variant.png')});
        await page.evaluate(()=>{fixture.hero.equipment_profile.items[0].art=fixture.originalArt;fixture.hero.equipment_profile.slots[0].name='long sword';jQuery(document).trigger('party_state_rendered',[crawl_party.state]);});
        if (process.env.FIRST_PERSON_HELD_GALLERY === '1') {
            await page.evaluate(() => new Promise(resolve => require(['game/first-person-held'], function (held) {
                const gallery=document.createElement('section');gallery.id='held_gallery';gallery.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px;background:#0b1017';
                const style=document.createElement('style');style.textContent='#held_gallery .first-person-hand-group{width:100%!important;left:0!important;right:0!important;bottom:-6px!important}';gallery.append(style);
                const names=[['WPN_LONG_SWORD','HAND1_LONG_SWORD_SLANT'],['WPN_HAND_AXE','HAND1_HAND_AXE'],['WPN_MACE','HAND1_MACE'],['WPN_SPEAR','HAND1_SPEAR'],['WPN_SHORTBOW','HAND1_SHORTBOW'],['WPN_QUARTERSTAFF','HAND1_QUARTERSTAFF1'],['ARM_BUCKLER','HAND2_BUCKLER'],['ARM_KITE_SHIELD','HAND2_KITE_SHIELD']];
                fixture.galleryViews=[];names.forEach(([name,hand])=>{
                    const index=fixture.main[name]??fixture.main[Object.keys(fixture.main).find(key=>key.startsWith(name)&&Number.isInteger(fixture.main[key]))];
                    if(!Number.isInteger(index))return;
                    const article=document.createElement('article');article.style.cssText='min-width:0;border:1px solid #34404a';
                    const label=document.createElement('h3');label.style.cssText='font:12px system-ui;text-align:center;color:#dce5eb';label.textContent=name.replace(/^(WPN_|ARM_|STAFF_)/,'').replaceAll('_',' ');
                    const host=document.createElement('div');host.style.cssText='height:320px;position:relative;overflow:hidden;background:radial-gradient(at 50% 75%,#34404a,#101822 80%)';
                    const info=fixture.main.get_tile_info(index),weapon=!name.startsWith('ARM_');
                    const part=fixture.playerTiles.get_tile_info(fixture.playerTiles[hand]);
                    const hero={slot:0,actions:[],equipment_profile:{version:1,portrait:{texture:'player',layers:[{sx:part.sx,sy:part.sy,w:part.ex-part.sx,h:part.ey-part.sy}]},
                        slots:[{type:weapon?'weapon':'offhand',state:'equipped',inv_slot:0,name:label.textContent}],
                        items:[{inv_slot:0,...(weapon?{hands:1}:{}),art:{texture:'main',layers:[{sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,ox:info.ox+16-info.w/2,oy:info.oy+32-info.h,ymax:32}]}}]}};
                    const image=held.create(host,{onChange:()=>requestAnimationFrame(()=>image.update({},hero,true))});image.update({},hero,true);
                    fixture.galleryViews.push(image);host.querySelector('canvas').style.cssText='width:100%;left:0;right:0;bottom:-6px';article.append(label,host);gallery.append(article);
                });document.body.append(gallery);resolve();
            })));
            await page.waitForFunction(()=>[...document.querySelectorAll('#held_gallery canvas')].length>=7&&[...document.querySelectorAll('#held_gallery canvas')].every(node=>node.dataset.sourceArt==='inventory'));
            assert(await page.locator('#held_gallery canvas').evaluateAll(nodes=>nodes.every(node=>Math.abs(node.getBoundingClientRect().width-node.parentElement.parentElement.clientWidth)<2)),'Every loaded sprite retains the gallery scale');
            await page.locator('#held_gallery').screenshot({path:path.join(output,'held-material-gallery.png')});
            await page.locator('#held_gallery').evaluate(node=>{fixture.galleryViews.forEach(view=>view.destroy());node.remove();});
        }
        for (const kind of ['attack', 'cast']) {
            await page.evaluate(kind => {
                fixture.hero.actions.push({ category: kind === 'cast' ? 'Cast' : 'Attack', total: 1 });
                jQuery(document).trigger('party_state_rendered', [crawl_party.state]);
                document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation => {
                    animation.pause(); animation.currentTime = kind === 'cast' ? 230 : 180;
                });
            }, kind);
            assert.equal(await page.locator('.first-person-held').getAttribute('data-action'), kind);
            await page.screenshot({path:path.join(output,'held-'+kind+'.png')});
            await page.evaluate(() => document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation => animation.finish()));
            await page.waitForFunction(() => !document.querySelector('.first-person-held').dataset.action);
        }
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.evaluate(() => { fixture.hero.actions.find(action=>action.category==='Attack').total++; jQuery(document).trigger('party_state_rendered',[crawl_party.state]); });
        assert.equal(await page.locator('.first-person-held').evaluate(root=>root.getAnimations({subtree:true}).length),0);
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.evaluate(() => {
            fixture.hero.equipment_profile.slots[1].state='melded';jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        });
        assert.equal(await page.locator('.first-person-held-item[data-side="offhand"]').count(),0);
        await page.evaluate(() => {
            fixture.hero.equipment_profile.slots[1].state='equipped';jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        });
        assert.equal(await page.locator('.first-person-held-item[data-side="offhand"]').count(),1);
        await cameraButton('Look left 45 degrees');
        await page.waitForFunction(()=>document.querySelector('.first-person-compass').textContent==='Facing NW');
        await page.screenshot({path:path.join(output,'dungeon-decor-native.png')});
        await cameraButton('Look right 45 degrees');
        await page.waitForFunction(()=>document.querySelector('.first-person-compass').textContent==='Facing N');
        await page.evaluate(() => { fixture.pack.bindUser('Preview'); fixture.pack.select('illustrated'); });
        await page.waitForTimeout(300);
        const fidelity=await page.evaluate(()=>fixture.scene.build(fixture.player.pos,fixture.player).sprites.map(sprite=>({
            label:sprite.label,sourceArt:sprite.sourceArt,pixelated:sprite.pixelated,width:sprite.image.width,height:sprite.image.height})));
        assert(fidelity.every(sprite=>sprite.pixelated&&sprite.sourceArt==='native'),'3D always retains native pixel art regardless overhead art preference');
        assert.equal(fidelity.find(sprite=>sprite.label==='Orc').width,proof.sprites.find(sprite=>sprite.label==='Orc').imageWidth);
        assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('perspective-materials-v1.png')).length),0);
        await page.screenshot({ path: path.join(output, 'native-with-overhead-hd-selected.png') });
        const featureCloseups=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint'],function(painting){
            const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;
            const painter=painting.create(canvas),scene=fixture.scene.build(fixture.player.pos,fixture.player);
            const shots={};
            function shot(name,x,y,pitch,height){painter.paint(scene,{x,y,angle:-Math.PI/2,pitch,height});shots[name]=canvas.toDataURL();}
            shot('ordinary',8.5,5.15,0,1.1);
            shot('runed',12.5,10.15,0,1.1);
            shot('entrance',12.5,11.95,0,1.1);
            shot('hatch-down',4.5,10.35,-.6,.85);shot('hatch-up',5.5,10.35,.75,1.1);
            shot('shaft',10.5,11.4,-.7,.8);shot('pressure-plate',11.5,10.25,-.7,.8);
            shot('native-trap-inlay',11.5,11.35,-.7,.8);
            shot('water-depth',9.5,7.45,-.5,.8);shot('floor-transition',4.95,11.95,-.85,.8);
            canvas.width=720;
            painter.paint(scene,{x:7,y:12.55,angle:-Math.PI/2,pitch:0,height:1.1});shots['joined-doors-horizontal']=canvas.toDataURL();
            painter.paint(scene,{x:10.55,y:9,angle:Math.PI,pitch:0,height:1.1});shots['joined-doors-vertical']=canvas.toDataURL();
            canvas.width=480;
            painter.paint(scene,{x:11.5,y:12.5,angle:-Math.PI/4,pitch:-Math.atan2(.55,Math.SQRT2),height:.55});shots['diagonal-passage']=canvas.toDataURL();
            const diagonalPick=painter.pick(240,240);
            shot('gold',8.5,8.25,-.78,.62);
            painter.paint(scene,{x:8.12,y:8.05,angle:Math.atan2(7.5-8.05,8.5-8.12),pitch:-.32,height:.24});shots['gold-grazing']=canvas.toDataURL();
            const camera={x:8.5,y:8.25,angle:-Math.PI/2,pitch:-.78,height:.62};
            painter.paint(scene,camera);const goldBefore=painter.pixels();
            const materials=scene.mesh.groups().map(g=>g.material).filter(m=>m.finish==='gold');
            materials.forEach(m=>m.finish=null);painter.paint(scene,camera);const goldAfter=painter.pixels();
            let goldChanged=0;for(let i=0;i<goldBefore.length;i+=4)if(Math.abs(goldBefore[i]-goldAfter[i])+Math.abs(goldBefore[i+1]-goldAfter[i+1])+Math.abs(goldBefore[i+2]-goldAfter[i+2])>5)goldChanged++;
            materials.forEach(m=>m.finish='gold');shot('stack',7.5,8.25,-.78,.62);
            const stackCamera={x:7.5,y:8.25,angle:-Math.PI/2,pitch:-.78,height:.62};
            painter.paint(scene,stackCamera);const stackBefore=painter.pixels();
            const stackMaterials=scene.mesh.groups().map(g=>g.material).filter(m=>m.stackMarker);
            stackMaterials.forEach(m=>m.opacity=0);painter.paint(scene,stackCamera);const stackAfter=painter.pixels();
            let stackChanged=0;for(let i=0;i<stackBefore.length;i+=4)if(Math.abs(stackBefore[i]-stackAfter[i])+Math.abs(stackBefore[i+1]-stackAfter[i+1])+Math.abs(stackBefore[i+2]-stackAfter[i+2])>5)stackChanged++;
            stackMaterials.forEach(m=>delete m.opacity);
            const models=[scene.get(8,3),scene.get(12,8),scene.get(6,10),scene.get(4,10),scene.get(5,10)].map(cell=>cell.model);
            const branch=scene.get(12,10).model,stairCues=[scene.get(8,10),scene.get(9,10)].every(cell=>Boolean(cell.connectorMaterial));
            const loot=[scene.get(8,7).lootModel,scene.get(7,7).lootModel];
            const variants=[scene.get(4,8).model,scene.get(4,9).model,scene.get(5,9).model,scene.get(9,3).model,scene.get(10,3).model,scene.get(11,3).model];
            const joinedHorizontal=[scene.get(6,11).model,scene.get(7,11).model];
            const joinedVertical=[scene.get(9,8).model,scene.get(9,9).model];
            const fixtureModels=[scene.get(4,9).model,scene.get(5,9).model,scene.get(10,10).model,scene.get(11,9).model,scene.get(11,10).model];
            const waterModels=[scene.get(9,5).waterModel,scene.get(10,5).waterModel];
            const blendedFloors=scene.cells.filter(cell=>!cell.fluid&&cell.floorMaterial&&cell.floorMaterial.blended).length;
            painter.destroy();resolve({shots,models,variants,branch,stairCues,loot,goldChanged,stackChanged,joinedHorizontal,joinedVertical,fixtureModels,waterModels,blendedFloors,diagonalPick});
        })));
        for(const [name,data]of Object.entries(featureCloseups.shots))fs.writeFileSync(path.join(output,name+'-model-closeup.png'),Buffer.from(data.split(',')[1],'base64'));
        delete featureCloseups.shots;
        assert(featureCloseups.models.every(model=>model.custom));assert(featureCloseups.models.some(model=>model.runed));assert(featureCloseups.models.some(model=>model.sealed));
        assert(featureCloseups.models.some(model=>model.kind==='clear-door'));
        assert(featureCloseups.branch.custom&&featureCloseups.branch.nativeInset&&featureCloseups.branch.walkable);
        assert(featureCloseups.variants.every(model=>model.custom));assert(featureCloseups.stairCues);assert(featureCloseups.loot[0].coins>1);assert.equal(featureCloseups.loot[0].quantity,null);
        assert(featureCloseups.loot[1].stack);assert(featureCloseups.goldChanged>20,'Gold conductor shader changes actual coin pixels');
        assert(featureCloseups.stackChanged>20,'Raised item-stack marker is visibly distinct');
        for(const pair of [featureCloseups.joinedHorizontal,featureCloseups.joinedVertical]){
            assert(pair[0].joinedAfter&&pair[1].joinedBefore);assert.equal(pair[0].right,1);assert.equal(pair[1].left,0);
            assert.equal(pair[0].open,false);assert.equal(pair[1].open,true);
        }
        assert.deepEqual(featureCloseups.diagonalPick,{x:12,y:11},'Native diagonal route remains pickable between chamfered corner walls');
        assert(featureCloseups.fixtureModels.every(model=>model.custom));
        assert(featureCloseups.fixtureModels.some(model=>model.kind==='shaft'));
        assert(featureCloseups.waterModels[1].depth>featureCloseups.waterModels[0].depth);
        assert(featureCloseups.waterModels.some(model=>model.banks>0||model.steps>0));
        assert(featureCloseups.blendedFloors>0,'Native moss/stone families use shared transition feathering');
        const shadows=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint'],function(painting){
            const c=document.createElement('canvas');c.width=480;c.height=320;
            const painter=painting.create(c),scene=fixture.scene.build(fixture.player.pos,fixture.player);
            const camera={x:8.5,y:8.5,angle:-Math.PI/2,pitch:-0.15,height:1.1};
            painter.paint(scene,camera);const a=painter.pixels();
            scene.shadows=false;painter.paint(scene,camera);const b=painter.pixels();
            let darker=0,total=0;for(let i=0;i<a.length;i+=4){const delta=b[i]+b[i+1]+b[i+2]-a[i]-a[i+1]-a[i+2];if(delta>12)darker++;total+=Math.max(0,delta);}
            const stats={...painter.stats};painter.destroy();resolve({darker,total,stats});
        })));
        assert(shadows.darker>150,'Cast and contact shadows darken visible surfaces');
        assert(shadows.stats.triangles>100);
        const surfaceDetail=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint'],function(painting){
            const canvas=document.createElement('canvas');canvas.width=480;canvas.height=320;
            const painter=painting.create(canvas),scene=fixture.scene.build(fixture.player.pos,fixture.player);
            const camera={x:8.5,y:8.5,angle:-Math.PI/2,pitch:-.1,height:1.1};
            painter.paint(scene,camera);const detailed=painter.pixels();
            const maps=scene.sprites.filter(s=>s.material.normalMap).length;
            scene.sprites.forEach(s=>{s.material.normalStrength=0;s.material.specularGain=0;});
            painter.paint(scene,camera);const flat=painter.pixels();
            let changed=0;for(let i=0;i<flat.length;i+=4)if(Math.abs(flat[i]-detailed[i])+Math.abs(flat[i+1]-detailed[i+1])+Math.abs(flat[i+2]-detailed[i+2])>1)changed++;
            painter.destroy();resolve({changed,maps});
        })));
        assert(surfaceDetail.maps>=6);assert(surfaceDetail.changed>30,'Native sprite surface maps affect actual lit pixels');
        const fluids=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint'],function(painting){
            const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
            const painter=painting.create(canvas),scene=fixture.scene.build(fixture.player.pos,fixture.player);
            const camera={x:9.5,y:5.5,angle:Math.PI/2,pitch:-0.85,height:1.1};
            scene.phase=0;painter.paint(scene,camera);const a=painter.pixels();
            scene.phase=4;painter.paint(scene,camera);const b=painter.pixels();
            let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>3)changed++;
            const types=[{kind:'water',changed:changed,image:canvas.toDataURL()}];
            for(const [kind,x] of [['honey',7.5],['lava',12.5]]){
                const camera={x:x,y:10.2,angle:-Math.PI/2,pitch:-.85,height:1.1};
                scene.phase=0;painter.paint(scene,camera);const a=painter.pixels();
                scene.phase=kind==='honey'?30:5;painter.paint(scene,camera);const b=painter.pixels();
                let delta=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>2)delta++;
                types.push({kind,changed:delta,image:canvas.toDataURL()});
            }
            const result={changed,types,image:types[0].image,water:scene.get(9,5).floorMaterial.fluid.kind,lava:scene.get(12,9).floorMaterial.fluid.kind,honey:scene.get(7,9).floorMaterial.fluid.kind,
                props:scene.cells.filter(c=>c.prop).map(c=>c.prop.kind),fountain:scene.sprites.some(s=>s.prop&&s.prop.kind==='fountain'),
                statue:scene.sprites.find(s=>s.prop&&s.prop.kind==='statue')?.elevation,
                up:scene.surfaceHeight(5.5,7.5),down:scene.surfaceHeight(6.5,4.5),
                eye:scene.viewerEye,head:scene.shadowSprites[0].height+scene.shadowSprites[0].elevation};
            painter.destroy();resolve(result);
        })));
        fs.writeFileSync(path.join(output,'fluid-detail.png'),Buffer.from(fluids.image.split(',')[1],'base64'));delete fluids.image;
        for(const type of fluids.types){fs.writeFileSync(path.join(output,type.kind+'-detail.png'),Buffer.from(type.image.split(',')[1],'base64'));delete type.image;}
        fs.writeFileSync(path.join(output,'fluid-proof.json'),JSON.stringify(fluids,null,2));
        assert(fluids.types.every(type=>type.changed>10),'Water, lava and honey each show shader surface motion: '+JSON.stringify(fluids.types));
        assert(fluids.changed>20,'Fluid wave lighting changes actual GPU pixels: '+JSON.stringify(fluids));
        assert.equal(fluids.water,'water');assert.equal(fluids.lava,'lava');assert.equal(fluids.honey,'honey');assert(fluids.fountain,'Ordinary fountains retain their native sprite');
        assert(fluids.props.includes('statue')&&fluids.props.includes('tree')&&fluids.props.includes('altar'));
        assert(fluids.statue>0);assert(fluids.up>0&&fluids.down<0);assert(fluids.eye<fluids.head);
        const transparency=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint'],function(painting){
            const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
            const painter=painting.create(canvas),scene=fixture.scene.build(fixture.player.pos,fixture.player);
            const camera={x:10.5,y:9.5,angle:-Math.PI/2,pitch:0,height:1.1};
            painter.paint(scene,camera);const clear=painter.pixels(),pick=painter.pick(160,120);
            const glass=scene.mesh.groups().filter(group=>group.material.opacity<1);
            glass.forEach(group=>{group.material.opacity=1;group.material.transmission=0;});
            painter.paint(scene,camera);const opaque=painter.pixels();
            let changed=0;for(let i=0;i<clear.length;i+=4)if(Math.abs(clear[i]-opaque[i])+Math.abs(clear[i+1]-opaque[i+1])+Math.abs(clear[i+2]-opaque[i+2])>15)changed++;
            painter.destroy();resolve({changed,pick,materials:glass.length});
        })));
        assert(transparency.materials>=2);assert(transparency.changed>50,'Glass/crystal passes preserve the visible scene behind them');
        assert.deepEqual(transparency.pick,{x:10,y:7},'Visible glass retains collision/action picking');
        for(const species of ['Spriggan','Troll']){
            await page.evaluate(species=>{fixture.player.species=species;window.jQuery(document).trigger('player_state_changed');},species);
            await page.waitForTimeout(80);await page.screenshot({path:path.join(output,'viewpoint-'+species.toLowerCase()+'.png')});
            const eye=Number(await canvas.getAttribute('data-eye-height'));
            if(species==='Spriggan')assert(eye<proof.eye);else assert(eye>proof.eye);
        }
        await page.evaluate(()=>{fixture.player.species='Human';window.jQuery(document).trigger('player_state_changed');});
        await cameraButton('Look right 45 degrees');
        assert.equal(await page.evaluate(()=>document.activeElement.id),'first_person_dungeon','Pointer camera controls restore native movement focus');
        await page.waitForFunction(() => document.querySelector('.first-person-compass').textContent === 'Facing NE');
        const bounds = await canvas.boundingBox();
        await page.mouse.move(bounds.x + 200, bounds.y + 200); await page.mouse.down();
        await page.mouse.move(bounds.x + 300, bounds.y + 200); await page.mouse.up();
        assert.equal(await page.evaluate(() => fixture.clicks.length), 0, 'Camera gestures cannot move or attack');
        await page.mouse.move(bounds.x+300,bounds.y+200);await page.mouse.down();
        await page.mouse.move(bounds.x+300,bounds.y+250);await page.mouse.up();
        await page.waitForFunction(()=>Number(document.getElementById('first_person_dungeon').dataset.cameraPitch)<-0.15);
        assert.equal(await page.evaluate(()=>fixture.clicks.length),0,'Vertical look cannot move or attack');
        await cameraButton('Level the camera');
        // Restore north, then right-click the known closed door in the central ray.
        await page.evaluate(() => { fixture.player.pos = { x: 8, y: 7 }; window.jQuery(document).trigger('player_state_changed');
            fixture.renderer.set_view_center(8, 7); });
        await page.waitForFunction(() => document.querySelector('.first-person-compass').textContent === 'Facing N');
        await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 }, button: 'right' });
        assert.deepEqual(await page.evaluate(() => fixture.clicks.at(-1)), { type: 'cell_contextmenu', cell: { x: 8, y: 3 } });
        for (const mode of [7, 8]) {
            await page.evaluate(mode => { fixture.mode = mode; window.jQuery(document).trigger('game_input_changed'); }, mode);
            assert(await canvas.isHidden(), `Input mode ${mode} uses overhead`);
        }
        await page.evaluate(() => { fixture.mode = 1; window.jQuery(document).trigger('game_input_changed'); });
        assert(await canvas.isVisible());
        for(const mode of [2,3,4]){
            await page.evaluate(mode=>{fixture.mode=mode;window.jQuery(document).trigger('game_input_changed');},mode);
            await canvas.waitFor({state:'visible'});assert(await page.locator('.first-person-targeting-bar').isVisible());
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            const rect=await canvas.boundingBox();await page.mouse.move(rect.x+rect.width*.45,rect.y+rect.height*.55);
            await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
            await page.waitForFunction(()=>fixture.sent.some(message=>message.type==='target_cursor'));
            const targetDecal=await page.evaluate(()=>new Promise(resolve=>require(['game/view_data','game/enums'],function(view,enums){
                view.place_cursor(enums.CURSOR_MOUSE,{x:8,y:5});
                requestAnimationFrame(()=>resolve(Boolean(fixture.scene.build(fixture.player.pos,fixture.player).get(8,5).targetMaterial)));
            })));
            assert(targetDecal,'Native cursor produces a 3D floor targeting decal');
            if (mode === 2) {
                const hover = await page.evaluate(() => new Promise(resolve => require(['game/first-person-highlight'], function (highlight) {
                    const canvas = document.getElementById('first_person_dungeon');
                    const scene = fixture.scene.build(fixture.player.pos, fixture.player);
                    const rat = scene.sprites.find(sprite => sprite.label === 'Rat');
                    resolve(highlight.project({ x: fixture.player.pos.x+.5, y: fixture.player.pos.y+.5, angle: -Math.PI/2,
                        pitch: Number(canvas.dataset.cameraPitch), height: Number(canvas.dataset.eyeHeight) },
                        [rat.x+.5, (rat.elevation||0)+rat.height*.6, rat.y+.5], canvas.width, canvas.height));
                })));
                const size = await canvas.evaluate(node=>({width:node.width,height:node.height}));
                await page.mouse.move(rect.x+hover.x/size.width*rect.width,rect.y+hover.y/size.height*rect.height);
                await page.waitForFunction(()=>document.querySelector('.first-person-highlight').dataset.target==='7:5');
                await page.evaluate(() => new Promise(resolve => require(['game/view_data','game/enums'], function (view,enums) {
                    fixture.ratBg = enums.prepare_bg_flags(fixture.map.get(7,5).t.bg).value;
                    fixture.map.merge([{x:7,y:5,t:{bg:fixture.ratBg+0x02000000}}]);
                    view.place_cursor(enums.CURSOR_MOUSE,{x:7,y:5}); resolve();
                })));
                await page.waitForFunction(()=>document.querySelector('.first-person-highlight').dataset.range==='out');
                assert.match(await page.locator('.first-person-targeting-bar').innerText(),/out of range/);
                assert.equal(await page.locator('.first-person-targeting-reticle').innerText(),'×');
                await page.screenshot({path:path.join(output,'hover-out-of-range.png')});
                await page.evaluate(()=>fixture.map.merge([{x:7,y:5,t:{bg:fixture.ratBg}}]));
                await page.waitForFunction(()=>document.querySelector('.first-person-highlight').dataset.range==='unknown');
            }
            await page.getByRole('button',{name:'Overhead aim',exact:true}).click();assert(await canvas.isHidden());
            await page.getByRole('button',{name:'Back to 3D aim',exact:true}).click();assert(await canvas.isVisible());
        }
        await page.evaluate(()=>{fixture.mode=1;window.jQuery(document).trigger('game_input_changed');});
        const actorLayers=await page.evaluate(()=>{
            const at=()=>fixture.scene.build(fixture.player.pos,fixture.player).sprites.find(s=>s.x===7&&s.y===5&&s.layer==='actor');
            const before=at();fixture.map.merge([{x:7,y:5,t:{cloud:fixture.main.CLOUD_GREY_SMOKE}}]);const after=at();
            const effects=fixture.scene.build(fixture.player.pos,fixture.player).sprites.filter(s=>s.x===7&&s.y===5&&s.layer==='cloud');
            fixture.map.merge([{x:9,y:6,t:{trans:true}}]);
            const translucent=fixture.scene.build(fixture.player.pos,fixture.player).sprites.find(s=>s.label==='Orc'&&s.layer==='actor');
            const data=translucent.image.getContext('2d').getImageData(0,0,translucent.image.width,translucent.image.height).data;
            let alpha=0;for(let i=3;i<data.length;i+=4)alpha=Math.max(alpha,data[i]);
            fixture.map.merge([{x:7,y:5,t:{cloud:0}},{x:9,y:6,t:{trans:false}}]);
            return {before:before.height,after:after.height,cloud:effects[0].height,cloudShadow:effects[0].castsShadow,alpha};
        });
        assert.equal(actorLayers.before,actorLayers.after);assert(actorLayers.cloud>actorLayers.after);
        assert.equal(actorLayers.cloudShadow,false);assert(actorLayers.alpha<160);
        const sensing=await page.evaluate(()=>new Promise(resolve=>require(['game/enums'],function(enums){
            fixture.map.merge([{x:8,y:1,mf:enums.MF_MONS_HOSTILE,t:{bg:fixture.tiles.DNGN_UNSEEN+0x20000,fg:fixture.main.MONS_SENSED_TOUGH},mon:{name:'Private hidden identity'}}]);
            window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>resolve(document.querySelector('.first-person-sensing')?.textContent||'')));
        })));
        assert(!sensing.includes('Private hidden identity'));
        assert(await page.locator('.first-person-sensing').isVisible());
        assert(await page.locator('.first-person-atlas').isHidden(),'Sensing must not masquerade as a mapping scroll');

        await page.evaluate(() => { fixture.renderer.set_ui_state(2); window.jQuery(document).trigger('game_ui_changed'); });
        assert(await canvas.isHidden());
        await page.evaluate(() => { fixture.renderer.set_ui_state(0); window.jQuery(document).trigger('game_ui_changed'); });
        assert(await canvas.isVisible());
        await page.evaluate(() => { fixture.renderer.set_view_center(7, 7); }); assert(await canvas.isHidden());
        await page.evaluate(() => { fixture.renderer.set_view_center(8, 7); }); assert(await canvas.isVisible());
        await page.getByRole('button', { name: 'Inventory', exact:true }).focus();
        const keysBefore = await page.evaluate(() => fixture.keys); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => fixture.keys), keysBefore, 'Menu launcher keys cannot reach native input');
        await page.keyboard.press('Escape');
        await page.evaluate(()=>{
            fixture.overheadPaints=0;fixture.originalCellPaint=fixture.renderer.render_grid_cell;
            fixture.renderer.render_grid_cell=function(){fixture.overheadPaints++;return fixture.originalCellPaint.apply(this,arguments);};
            fixture.renderer.render_view();
        });
        assert.equal(await page.evaluate(()=>fixture.overheadPaints),0,'Hidden overhead terrain must not paint or request optional artwork');
        await page.getByRole('button',{name:'Inventory',exact:true}).click();
        await page.getByRole('button',{name:'Map',exact:true}).click();
        assert(await page.locator('.first-person-atlas').isVisible());assert(await canvas.isHidden());
        assert(await page.evaluate(()=>fixture.overheadPaints>0),'Returning to the overhead view forces a complete current paint');
        await page.evaluate(()=>{fixture.renderer.render_grid_cell=fixture.originalCellPaint;});
        assert.equal(await page.evaluate(()=>fixture.presentation.current()),'first_person');
        await page.getByRole('button',{name:'Close dungeon atlas'}).click();assert(await canvas.isVisible());
        await page.evaluate(()=>{
            fixture.map.merge(Array.from({length:20},(_,i)=>({x:16+i,y:1,t:{bg:fixture.tiles.FLOOR_NORMAL+0x20000},mon:{name:'Mapped secret'}})));
        });
        await page.locator('.first-person-atlas').waitFor({state:'visible'});
        const mapping=await page.evaluate(()=>new Promise(resolve=>require(['game/dungeon-atlas-model'],function(model){
            const data=model.snapshot(fixture.map);resolve({mapped:data.mapped,hidden:data.cells.filter(cell=>cell.x>=16).every(cell=>!cell.actor)});
        })));
        assert.equal(mapping.mapped,20);assert(mapping.hidden);
        await page.screenshot({path:path.join(output,'mapped-dungeon-atlas.png')});
        await page.getByRole('button',{name:'Close dungeon atlas'}).click();
        await page.reload(); await require('./helpers/fixture-readiness.cjs')(page, output, errors);
        await page.locator('#first_person_dungeon').waitFor({ state: 'visible' });
        const recovery=await page.evaluate(()=>{const c=document.getElementById('first_person_dungeon');
            const gl=c.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context');if(extension){extension.loseContext();return true;}return false;});
        if(recovery)await page.waitForFunction(()=>document.getElementById('first_person_dungeon')?.dataset.backend==='raycast');
        if(recovery){
            const fallback=await page.evaluate(()=>{
                const scene=fixture.scene.build(fixture.player.pos,fixture.player);
                return scene.cells.filter(cell=>cell.fixture).map(cell=>({kind:cell.fixture.kind,
                    nativeInlay:cell.floor.image!==cell.floorMaterial.image,
                    opaque:Array.from(cell.floor.pixels).every((value,index)=>index%4!==3||value===255)}));
            });
            assert(fallback.length>=5);assert(fallback.every(cell=>cell.nativeInlay&&cell.opaque),'Software fallback retains composited native trap/hatch/shaft identities');
            await page.screenshot({path:path.join(output,'software-fallback-fixtures.png')});
        }
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        assert.equal(await page.locator('#first_person_dungeon').count(), 0);
        assert.equal(await page.locator('.first-person-toolbar').count(), 0);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ...proof,fidelity,featureCloseups,shadows,surfaceDetail,fluids,transparency,actorLayers,sensing,mapping, errors, passed: true }, null, 2));
        console.log('First-person browser checks passed:', JSON.stringify(proof));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
