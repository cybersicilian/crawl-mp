const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
test('server mode is shared by expedition and clears between games',()=>{
    const events=new Map(),changes=[],document={documentElement:{dataset:{}}};let handler,mode;
    const $=()=>({on(names,fn){for(const name of names.split(' '))events.set(name.split('.')[0],fn);},
        trigger(name,args){changes.push([name,...args]);}});
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/scripts/expedition-presentation.js'),'utf8'),{
        document,define(deps,factory){mode=factory($,{register_handlers(value){handler=value.game_presentation;}});}
    });
    assert.equal(mode.current(),'overhead');
    handler({mode:'first_person',expedition_id:'saved-a'});
    assert.equal(mode.current(),'first_person');assert.equal(mode.identifier(),'saved-a');
    assert.equal(document.documentElement.dataset.expeditionView,'first_person');
    events.get('game_cleanup')();assert.equal(mode.current(),'overhead');assert.equal(mode.identifier(),null);
    assert.equal(document.documentElement.dataset.expeditionView,'overhead');
    handler({mode:'first_person',expedition_id:'saved-b'});events.get('game_preinit')();
    assert.equal(mode.current(),'overhead');
    handler({mode:'invalid'});assert.equal(mode.current(),'overhead');
    assert.equal(changes[0][1],'first_person');
});
