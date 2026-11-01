const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function fixture() {
    const sent = [], events = [], subscriptions = new Map(), cells = new Map();
    const state = { mode: 1, ui: 0, enabled: true, watching: false, succeed: true, pick: {x:1,y:1} };
    const view = { cursor_locs: [] }, document = {};
    const canvas = { addEventListener(){},removeEventListener(){},width:400,height:200,classList:{toggle(){},remove(){}},
        getBoundingClientRect:()=>({left:10,top:20,width:200,height:100}) };
    cells.set('1:1',{x:1,y:1,t:{bg:{value:2},ov:[]},mon:{name:'Rat'},visible:true});
    cells.set('2:2',{x:2,y:2,t:{bg:{value:2},ov:[]},mon:{name:'Hidden'},visible:false});
    const $ = target => ({ on(names,callback){subscriptions.set(names,callback);return this;},off(){},
        trigger(event){events.push({target,event});} });
    $.Event = (type,fields)=>({type,...fields});
    const enums = { mouse_mode:{COMMAND:1,TARGET:2,TARGET_DIR:3,TARGET_PATH:4}, ui:{NORMAL:0,VIEW_MAP:2}, CURSOR_MOUSE:0,
        prepare_bg_flags:value=>typeof value==='object'?value:{value} };
    const deps = { jquery:$,comm:{send_message(msg,packet){sent.push({msg,packet});return state.succeed;}},
        client:{is_watching:()=>state.watching},'./game-context':{get_input_mode:()=>state.mode,get_ui_state:()=>state.ui},
        './map_knowledge':{get:(x,y)=>cells.get(x+':'+y),visible:entry=>Boolean(entry?.visible)},
        './view_data':view,'./enums':enums,'./tileinfo-dngn':{RAY_OUT_OF_RANGE:999} };
    let module;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/first-person-targeting.js'),'utf8'),{
        document,define(names,factory){module=factory(...names.map(name=>deps[name]));}
    });
    const eventTarget={}, tactical=[];
    const api=module.create({canvas,eventTarget,enabled:()=>state.enabled,pick:(x,y)=>{state.pixel=[x,y];return state.pick;},
        onTacticalChange:value=>tactical.push(value)});
    const pointer={clientX:60,clientY:45,button:0};
    const activate = (mode=2)=>{state.mode=mode;api.sync();};
    return {api,state,sent,events,cells,view,pointer,activate,tactical,eventTarget,module};
}
test('only native target modes aim; pointer coordinates use the render buffer and duplicate sends are suppressed',()=>{
    const f=fixture();assert(f.api.point(f.pointer));assert.equal(f.api.snapshot().hovering,true);assert.equal(f.sent.length,0);
    for(const mode of [2,3,4]){
        f.activate(mode);assert(f.api.point(f.pointer));assert.deepEqual(f.state.pixel,[100,50]);
        assert.equal(f.sent.at(-1).msg,'target_cursor');assert.equal(f.sent.at(-1).packet.x,1);
        const count=f.sent.length;f.api.point(f.pointer);assert.equal(f.sent.length,count);
    }
    assert.equal(f.sent.length,3);
});
test('confirmation dispatches the existing native cell event and does not simulate spell or ranged rules',()=>{
    const f=fixture();f.activate();f.cells.get('1:1').t.bg.OOR=true;f.view.cursor_locs[0]={x:1,y:1};
    assert.equal(f.api.snapshot().range,'out');assert(f.api.confirm(f.pointer));
    assert.equal(f.events.length,1);assert.equal(f.events[0].target,f.eventTarget);
    assert.equal(f.events[0].event.type,'cell_click');assert.equal(f.events[0].event.which,1);
    assert.equal(f.events[0].event.cell.x,1);
    assert(!f.sent.some(message=>message.msg==='click_cell'),'Only mouse_control may produce native action packets');
});
test('unknown/nonvisible picks, spectators, hidden view context and context-menu clicks cannot aim or confirm',()=>{
    const f=fixture();f.activate();f.state.pick={x:2,y:2};assert(!f.api.point(f.pointer));assert(!f.api.confirm(f.pointer));
    f.state.pick={x:1,y:1};f.state.watching=true;assert(!f.api.point(f.pointer));
    f.state.watching=false;f.state.enabled=false;assert(!f.api.point(f.pointer));
    f.state.enabled=true;f.state.ui=2;assert(!f.api.confirm(f.pointer));
    f.state.ui=0;assert(!f.api.confirm({...f.pointer,button:2}));assert(!f.api.confirm({...f.pointer,ctrlKey:true}));
    assert.equal(f.sent.length,0);assert.equal(f.events.length,0);
});
test('overhead aim is reversible within the same native prompt and resets on prompt exit',()=>{
    const f=fixture();f.activate();f.api.setTactical(true);assert(f.api.tactical());assert(!f.api.point(f.pointer));
    assert.equal(f.api.snapshot().mode,'target');f.api.setTactical(false);assert(f.api.point(f.pointer));
    f.api.setTactical(true);f.state.mode=1;f.api.sync();assert(!f.api.tactical());assert(!f.api.active());
    assert.deepEqual(f.tactical,[true,false,true,false]);
});
test('cancel uses native Escape and a failed cursor send is not cached or replayed',()=>{
    const f=fixture();assert.equal(f.api.cancel(),false);f.activate();
    f.state.succeed=false;f.api.point(f.pointer);f.api.point(f.pointer);assert.equal(f.sent.length,2);
    f.state.succeed=true;f.api.point(f.pointer);f.api.point(f.pointer);assert.equal(f.sent.length,3);
    assert(f.api.cancel());assert.equal(f.sent.at(-1).msg,'key');assert.equal(f.sent.at(-1).packet.keycode,27);
    f.api.destroy();assert(!f.api.point(f.pointer));assert(!f.api.active());
});
test('range warnings belong only to the acknowledged native cursor, never the previously hovered creature',()=>{
    const f=fixture();f.activate();f.cells.get('1:1').t.bg.OOR=true;f.view.cursor_locs[0]={x:1,y:1};
    assert.equal(f.api.snapshot().range,'out');
    f.cells.set('3:3',{x:3,y:3,t:{bg:{value:2},ov:[]},mon:{name:'Orc'},visible:true});
    f.state.pick={x:3,y:3};f.api.point(f.pointer);
    assert.equal(f.api.snapshot().range,'unknown');assert.equal(f.api.snapshot().acknowledged,false);
    f.view.cursor_locs[0]={x:3,y:3};f.api.sync({type:'map_cursor_changed'});
    assert.equal(f.api.snapshot().range,'unknown');assert.equal(f.api.snapshot().acknowledged,true);
});

test('passive ray hover is read-only and never inherits range or cursor confirmation from a prior prompt',()=>{
    const f=fixture();f.cells.get('1:1').t.bg.OOR=true;f.view.cursor_locs[0]={x:1,y:1};
    assert(f.api.point(f.pointer));const state=f.api.snapshot();assert(state.hovering);assert(!state.active);assert(!state.acknowledged);assert.equal(state.range,'unknown');assert.equal(f.sent.length,0);assert.equal(f.events.length,0);
    f.cells.get('1:1').visible=false;f.api.sync();assert.equal(f.api.snapshot().location,null);
});
