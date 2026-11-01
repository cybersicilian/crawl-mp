/* Native tile adapter. The generic perspective painter never reads game state. */
define(["./map_knowledge", "./enums", "./tileinfo-dngn", "./tileinfo-main", "./tileinfo-player",
    "./cell_renderer", "./creature-dimensions", "./first-person-materials", "./first-person-mesh", "./first-person-features", "grid-architecture", "./tileinfo-icons", "./view_data", "./game-context", "./first-person-props", "./first-person-fluids", "sprite-surface", "./first-person-door-materials", "./first-person-items", "./first-person-terrain", "./first-person-party", "sprite-subject"],
function (map, enums, tiles, main, playerTiles, cells, dimensions, materials, meshes, features, architecture, icons, view, game, props, fluids, spriteSurface, doors, items, terrain, party, subjects) {
    "use strict";
    var textures = new Map(), names = new Map(), heroes = new Map();
    Object.keys(tiles).forEach(function (name) {
        if (Number.isInteger(tiles[name]) && !names.has(tiles[name])) names.set(tiles[name],name);
    });
    function texture(index) {
        if (textures.has(index)) return textures.get(index);
        var info = tiles.get_tile_info(index);
        if (!info) return null;
        var id = tiles.get_img(index), original = document.getElementById(id);
        if (!original || !original.complete || !original.naturalWidth) return null;
        var size=64,canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        var ctx = canvas.getContext("2d");ctx.imageSmoothingEnabled=false;
        ctx.drawImage(original,info.sx,info.sy,info.ex-info.sx,info.ey-info.sy,0,0,size,size);
        var result = { image: canvas, size:size, pixels: ctx.getImageData(0, 0,size,size).data,pixelated:true,relief:0.5,gloss:0.03 };
        if (textures.size >= 256) textures.delete(textures.keys().next().value);
        textures.set(index, result); return result;
    }
    function fallbackFloor(base,detail,index,baseIndex) {
        if(!base||!detail)return base;
        var key="fixture-floor:"+index+":"+baseIndex;
        if(textures.has(key))return textures.get(key);
        var image=document.createElement("canvas");image.width=image.height=64;
        var ctx=image.getContext("2d");ctx.imageSmoothingEnabled=false;
        ctx.drawImage(base.image,0,0,64,64);ctx.drawImage(detail.image,0,0,64,64);
        var value={image:image,pixels:ctx.getImageData(0,0,64,64).data,size:64,pixelated:true};
        if(textures.size>=256)textures.delete(textures.keys().next().value);
        textures.set(key,value);return value;
    }
    function flameTexture() {
        if(textures.has("flame"))return textures.get("flame");
        var source=document.getElementById("main"),info=main.get_tile_info(main.CLOUD_FIRE);
        if(!source||!source.complete||!source.naturalWidth||!info)return null;
        var canvas=document.createElement("canvas");canvas.width=canvas.height=64;
        var ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;
        ctx.drawImage(source,info.sx,info.sy,info.ex-info.sx,info.ey-info.sy,0,0,64,64);
        var material={image:canvas,pixelated:true,preservePalette:true,emission:2};
        textures.set("flame",material);return material;
    }
    function targetingMaterial(entry) {
        if(!game.can_target||!game.can_target())return null;
        var cell=entry.t,bg=enums.prepare_bg_flags(cell.bg||0),rays=(cell.ov||[]).filter(function(index){
            return index===tiles.RAY||index===tiles.RAY_MULTI||index===tiles.RAY_OUT_OF_RANGE;});
        var cursor=bg.CURSOR1||bg.CURSOR2||bg.CURSOR3||Object.keys(view.cursor_locs||{}).some(function(key){
            var point=view.cursor_locs[key];return point&&point.x===entry.x&&point.y===entry.y;});
        if(!rays.length&&!cursor)return null;
        var canvas=document.createElement("canvas");canvas.width=canvas.height=64;
        var renderer=new cells.DungeonCellRenderer();renderer.native_art=true;
        renderer.set_cell_size(64/(window.devicePixelRatio||1),64/(window.devicePixelRatio||1));renderer.init(canvas);
        rays.forEach(function(index){renderer.draw_dngn(index,0,0);});
        if(cursor)renderer.draw_icon(bg.CURSOR2?icons.CURSOR2:bg.CURSOR3?icons.CURSOR3:icons.CURSOR,0,0);
        return {image:canvas,pixelated:true,preservePalette:true,emission:0.25,transparent:true,castShadow:false};
    }
    function surfaceDetail(image,prop) {
        var name=prop&&prop.source&&prop.source.name||"",metal=Boolean(prop&&prop.kind==="statue"&&/METAL|SILVER|GOLDEN|IRON/.test(name));
        var roughness=metal?0.42:prop&&prop.kind==="tree"?0.96:0.86;
        var pixels=image.getContext("2d").getImageData(0,0,image.width,image.height).data;
        var data=spriteSurface.bake(pixels,image.width,image.height,{roughness:roughness,strength:0.7});
        var normal=document.createElement("canvas");normal.width=image.width;normal.height=image.height;
        var ctx=normal.getContext("2d"),output=ctx.createImageData(image.width,image.height);
        output.data.set(data.data);ctx.putImageData(output,0,0);
        return {normalMap:normal,normalStrength:1,roughness:roughness,metalness:metal?0.65:0,
            specularGain:metal?0.14:0.065};
    }
    function sprite(entry, feature, heroOverride, layer) {
        layer=layer||"actor";
        var cell=entry.t,fg=enums.prepare_fg_flags(cell.fg||0),bg=enums.prepare_bg_flags(cell.bg||0);
        var canvas=document.createElement("canvas");
        var ratio=window.devicePixelRatio||1;
        canvas.width=Math.ceil(96*ratio);canvas.height=Math.ceil(128*ratio);
        var renderer=new cells.DungeonCellRenderer();renderer.native_art=true;
        renderer.set_cell_size(32,32);renderer.init(canvas);
        var x=Math.floor(32*ratio),y=Math.floor(64*ratio);
        function actor() {
            if(fg.value&&fg.value<main.MAIN_MAX) {
                if(cell.base)renderer.draw_main(cell.base,x,y);
                renderer.draw_main(fg.value,x,y);
                if(fg.value>=main.PARCHMENT_LOW&&fg.value<=main.PARCHMENT_HIGH) {
                    if(cell.overlay1)renderer.draw_main(cell.overlay1,x,y);
                    if(cell.overlay2)renderer.draw_main(cell.overlay2,x,y);
                }
            } else if(fg.value>=main.MAIN_MAX) {
                var offsets=new Map((cell.mcache||[]).map(function(part){return [part[0],part];}));
                (cell.doll||[]).forEach(function(part){var offset=offsets.get(part[0])||[0,0,0];
                    renderer.draw_player(part[0],x,y,offset[1],offset[2],part[1]);});
                if(fg.value>=playerTiles.MCACHE_START)(cell.mcache||[]).forEach(function(part){
                    if(part)renderer.draw_player(part[0],x,y,part[1],part[2]);});
            }
        }
        if(layer==="cloud") {
            renderer.ctx.globalAlpha=0.6;renderer.draw_main(enums.prepare_fg_flags(cell.cloud||0).value,x,y);
        } else if(layer==="effects") {
            (cell.ov||[]).forEach(function(index){if(index>=tiles.FEAT_MAX&&index<main.MAIN_MAX)renderer.draw_main(index,x,y);});
        } else if(layer==="feature")renderer.draw_dngn(feature,x,y);
        else if(bg.WATER&&!fg.FLYING) {
            renderer.ctx.save();renderer.ctx.globalAlpha=cell.trans?0.5:1;
            renderer.set_nonsubmerged_clip(x,y,20);actor();renderer.ctx.restore();
            renderer.ctx.save();renderer.ctx.globalAlpha=cell.trans?0.1:0.3;
            renderer.set_submerged_clip(x,y,20);actor();renderer.ctx.restore();
        } else {renderer.ctx.globalAlpha=cell.trans?0.55:1;actor();}
        var pixels=renderer.ctx.getImageData(0,0,canvas.width,canvas.height).data;
        var left=canvas.width,right=0,top=canvas.height,bottom=0;
        for(var py=0;py<canvas.height;py++)for(var px=0;px<canvas.width;px++) {
            if(pixels[(py*canvas.width+px)*4+3]===0)continue;
            left=Math.min(left,px);right=Math.max(right,px+1);top=Math.min(top,py);bottom=Math.max(bottom,py+1);
        }
        if(right<=left||bottom<=top)return null;
        var cropped=document.createElement("canvas");cropped.width=right-left;cropped.height=bottom-top;
        cropped.getContext("2d").drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
        var nativeBody=fg.value>=main.MAIN_MAX&&((cell.doll||[]).length||(cell.mcache||[]).length);
        var hero=layer==="actor"&&nativeBody?(heroOverride||heroes.get(entry.x+":"+entry.y)):null;
        var body=layer==="actor"&&(hero||entry.mon);
        var profile=body?dimensions.describe(entry.mon,hero,cropped.width/cropped.height,fg):null;
        var prop=layer==="feature"?props.describe(feature):null,propFit=prop&&prop.nativeSprite?props.fit(prop,cropped.width/cropped.height):null;
        var tree=layer==="feature"&&/TREE|MANGROVE/.test(names.get(tiles.basetile(feature))||"");
        var effect=layer==="cloud"||layer==="effects",aspect=cropped.width/cropped.height;
        var height=profile?profile.height:effect?cropped.height/(32*ratio):tree?3.5:feature?1.65:0.25/aspect;
        var width=profile?profile.width:effect?cropped.width/(32*ratio):height*aspect;
        var elevation=profile?profile.elevation:effect?Math.max(0,(y+32*ratio-bottom)/(32*ratio)):0;
        if(propFit){height=propFit.height;width=propFit.width;elevation=propFit.elevation;}
        return {image:cropped,x:entry.x,y:entry.y,scale:cropped.width/(32*ratio),pixelated:true,
            sourceArt:"native",layer:layer,width:width,height:height,prop:prop,surface:effect?null:surfaceDetail(cropped,prop),
            depth:profile?Math.min(0.8,width*0.6):tree?0.55:0.2,body:Boolean(body||tree),size:profile&&profile.size,
            sizeSource:profile?"native-size-class":null,eye:profile&&profile.eye,elevation:elevation,
            flying:profile&&profile.flying,castsShadow:!effect,
            label:effect?layer:hero&&hero.name||entry.mon&&entry.mon.name||"Dungeon tile",
            hit:function(u,v){var px=left+Math.min(cropped.width-1,Math.floor(u*cropped.width));
                var py=top+Math.min(cropped.height-1,Math.floor(v*cropped.height));
                return pixels[(py*canvas.width+px)*4+3]>24;}};
    }
    function build(origin, viewer) {
        var known = new Map(), sprites = [], visible = [], range = 12;
        materials.configure({stone:texture(tiles.WALL_BRICK_DARK_2),floor:texture(tiles.FLOOR_NORMAL),
            wood:doors.wood(tiles.DNGN_CLOSED_DOOR,texture),ceiling:texture(tiles.WALL_BRICK_DARK_2)});
        function get(x, y) {
            var key = x + ":" + y;
            if (known.has(key)) return known.get(key);
            // No extrapolation through fog, old monster positions or other floors.
            var entry = map.get(x, y), result = null;
            if (map.visible(entry) && entry.t) {
                var cell = entry.t, index = enums.prepare_bg_flags(cell.bg || 0).value;
                if (index > tiles.DNGN_ERROR && index < tiles.DNGN_MAX) {
                    var profile=features.describe(index),solid=profile.solid;
                    var floorIndex=index<tiles.FLOOR_MAX?index:cell.flv&&cell.flv.f||tiles.FLOOR_NORMAL;
                    result = {x:x,y:y,solid:solid,door:profile.door,feature:profile.kind,kind:profile.kind,
                        water:profile.water,lava:profile.lava,transparent:profile.transparent,attachments:profile.attachments,doorAxis:profile.doorAxis,
                        prop:props.describe(index),connector:profile.connector,fixture:profile.fixture,runed:profile.runed,sealed:profile.sealed,broken:profile.broken,doorSegment:profile.doorSegment,
                        itemProfile:items.describe(entry,enums.prepare_fg_flags(cell.fg||0)),
                        wall:solid?Object.assign({},texture(profile.wallTexture),{tileScale:1},profile.optical||{}):null,
                        floor:solid&&!profile.transparent?null:texture(index<tiles.FLOOR_MAX?index:cell.flv&&cell.flv.f||tiles.FLOOR_NORMAL)};
                    if(profile.fixture)result.fixtureMaterial=Object.assign({},texture(index),{transparent:true,preservePalette:true,castShadow:false});
                    if(profile.door){result.doorMaterial=Object.assign({},doors.wood(index,texture),profile.optical||{});
                        result.doorFrameMaterial=doors.frame(texture(tiles.WALL_BRICK_DARK_2));}
                    if(profile.connector){
                        result.connectorInset=Object.assign({},texture(index),{transparent:true,castShadow:false,preservePalette:true});
                        result.doorFrameMaterial=doors.frame(texture(tiles.WALL_BRICK_DARK_2));
                    }
                    result.surfaceIndex=index;result.floorIndex=floorIndex;result.terrainFamily=terrain.describe(floorIndex);
                    result.wallMaterial = result.wall; result.floorMaterial = result.floor;result.targetMaterial=targetingMaterial(entry);
                    result.floorMaterial=fluids.material(index,fluids.describe(index)?texture(index):result.floorMaterial);
                    if(fluids.describe(index)){
                        var bedIndex=cell.flv&&cell.flv.f||tiles.FLOOR_NORMAL;
                        result.waterBed=texture(fluids.describe(bedIndex)?tiles.FLOOR_NORMAL:bedIndex);
                    }
                    if(profile.fixture)result.floor=fallbackFloor(result.floor,result.fixtureMaterial,index,floorIndex);
                    result.connectorMaterial=doors.stairOverlay(index,texture);
                    if(result.floorMaterial&&result.floorMaterial.fluid)result.fluid=result.floorMaterial.fluid;
                    if(profile.torch||result.lava)result.light={color:[1,0.43,0.13],strength:result.lava?1.1:1.7};
                    if(profile.torch)result.flameMaterial=flameTexture();
                }
            }
            known.set(key, result); return result;
        }
        for (var y = origin.y - range; y <= origin.y + range; y++) {
            for (var x = origin.x - range; x <= origin.x + range; x++) {
                var knownCell = get(x, y);
                if (knownCell) visible.push(knownCell);
                if (!knownCell || knownCell.solid || x === origin.x && y === origin.y) continue;
                var entry = map.get(x, y), cell = entry.t;
                var bg = enums.prepare_bg_flags(cell.bg || 0).value, fg = enums.prepare_fg_flags(cell.fg || 0).value;
                var feature = bg >= tiles.WALL_MAX && !knownCell.feature && !knownCell.connector && !knownCell.fixture ? bg : 0;
                function add(layer,index) {
                    var image=sprite(entry,index||0,null,layer);if(!image)return;
                    image.elevation+=surfaceHeight(x+0.5,y+0.5);
                    var item=knownCell.itemProfile;
                    if(layer==="actor"&&item&&item.kind!=="gold"&&item.kind!=="under-items"&&item.style)image.elevation+=item.style.topElevation;
                    sprites.push(image);
                }
                if(feature)add("feature",feature);
                if(fg&&(!knownCell.itemProfile||knownCell.itemProfile.kind!=="gold"))add("actor");
                if(enums.prepare_fg_flags(cell.cloud||0).value)add("cloud");
                if((cell.ov||[]).some(function(index){return index>=tiles.FEAT_MAX&&index<main.MAIN_MAX;}))add("effects");
            }
        }
        function surfaceHeight(wx,wy) {
            var cell=get(Math.floor(wx),Math.floor(wy));
            return cell&&architecture.surfaceHeight?architecture.surfaceHeight(cell.kind,wx-Math.floor(wx),wy-Math.floor(wy)):0;
        }
        visible.forEach(function(cell){if(cell.floorMaterial&&cell.floorMaterial.fluid){
            cell.floorMaterial.fluidShore=fluids.shoreline(get,cell.x,cell.y,cell.floorMaterial.fluid);
            var own=fluids.volume(cell.fluid);
            if(own)cell.floorMaterial.fluidDepthEdges=[[0,-1],[1,0],[0,1],[-1,0]].map(function(o){
                var other=get(cell.x+o[0],cell.y+o[1]),basin=other&&fluids.volume(other.fluid);return basin?basin.depth:own.depth;
            });
        }});
        party.append(sprites,Array.from(heroes.values()),viewer,origin,get,surfaceHeight);
        terrain.prepare(visible,get);
        var geometry = meshes.build(visible,get,sprites);
        var self=map.get(origin.x,origin.y),ownShadow=null;
        if(viewer&&map.visible(self)&&self.t&&(self.t.doll||self.t.mcache))ownShadow=sprite(self,0,viewer);
        if(ownShadow&&!ownShadow.body)ownShadow=null;
        if(ownShadow){ownShadow.elevation+=surfaceHeight(origin.x+0.5,origin.y+0.5);
            ownShadow.material={image:ownShadow.image,actor:true,pixelated:ownShadow.pixelated,preservePalette:true};}
        var viewerEye=ownShadow&&Number.isFinite(ownShadow.eye)?ownShadow.eye:viewer?dimensions.eyeHeight(viewer):1.1;
        return { get: get, sprites: sprites,subject:function(x,y){return subjects.at(sprites,x,y);},shadowSprites:ownShadow?[ownShadow]:[],phase:0, range: range,
            mesh:geometry.mesh,cells:visible,lights:geometry.lights,wallHeight:3.35,surfaceHeight:surfaceHeight,
            viewerEye:viewerEye+surfaceHeight(origin.x+0.5,origin.y+0.5) };
    }
    return { build: build, clear: function () { textures.clear(); doors.clear(); terrain.clear(); },
        heroes:function(members){heroes.clear();(members||[]).forEach(function(hero){
            if(hero.pos&&hero.on_same_level!==false)heroes.set(hero.pos.x+":"+hero.pos.y,hero);
        });} };
});
