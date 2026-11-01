/* Light protocol/known-terrain contract tests; no browser or native execution. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
let routes;
vm.runInNewContext(fs.readFileSync(path.join(root, 'game_data/static/route-plan.js'), 'utf8'), {
    define(deps, factory) { routes = factory(); }
});
function fixture() {
    const cells = new Map(), sent = [], subscribers = {}, comm = {handle_message() {}}, browser = {};
    const party = {controlled_slot: 0, floor: 'D:1', members: [
        {slot: 0, pos: {x: 0, y: 0}, turns: 0, hp: 30, alive: true, can_act: true, activity: ''},
        {slot: 1, pos: {x: 3, y: 1}, turns: 0, hp: 18, alive: true, can_act: true, on_same_level: true}]};
    let mode = 1, clock = 0, progress = 0, onKey = () => {};
    const map = {get: (x,y) => cells.get(x+','+y) || {x,y}, visible: cell => Boolean(cell.visible),
        bounds: () => ({left:0,top:0,right:3,bottom:1})};
    const enums = {MF_STAIR_DOWN: 13, mouse_mode: {NORMAL:0,COMMAND:1,MORE:5,PROMPT:7}};
    const monsters = {contacts: () => [...cells.values()].filter(cell => cell.mon).map(cell => ({
        ...cell.mon, x: cell.x, y: cell.y, perception: cell.visible ? 'visible' : 'remembered'}))};
    const modules = {'game/map_knowledge':map,'game/enums':enums,'game/route-plan':routes,'game/monster_list':monsters,
        'game/game-context':{get_input_mode:()=>mode},comm};
    const requireModule = name => modules[name];
    requireModule.s = {contexts:{_:{defined:modules}}};
    const window = {crawl_party:{state:party}};
    const page = {async evaluate(fn,arg) {
        return vm.runInNewContext('('+fn.toString()+')(argument)',{window,require:requireModule,argument:arg});
    },async waitForFunction(fn,arg) {
        assert(await this.evaluate(fn,arg),'A native command must reach the observable completion fence');
    },async waitForTimeout(ms) {
        clock+=ms;
        if (party.members[0].activity === 'explore') {
            cells.set('1,0',{x:1,y:0,route_safe:true,mf:13,visible:true}); progress++;
        }
    }};
    const target = {page,slot:0};
    const io = {
        async foreground(){},async ready(){},async state(){return structuredClone(party);},
        async send(page,msg,fields) {
            sent.push({msg,...fields});
            if (msg==='party_activity' && fields.action==='cancel') party.members[0].activity='';
        },async key(page,code) {
            if (page !== target.page) return page.sendKey(code);
            sent.push({msg:'key',code});
            const hero=party.members[0];
            if(code===111)hero.activity='explore';
            else if(code===108){hero.pos={x:1,y:0};hero.turns++;}
            else if(code===62)party.floor='D:2';
            else if(code===46)hero.turns++;
            else if(code===83)mode=1;
            else if(code===32)mode=1;
            comm.handle_message({msg:'input_mode',mode:1});
            onKey(code);
        }
    };
    page.sendKey = code => io.key(page, code);
    const exports = {exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'helpers/native-stair-navigation.cjs'),'utf8'), {
        module:exports,require:name=>name==='node:assert/strict'?assert:name==='./browser-foreground.cjs'?io:io,
        Date:{now:()=>clock},setTimeout
    });
    cells.set('0,0',{x:0,y:0,route_safe:true,mf:1,visible:true});
    return {api:exports.exports,cells,party,target,io,sent,window,advance(ms){clock+=ms;},setMode(value){mode=value;},
        onKey(callback){onKey=callback;},emit(packet){comm.handle_message(packet);}};
}
test('ordinary exploration cancels before a known stair route and uses native movement and descent',async()=>{
    const f=fixture(), evidence={};
    const result=await f.api.reachLowerFloor(f.target,[f.target],evidence);
    assert(result.passed);assert.equal(result.destination.floor,'D:2');
    assert.deepEqual(f.sent.map(row=>row.code||row.action),[111,'cancel',108,62]);
    assert.equal(result.ordinaryPlay,true);assert.equal(result.commands.length,2);
});
test('native terrain safety, occupied peers and absent cells constrain stair routes',async()=>{
    const f=fixture();
    f.cells.set('1,0',{x:1,y:0,route_safe:false,mf:13,visible:true});
    assert.equal((await f.api.inspect(f.target.page)).down,null,'Unsafe native terrain is not walkable');
    f.cells.set('1,0',{x:1,y:0,route_safe:true,mf:13,visible:true});
    f.party.members[1].pos={x:1,y:0};
    assert.equal((await f.api.inspect(f.target.page)).down,null,'A same-floor peer blocks that route');
    f.party.members[1].on_same_level=false;
    assert.equal((await f.api.inspect(f.target.page)).down.length,1,'The same coordinates on another floor do not block movement');
    f.cells.delete('1,0');assert.equal((await f.api.inspect(f.target.page)).down,null);
});
test('only currently visible hostiles become combat goals',async()=>{
    const f=fixture();f.cells.set('1,0',{x:1,y:0,route_safe:true,mf:1,visible:false,mon:{att:0,name:'Orc'}});
    assert.equal((await f.api.inspect(f.target.page)).enemies,0);
    f.cells.get('1,0').visible=true;
    assert.equal((await f.api.inspect(f.target.page)).enemy.goal.name,'Orc');
    f.cells.get('1,0').mon.att=4;assert.equal((await f.api.inspect(f.target.page)).enemies,0);
});
test('canonical non-threatening contacts and native out-of-range memory cannot stall stair exploration',async()=>{
    const f=fixture();
    f.cells.set('1,0',{x:1,y:0,route_safe:false,mf:2,visible:true,
        mon:{att:0,name:'plant',non_threatening:true}});
    assert.equal((await f.api.inspect(f.target.page)).enemies,0,'A native no-experience plant is not a combat goal');
    f.cells.get('1,0').mon={att:0,name:'Orc',non_threatening:false};
    f.cells.get('1,0').t={bg:{OOR:true}};
    assert.equal((await f.api.inspect(f.target.page)).enemies,0,'Remembered OOR map actors are not currently visible threats');
    f.cells.get('1,0').t.bg.OOR=false;
    assert.equal((await f.api.inspect(f.target.page)).enemies,1,'A real unreachable visible hostile remains a threat');
});
test('unexpected native prompts fail instead of guessing an answer',async()=>{
    const f=fixture();f.setMode(7);
    await assert.rejects(f.api.reachLowerFloor(f.target,[f.target],{}),/Unexpected native prompt/);
    assert.equal(f.sent.length,0);
});
test('another hero shared-experience MORE prompt is acknowledged by its actual owner during exploration',async()=>{
    const f=fixture(), peer=fixture(); peer.target.slot=1; peer.party.controlled_slot=1;
    f.onKey(code=>{if(code===108)peer.setMode(5);});
    const result=await f.api.reachLowerFloor(f.target,[f.target,peer.target],{});
    assert(result.passed);assert.deepEqual(peer.sent.map(row=>row.code),[32]);
    assert.equal(peer.party.members[1].turns,0,'An owner prompt acknowledgement spends no peer turn');
});
test('an explicit native command rejection fails immediately even if a stale turn snapshot advances',async()=>{
    const f=fixture();f.onKey(code=>{if(code===108)f.emit({msg:'game_action_error',message:'Another hero is finishing an action. Your view is unchanged.'});});
    await assert.rejects(f.api.reachLowerFloor(f.target,[f.target],{}),/Native preparation command rejected/);
});
test('bounded preparation fails when no ordinary staircase is discovered',async()=>{
    const f=fixture();f.setMode(0);
    await assert.rejects(f.api.reachLowerFloor(f.target,[f.target],{}, {budgetMs:250}),/fixed preparation budget/);
    assert.equal(f.sent.length,0);
});
