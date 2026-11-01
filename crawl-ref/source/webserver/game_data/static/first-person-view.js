/* Presentation only. Native movement, targeting and visibility remain authoritative. */
define(["jquery","expedition-presentation","grid-perspective-paint","./first-person-scene","./map_knowledge",
    "./player","./options","./enums","./game-context","grid-mesh-paint","./creature-dimensions","./first-person-atlas",
    "./first-person-camera-controls","./first-person-targeting","./first-person-sensing","mesh-fluid","visual-presentation","./first-person-hud",
    "./first-person-held","./first-person-highlight","./party-model","./first-person-workspace"],
function($,presentation,painting,scene,map,player,options,enums,game,meshPainting,dimensions,atlasModule,cameras,targetModule,sensingModule,fluid,visual,hudModule,heldModule,highlightModule,partyModel,workspaceModule){
    "use strict";
    var renderer,viewport,canvas,toolbar,toggle,controls,compass,painter,observer,atlas,cameraControls,targeting,sensing;
    var running=false,active=false,pending=null,angle=-Math.PI/2,pitch=-0.07,previous,lastScene,dirty=true;
    var forceSoftware=false,syncing=false,aimAfterLook=false;
    var hud,held,highlight,workspace;
    function currentHero(){
        var state=window.crawl_party&&window.crawl_party.state;
        var hero=state&&(state.members||[]).find(function(member){return member.slot===partyModel.controlledSlot(state);});
        // Native player.place is a branch name; party place is a level ID.
        // Bind equipment to the controlled identity, not those different formats.
        return hero&&hero.name===player.name?hero:null;
    }
    var motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    function wanted(){return presentation.current()==="first_person";}
    function baseAllowed(){
        var mode=game.get_input_mode&&game.get_input_mode();
        return running&&wanted()&&renderer&&renderer.ui_state===enums.ui.NORMAL
            &&options.ready()&&options.get("tile_display_mode")==="tiles"&&!document.hidden
            &&(mode===enums.mouse_mode.COMMAND||targetModule.isTargetMode(mode))
            &&map.player_on_level()!==false&&player.pos&&player.name&&map.visible(map.get(player.pos.x,player.pos.y))
            &&renderer.view_center.x===player.pos.x&&renderer.view_center.y===player.pos.y;
    }
    function allowed(){return baseAllowed()&&(!atlas||!atlas.isOpen())&&(!targeting||!targeting.tactical());}
    function cancel(){
        if(pending!==null)window.cancelAnimationFrame(pending);pending=null;
        if(cameraControls)cameraControls.cancel();
    }
    function request(){if(active&&pending===null)pending=window.requestAnimationFrame(paint);}
    function paint(){
        pending=null;if(!allowed()){sync();return;}
        var rect=viewport.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
        var mesh=painter.stats&&painter.stats.backend==="webgl";
        var scale=mesh?Math.min(1.5,1280/rect.width,800/rect.height):Math.min(1,720/rect.width,480/rect.height);
        var width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        if(dirty||!lastScene){lastScene=scene.build(player.pos,Object.assign({},player,{partyPlace:currentHero()&&currentHero().place,partySlot:currentHero()&&currentHero().slot}));dirty=false;}
        lastScene.phase=fluid.phase(window.performance.now(),{realtime:options.get("tile_realtime_anim"),
            waterAnimation:options.get("tile_water_anim"),animated:visual.animated(),reducedMotion:motion.matches});
        var eye=Number.isFinite(lastScene.viewerEye)?lastScene.viewerEye:dimensions.eyeHeight(player);
        var camera={x:player.pos.x+0.5,y:player.pos.y+0.5,angle:angle,pitch:pitch,height:eye};
        painter.paint(lastScene,camera);if(sensing)sensing.render(camera,width,height);
        if(highlight)highlight.render(lastScene,camera,width,height,targeting&&targeting.snapshot());
        canvas.dataset.backend=mesh?"mesh":"raycast";canvas.dataset.eyeHeight=String(eye);canvas.dataset.cameraPitch=String(pitch);
        compass.textContent="Facing "+cameras.direction(angle);
        if(hud)hud.update(player,angle,active,targeting&&targeting.snapshot());
        if(held)held.update(player,currentHero(),active);
        if(aimAfterLook){aimAfterLook=false;if(targeting)targeting.center();}
        if(lastScene.phase>0&&lastScene.cells.some(function(cell){return cell.fluid;}))request();
    }
    function sync(){
        if(syncing)return;
        if(!running||!wanted()){if(canvas)destroy();return;}
        if(!canvas||!canvas.isConnected)mount();if(!canvas)return;
        syncing=true;
        if(targeting)targeting.sync();
        toggle.disabled=!game.get_input_mode||game.get_input_mode()!==enums.mouse_mode.COMMAND;
        var next=Boolean(allowed());
        if(next!==active){
            active=next;viewport.classList.toggle("first-person-active",active);canvas.hidden=!active;controls.hidden=!active;
            if(!active){cancel();painter.clear();if(sensing)sensing.clear();if(highlight)highlight.clear();if(renderer)renderer.render_view();}
        }
        if(hud)hud.update(player,angle,active,targeting&&targeting.snapshot());
        if(held)held.update(player,currentHero(),active);
        syncing=false;request();
    }
    function invalidate(){dirty=true;sync();}
    function button(text,label,action,refocus){
        var node=document.createElement("button");node.type="button";node.textContent=text;node.title=label;node.setAttribute("aria-label",label);
        node.addEventListener("click",function(event){event.stopPropagation();action();if(refocus&&event.detail>0&&canvas)canvas.focus({preventScroll:true});});return node;
    }
    function cellEvent(event){
        if(workspace&&workspace.isOpen&&workspace.isOpen())return;
        if(targeting&&targeting.confirm(event))return;
        var rect=canvas.getBoundingClientRect(),loc=painter.pick((event.clientX-rect.left)*canvas.width/rect.width,
            (event.clientY-rect.top)*canvas.height/rect.height);
        if(!loc||!map.visible(map.get(loc.x,loc.y)))return;
        $(renderer.element).trigger($.Event(event.type==="contextmenu"?"cell_contextmenu":"cell_click",{
            cell:{x:loc.x,y:loc.y},which:event.button===2?3:1,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,
            altKey:event.altKey,clientX:event.clientX,clientY:event.clientY}));
    }
    function surface(){
        var candidate=document.createElement("canvas"),nextPainter=null;
        if(!forceSoftware){
            try{nextPainter=meshPainting.create(candidate);}catch(ignored){
                var gl=candidate.getContext("webgl");var loss=gl&&gl.getExtension("WEBGL_lose_context");if(loss)loss.loseContext();
            }
        }
        if(!nextPainter){forceSoftware=true;candidate=document.createElement("canvas");nextPainter=painting.create(candidate);}
        painter=nextPainter;return candidate;
    }
    function mount(){
        if(!wanted()||!renderer||!renderer.element)return;
        var next=renderer.element.parentElement;if(viewport===next&&canvas&&canvas.isConnected)return;
        destroy();viewport=next;canvas=surface();canvas.id="first_person_dungeon";canvas.hidden=true;canvas.tabIndex=0;
        canvas.setAttribute("aria-label","First-person dungeon. Drag or Alt+arrows to look. Movement uses compass directions. Native targeting supports 3D and overhead aim.");
        toolbar=document.createElement("div");toolbar.className="first-person-toolbar";
        toggle=button("Dungeon atlas","Open dungeon atlas",function(){if(atlas)atlas.open();});
        controls=document.createElement("span");controls.className="first-person-controls";controls.hidden=true;
        compass=document.createElement("span");compass.className="first-person-compass";
        var help=document.createElement("span");help.className="first-person-help";help.textContent="Drag / Alt+arrows to look · compass movement";
        controls.append(button("↶","Look left 45 degrees",function(){if(cameraControls)cameraControls.turn(-Math.PI/4);},true),compass,
            button("↷","Look right 45 degrees",function(){if(cameraControls)cameraControls.turn(Math.PI/4);},true),
            button("Level","Level the camera",function(){if(cameraControls)cameraControls.level();},true),help);
        toolbar.append(controls,toggle);viewport.append(canvas,toolbar);
        workspace=workspaceModule.create(viewport,toolbar,request,function(){if(cameraControls)cameraControls.cancel();});
        hud=hudModule.create(viewport);
        held=heldModule.create(viewport,{onChange:request});highlight=highlightModule.create(viewport);
        atlas=atlasModule.mount(viewport,renderer);atlas.sync();sensing=sensingModule.create(viewport);
        targeting=targetModule.create({host:viewport,canvas:canvas,eventTarget:renderer.element,
            pick:function(x,y){return painter.pick(x,y);},
            label:function(loc){var body=lastScene&&lastScene.subject(loc.x,loc.y);return body&&body.label;},enabled:baseAllowed,onHoverChange:request,onTacticalChange:sync});
        cameraControls=cameras.mount(canvas,{keyboardRoot:viewport,allowed:function(){return active&&allowed();},
            snapshot:function(){return {angle:angle,pitch:pitch};},
            onChange:function(next){angle=next.angle;pitch=next.pitch;aimAfterLook=Boolean(targeting);request();},
            onClick:cellEvent,onContextMenu:cellEvent,onHover:function(event){if(targeting&&targeting.point(event))request();}});
        ["keydown","keypress","keyup","mousedown"].forEach(function(type){toolbar.addEventListener(type,function(event){event.stopPropagation();});});
        canvas.addEventListener("webglcontextlost",function(event){
            event.preventDefault();if(event.currentTarget!==canvas||!running||!wanted())return;
            forceSoftware=true;destroy();mount();sync();if(canvas)canvas.focus({preventScroll:true});
        });
        observer=new ResizeObserver(request);observer.observe(viewport);
        $(document).trigger("hud_workspace_changed");
    }
    function destroy(){
        cancel();if(observer)observer.disconnect();observer=null;
        if(viewport)viewport.classList.remove("first-person-active");
        if(cameraControls)cameraControls.destroy();cameraControls=null;
        if(targeting)targeting.destroy();targeting=null;
        if(sensing)sensing.destroy();sensing=null;
        if(workspace)workspace.destroy();workspace=null;
        if(hud)hud.destroy();hud=null;
        if(held)held.destroy();held=null;if(highlight)highlight.destroy();highlight=null;
        if(atlas)atlas.destroy();atlas=null;if(painter&&painter.destroy)painter.destroy();
        if(canvas)canvas.remove();if(toolbar)toolbar.remove();
        viewport=canvas=toolbar=painter=lastScene=null;active=false;dirty=true;aimAfterLook=false;
    }
    $(document).on("game_init.firstPerson",function(){
        running=true;previous=null;angle=-Math.PI/2;pitch=-0.07;forceSoftware=false;scene.heroes([]);scene.clear();
    }).on("game_cleanup.firstPerson game_preinit.firstPerson game_connection_lost.firstPerson",function(){
        running=false;previous=null;destroy();scene.heroes([]);scene.clear();
    }).on("player_state_changed.firstPerson",function(){
        var pos=player.pos;
        if(previous&&pos&&previous.place===player.place){var dx=pos.x-previous.x,dy=pos.y-previous.y;
            if((dx||dy)&&Math.max(Math.abs(dx),Math.abs(dy))===1)angle=Math.atan2(dy,dx);}
        previous=pos?{x:pos.x,y:pos.y,place:player.place}:null;invalidate();
    }).on("map_knowledge_changed.firstPerson map_knowledge_cleared.firstPerson map_cursor_changed.firstPerson dungeon_tiles_changed.firstPerson game_camera_changed.firstPerson",invalidate)
        .on("party_state_rendered.firstPerson",function(event,state){scene.heroes(state&&state.members);invalidate();})
        .on("game_input_changed.firstPerson",invalidate)
        .on("expedition_presentation_changed.firstPerson first_person_atlas_changed.firstPerson game_ui_changed.firstPerson visibilitychange.firstPerson",sync)
        .on("visual_presentation_changed.firstPerson",invalidate)
        .on("texture_pack_changed.firstPerson art_materials_ready.firstPerson",function(){scene.clear();invalidate();});
    options.add_listener(invalidate);motion.addEventListener("change",invalidate);
    return {attach:function(view){
        if(renderer===view)return;renderer=view;
        var overhead=view.render_view;
        view.render_view=function(changed){if(!active)return overhead.call(view,changed);};
    },init:function(){if(running)sync();}};
});
