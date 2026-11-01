/* Actual menu, exact tile previews, shared quickbar and native action gates. */
const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function menus(page,output){
    const before=await page.evaluate(()=>fixture.sent.length);
    await page.evaluate(()=>new Promise(resolve=>require(['game/tileinfo-gui'],function(gui){
        fixture.menuBackup={state:{...crawl_party.state},hero:{...fixture.hero},inv:fixture.player.inv};
        const main=fixture.main;
        function art(index){const i=main.get_tile_info(index);return {texture:'main',layers:[{sx:i.sx,sy:i.sy,w:i.ex-i.sx,h:i.ey-i.sy,ox:i.ox+16-i.w/2,oy:i.oy+32-i.h,ymax:32}]};}
        const potion=main[Object.keys(main).find(key=>/^POTION_/.test(key)&&Number.isInteger(main[key]))];
        const ring=main[Object.keys(main).find(key=>/^RING_/.test(key)&&Number.isInteger(main[key]))];
        fixture.hero.inventory=[{slot:0,letter:'a',name:'Singing Sword',kind_name:'weapon',qty:1,equipped:true,description:'An ancient blade with a voice of its own.'},
            {slot:1,letter:'b',name:'buckler',kind_name:'armour',qty:1,equipped:true,description:'A light shield.'},
            {slot:2,letter:'c',name:'potion of curing',kind_name:'potion',qty:3,description:'Restores health and cures poison.'},
            {slot:3,letter:'d',name:'ruby ring',kind_name:'jewellery',qty:1,description:'An engraved band set with a red stone.'}];
        fixture.hero.equipment_profile={...fixture.hero.equipment_profile,items:[main.UNRAND_SINGING_SWORD,main.ARM_BUCKLER,potion,ring].map((index,inv_slot)=>({inv_slot,art:art(index)}))};
        fixture.hero.spells=[{id:99,letter:'f',name:'Fireball',schools:'Conjuration/Fire',level:5,mp_cost:3,tile:gui.FIREBALL,quick_cast:true,casting_cost:{resource:'mp',amount:3,payable:true},desc:'An explosive fireball.'}];
        Object.assign(fixture.hero,{alive:true,xl:12,gold:864,mp:5,mp_max:5,abilities:[]});
        fixture.player.inv=Object.fromEntries(fixture.hero.inventory.map((item,i)=>[item.slot,{...item,tile:[[main.UNRAND_SINGING_SWORD,main.ARM_BUCKLER,potion,ring][i]]}]));
        Object.assign(crawl_party.state,{snapshot_version:2,inventory_use:true,inventory_secondary:true});
        jQuery(document).trigger('game_input_changed',[1]);jQuery(document).trigger('party_state_rendered',[crawl_party.state]);resolve();
    })));
    assert.equal(await page.locator('#dungeon_viewport > .first-person-toolbar').count(),0,'Gray camera strip is absent from the playfield');
    const camera=await page.locator('#first_person_dungeon').getAttribute('data-camera-pitch');
    const rect=await page.locator('#first_person_dungeon').boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
    const optionKey=await page.evaluate(()=>{const target=document.getElementById('first_person_dungeon');const key=new KeyboardEvent('keydown',{key:'Dead',code:'KeyI',altKey:true,bubbles:true,cancelable:true});target.dispatchEvent(key);target.dispatchEvent(new KeyboardEvent('keyup',{key:'Dead',code:'KeyI',altKey:true,bubbles:true,cancelable:true}));return key.defaultPrevented;});
    assert(optionKey,'macOS Option+I uses the physical key even when the OS reports a dead accent key');
    await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+40);await page.mouse.up();
    assert.equal(await page.locator('#first_person_dungeon').getAttribute('data-camera-pitch'),camera,'Opening inventory cancels an in-progress camera drag');
    const dialog=page.locator('dialog.first-person-menu[open]');
    await dialog.getByRole('searchbox').focus();
    const accent=await page.evaluate(()=>{const event=new KeyboardEvent('keydown',{key:'µ',code:'KeyM',altKey:true,bubbles:true,cancelable:true});document.activeElement.dispatchEvent(event);return event.defaultPrevented;});
    assert.equal(accent,false,'Option accents in search remain normal text entry');assert.equal(await dialog.getAttribute('data-section'),'inventory');

    await dialog.locator('.first-person-menu-activate').filter({hasText:'Singing Sword'}).hover();
    assert.equal(await dialog.locator('.first-person-menu-detail h2').innerText(),'Singing Sword');
    assert.equal(await dialog.locator('.first-person-stage-art').getAttribute('data-available'),'true');
    const sword=await dialog.locator('.first-person-stage-art').evaluate(canvas=>canvas.toDataURL());
    await dialog.locator('.first-person-menu-activate').filter({hasText:'potion of curing'}).click();
    assert.equal(await page.evaluate(()=>fixture.sent.length),before,'Selecting an inventory row is passive');
    await dialog.getByRole('button',{name:'Jewelry',exact:true}).click();
    assert.equal(await dialog.locator('.first-person-menu-entry').count(),1);
    assert.equal(await dialog.locator('.first-person-menu-detail h2').innerText(),'ruby ring');
    assert.notEqual(await dialog.locator('.first-person-stage-art').evaluate(canvas=>canvas.toDataURL()),sword,'Actual selected source changes the voxel inspection model');
    await page.keyboard.press('f');
    const favorites=await page.evaluate(()=>new Promise(resolve=>require(['game/quickbar'],quick=>resolve(quick.favorites().map(f=>({kind:f.binding.kind,id:f.binding.id}))))));
    assert.deepEqual(favorites,[{kind:'item',id:3}]);
    await dialog.getByRole('button',{name:'All items',exact:true}).click();
    await dialog.getByRole('searchbox').fill('curing');assert.equal(await dialog.locator('.first-person-menu-entry').count(),1);
    await dialog.getByRole('searchbox').fill('');
    await dialog.locator('.first-person-menu-activate').filter({hasText:'Singing Sword'}).hover();
    await page.screenshot({path:path.join(output,'skyrim-inventory.png')});
    assert.equal(await page.evaluate(()=>fixture.sent.length),before,'Selection, search, category filters, preview and favorites take no native action');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+q');
    assert.equal(await page.locator('dialog.first-person-menu[open]').getAttribute('data-section'),'favorites');
    await page.screenshot({path:path.join(output,'skyrim-favorites.png')});
    await page.keyboard.press('1');
    assert.equal(await page.locator('dialog.first-person-menu[open]').count(),0);
    const item=await page.evaluate(()=>fixture.sent.at(-1));
    assert.equal(item.type,'inv_item_use');assert.equal(item.payload.slot,3);assert.equal(item.payload.expected_slot,0);
    await page.keyboard.press('Alt+m');
    await page.waitForFunction(()=>document.querySelector('.first-person-stage-art').dataset.available==='true');
    await page.screenshot({path:path.join(output,'skyrim-magic.png')});
    await dialog.getByRole('button',{name:'Cast',exact:true}).click();
    const power=await page.evaluate(()=>fixture.sent.at(-1));assert.equal(power.type,'power_action');assert.equal(power.payload.id,99);assert(!power.payload.quick_cast);
    await page.evaluate(()=>new Promise(resolve=>require(['game/quickbar'],function(quick){quick.toggleFavorite({kind:'spell',id:99,quick_cast:true});resolve();})));
    await page.keyboard.press('Alt+q');await page.keyboard.press('Shift+2');
    const aimed=await page.evaluate(()=>fixture.sent.at(-1));assert.equal(aimed.type,'power_action');assert.equal(aimed.payload.id,99);assert(!aimed.payload.quick_cast,'Shift+favorite preserves native manual aiming');
    await page.keyboard.press('Alt+i');
    await dialog.getByRole('button',{name:'Controls',exact:true}).click();
    assert(await dialog.getByRole('button',{name:'Look left 45 degrees',exact:true}).isVisible());
    const position=await page.evaluate(()=>({...fixture.player.pos}));
    await dialog.getByRole('button',{name:'Show full interface',exact:true}).click();
    assert.equal(await page.locator('#dungeon_viewport').getAttribute('data-immersive'),'false');
    await page.getByRole('button',{name:'Inventory',exact:true}).click();
    await dialog.getByRole('button',{name:'Controls',exact:true}).click();
    await dialog.getByRole('button',{name:'Return to immersive view',exact:true}).click();
    assert.equal(await page.locator('#dungeon_viewport').getAttribute('data-immersive'),'true');
    assert.deepEqual(await page.evaluate(()=>fixture.player.pos),position,'Restoring the interface preserves gameplay position');
    await page.setViewportSize({width:390,height:844});await page.keyboard.press('Alt+i');
    assert.equal(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth),false,'Narrow menu has no horizontal overflow');
    await page.screenshot({path:path.join(output,'skyrim-inventory-mobile.png')});await page.keyboard.press('Escape');
    await page.setViewportSize({width:1040,height:760});
    await page.evaluate(()=>new Promise(resolve=>require(['game/quickbar'],function(quick){
        quick.favorites().forEach(f=>quick.toggleFavorite(f.binding));
        Object.keys(fixture.hero).forEach(key=>delete fixture.hero[key]);Object.assign(fixture.hero,fixture.menuBackup.hero);
        crawl_party.state=fixture.menuBackup.state;fixture.player.inv=fixture.menuBackup.inv;
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);resolve();
    })));
    await require('./first-person-external-dialog-browser.cjs')(page,output);
};
