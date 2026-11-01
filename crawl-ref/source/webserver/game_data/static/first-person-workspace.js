/* Immersive menus keep all game actions on their existing native routes. */
define(["require","./first-person-menu","./workflow-actions"],function(require,menus,actions){
    "use strict";
    var immersive=true;
    function create(host,toolbar,onChange,onOpen){
        host.dataset.immersive=String(immersive);
        var launchers=document.createElement('nav');launchers.className='first-person-menu-launchers';launchers.setAttribute('aria-label','First-person menus');
        var destroyed=false,pendingSettings=null;
        function openSettings(){
            if(destroyed||pendingSettings||host.isConnected===false)return;
            var context=menu.inputContext();if(context===null)return;
            var request={context:context};pendingSettings=request;
            require(["settings-dialog"],function(settings){
                if(destroyed||pendingSettings!==request)return;
                pendingSettings=null;
                if(host.isConnected===false||menu.inputContext()!==request.context)return;
                menu.close();settings.open();
            },function(){
                if(pendingSettings!==request)return;
                pendingSettings=null;
                if(!destroyed&&host.isConnected!==false&&menu.inputContext()===request.context)
                    actions.notice("Settings could not load. Try again.");
            });
        }
        var menu=menus.create(host,{onOpen:onOpen,map:function(){var atlas=toolbar.querySelector('[aria-label="Open dungeon atlas"]');if(atlas)atlas.click();},
            tools:function(root){
                var heading=document.createElement('h2');heading.textContent='Camera & interface';
                var help=document.createElement('p');help.textContent='Drag to look · Alt + arrows turn and tilt · Alt + Home levels the camera.';
                var layout=document.createElement('button');layout.type='button';
                function label(){layout.textContent=immersive?'Show full interface':'Return to immersive view';}
                layout.addEventListener('click',function(){immersive=!immersive;host.dataset.immersive=String(immersive);label();menu.close();onChange();});label();
                var settings=document.createElement('button');settings.type='button';settings.textContent='Settings';
                settings.addEventListener('click',openSettings);
                root.append(heading,help,toolbar,settings,layout);
            }});
        [['inventory','Inventory','Alt+I'],['magic','Magic','Alt+M'],['favorites','Favorites','Alt+Q'],['settings','Settings',null]].forEach(function(entry){
            var button=document.createElement('button');button.type='button';button.textContent=entry[1];
            button.title=entry[1]+(entry[2]?' · '+entry[2]:'');if(entry[2])button.setAttribute('aria-keyshortcuts',entry[2]);
            button.addEventListener('click',function(event){event.stopPropagation();if(entry[0]==='settings')openSettings();else menu.open(entry[0]);});launchers.append(button);
        });
        ['keydown','keypress','keyup','mousedown'].forEach(function(type){launchers.addEventListener(type,function(event){event.stopPropagation();});});
        host.append(launchers);onChange();
        return {isOpen:function(){return menu.isOpen();},destroy:function(){destroyed=true;pendingSettings=null;menu.destroy();launchers.remove();delete host.dataset.immersive;}};
    }
    return {create:create};
});
