/* Full known-floor atlas within a 3D expedition. It never changes the game mode. */
define(["jquery", "expedition-presentation", "./map_knowledge", "./dungeon-atlas-model", "./player", "./game-context", "./enums"],
function ($, presentation, map, model, player, game, enums) {
    "use strict";
    var serial=0;
    function mount(viewport, renderer) {
        var id="firstPersonAtlas"+(++serial),root=document.createElement("section"),canvas=document.createElement("canvas");
        var heading=document.createElement("h2"),close=document.createElement("button"),status=document.createElement("p");
        var detail=document.createElement("p"),legend=document.createElement("p"),toast=document.createElement("button");
        var ctx=canvas.getContext("2d"),frame=null,openState=false,restoreFocus,position=null,lastMapped=null,needsReveal=false,resumeAfterPrompt=false;
        root.className="first-person-atlas";root.hidden=true;root.setAttribute("role","dialog");root.setAttribute("aria-modal","true");
        heading.id=id+"Title";heading.textContent="Dungeon atlas";root.setAttribute("aria-labelledby",heading.id);
        var header=document.createElement("header");close.type="button";close.textContent="Back to 3D";
        close.setAttribute("aria-label","Close dungeon atlas");header.append(heading,close);
        canvas.tabIndex=0;canvas.setAttribute("aria-label","Known dungeon floor. Blue tiles are magically mapped; creatures appear only in current sight. Click a known tile to travel.");
        legend.className="first-person-atlas-legend";legend.textContent="Gold · in sight     Grey · remembered     Blue · magically mapped     Red · visible creature     Purple · sensed presence";
        status.setAttribute("role","status");detail.textContent="Mapped terrain reveals the layout, not hidden creatures. Click a known tile to travel; right-click for actions.";
        root.append(header,status,canvas,legend,detail);document.body.appendChild(root);
        toast.type="button";toast.className="first-person-mapping-notice";toast.hidden=true;viewport.appendChild(toast);
        function canInteract(){return presentation.current()==="first_person"&&renderer.ui_state===enums.ui.NORMAL
            &&game.get_input_mode&&game.get_input_mode()===enums.mouse_mode.COMMAND;}
        function closeAtlas(suspend) {
            if(suspend!==true)resumeAfterPrompt=false;
            if(!openState)return;openState=false;root.hidden=true;
            if(restoreFocus&&restoreFocus.isConnected)restoreFocus.focus({preventScroll:true});
            $(document).trigger("first_person_atlas_changed",[false]);
        }
        function open() {
            if(!canInteract())return;resumeAfterPrompt=false;
            if(!openState)restoreFocus=document.activeElement;
            openState=true;root.hidden=false;toast.hidden=true;draw();close.focus({preventScroll:true});
            $(document).trigger("first_person_atlas_changed",[true]);
        }
        function draw() {
            frame=null;if(!openState)return;
            var data=model.snapshot(map),bounds=data.bounds,rect=root.getBoundingClientRect();
            var width=Math.max(20,Math.floor(rect.width-32)),height=Math.max(40,Math.floor(rect.height-165));
            canvas.width=width;canvas.height=height;canvas.style.width=width+"px";canvas.style.height=height+"px";
            ctx.fillStyle="#0b131b";ctx.fillRect(0,0,width,height);
            if(!bounds){status.textContent="No terrain discovered on this floor yet.";position=null;return;}
            var cols=bounds.right-bounds.left+1,rows=bounds.bottom-bounds.top+1;
            var unit=Math.min(width/cols,height/rows),left=(width-cols*unit)/2,top=(height-rows*unit)/2;
            position={left:left,top:top,unit:unit,bounds:bounds};
            data.cells.forEach(function(cell){
                var color=cell.knowledge==="mapped"?cell.terrain==="wall"?"#354f68":"#718ba5"
                    :cell.knowledge==="visible"?cell.terrain==="wall"?"#68624e":"#e1d1a3"
                    :cell.terrain==="wall"?"#3b4648":"#8b9997";
                if(cell.terrain==="water")color="#326e8d";else if(cell.terrain==="lava")color="#c26336";
                if(cell.terrain==="unknown")color="#0b131b";
                ctx.fillStyle=color;var x=left+(cell.x-bounds.left)*unit,y=top+(cell.y-bounds.top)*unit;
                ctx.fillRect(x,y,Math.max(1,unit-0.6),Math.max(1,unit-0.6));
                if(/up|down|branch/.test(cell.terrain)&&unit>=4){ctx.fillStyle="#eee4a6";ctx.fillRect(x+unit*.25,y+unit*.25,unit*.5,unit*.5);}
                if(cell.signal){ctx.strokeStyle="#c5a1ed";ctx.lineWidth=Math.max(1,unit*.13);ctx.strokeRect(x+unit*.25,y+unit*.25,Math.max(1,unit*.5),Math.max(1,unit*.5));}
                if(cell.actor){ctx.fillStyle=cell.actor.attitude>0?"#95dbb1":"#ef857c";ctx.beginPath();ctx.arc(x+unit/2,y+unit/2,Math.max(1,unit*.27),0,Math.PI*2);ctx.fill();}
            });
            if(player.pos){var px=left+(player.pos.x-bounds.left+.5)*unit,py=top+(player.pos.y-bounds.top+.5)*unit;
                ctx.strokeStyle="#fff3c6";ctx.lineWidth=2;ctx.strokeRect(px-unit*.45,py-unit*.45,unit*.9,unit*.9);}
            status.textContent=(player.place||"Dungeon")+" · "+data.cells.length+" known tiles · "+data.mapped+" magically mapped";
        }
        function sync() {
            if(presentation.current()!=="first_person"){closeAtlas();toast.hidden=true;return;}
            var data=model.snapshot(map);
            if(lastMapped!==null&&data.mapped-lastMapped>=12){needsReveal=true;toast.textContent="Mapping revealed new terrain · Open dungeon atlas";toast.hidden=false;}
            if(data.bounds)lastMapped=data.mapped;
            var ready=game.get_input_mode&&game.get_input_mode()===enums.mouse_mode.COMMAND;
            if(!ready||renderer.ui_state!==enums.ui.NORMAL){
                if(openState){resumeAfterPrompt=true;closeAtlas(true);}toast.hidden=true;return;
            }
            if(needsReveal||resumeAfterPrompt){needsReveal=false;open();}
            if(openState&&frame===null)frame=window.requestAnimationFrame(draw);
        }
        function select(event) {
            event.preventDefault();event.stopPropagation();if(!position||!canInteract())return;
            var rect=canvas.getBoundingClientRect(),px=(event.clientX-rect.left)*canvas.width/rect.width,py=(event.clientY-rect.top)*canvas.height/rect.height;
            var x=position.bounds.left+Math.floor((px-position.left)/position.unit),y=position.bounds.top+Math.floor((py-position.top)/position.unit);
            if(x<position.bounds.left||x>position.bounds.right||y<position.bounds.top||y>position.bounds.bottom)return;
            var entry=map.get(x,y),cell=model.describe(entry,map.visible(entry));if(!cell)return;
            if(cell.terrain==="unknown"){detail.textContent="Sensed presence · terrain not known.";return;}
            if(event.type==="contextmenu"&&cell.knowledge!=="visible"){
                detail.textContent=cell.terrain+" · "+cell.knowledge+" terrain. Creatures and actions require current sight.";return;
            }
            closeAtlas();$(renderer.element).trigger($.Event(event.type==="contextmenu"?"cell_contextmenu":"cell_click",{
                cell:{x:x,y:y},which:event.type==="contextmenu"?3:1,clientX:event.clientX,clientY:event.clientY,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey}));
        }
        canvas.addEventListener("click",select);canvas.addEventListener("contextmenu",select);
        close.addEventListener("click",closeAtlas);toast.addEventListener("click",open);
        ["keydown","keypress","keyup","mousedown"].forEach(function(type){root.addEventListener(type,function(event){
            event.stopPropagation();if(type==="keydown"&&event.key==="Escape"){event.preventDefault();closeAtlas();}
            if(type==="keydown"&&event.key==="Tab"){event.preventDefault();(document.activeElement===close?canvas:close).focus();}
        });});
        $(document).on("map_knowledge_changed."+id+" game_input_changed."+id+" game_ui_changed."+id+" player_state_changed."+id+" expedition_presentation_changed."+id,sync)
            .on("map_knowledge_cleared."+id,function(){lastMapped=null;needsReveal=false;closeAtlas();toast.hidden=true;});
        return {open:open,close:closeAtlas,sync:sync,isOpen:function(){return openState;},destroy:function(){
            if(frame!==null)window.cancelAnimationFrame(frame);$(document).off("."+id);root.remove();toast.remove();
        }};
    }
    return {mount:mount};
});
