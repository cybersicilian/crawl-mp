const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
function fixture(native){
    const raw={},detail={width:256,height:256},draws=[],calls=[];
    const info={sx:0,sy:0,ex:32,ey:32,w:32,h:32,ox:0,oy:0};
    const atlas={get_tile_info:()=>info,get_img:()=>'main'};
    const art={tile(){calls.push('tile');return detail;},image(){calls.push('image');return {};}};
    const dependencies={'./tile-art-direction':art,'./options':{get:()=>true}};
    let methods;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/cell-renderer-textures.js'),'utf8'),{
        window:{devicePixelRatio:1},document:{getElementById:()=>raw},
        define(deps,factory){methods=factory(...deps.map(dep=>dependencies[dep]||{}));}
    });
    const renderer={native_art:native,x_scale:1,y_scale:1,current_left_overlap:0,current_sy:0,
        ctx:{drawImage(image){draws.push(image);}}};
    methods.draw_tile.call(renderer,1,0,0,atlas);
    return {renderer,draws,calls,raw,detail};
}
test('classic 3D can preserve original atlas pixels without changing other renderers',()=>{
    const native=fixture(true);assert.deepEqual(native.calls,[]);assert.equal(native.draws[0],native.raw);
    assert.equal(native.renderer.ctx.imageSmoothingEnabled,false);
    const ordinary=fixture(undefined);assert.deepEqual(ordinary.calls,['tile']);
    assert.equal(ordinary.draws[0],ordinary.detail);assert.equal(ordinary.renderer.ctx.imageSmoothingEnabled,true);
});
