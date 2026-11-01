/* Inventory, magic and favorites use canonical snapshots and native action gates. */
define(["jquery","./party-model","./quickbar","./quickbar-model","./workflow-actions","./game-context","./enums",
    "./menu-keyboard","./first-person-menu-model","./first-person-item-stage","spell-cost","expedition-presentation"],
function($,party,quickbar,bindings,actions,game,enums,keyboard,model,stages,spellCost,presentation){
    "use strict";
    var serial=0;
    function create(host,options){
        var namespace='.firstPersonMenu'+(++serial),section='inventory',group='all',selected=null,rows=[],favorites=[];
        var contextVersion=0,lastHero=null,claimed=new Set(),opener=null,contexts=new Map();
        function node(tag,className,text){var n=document.createElement(tag);n.className=className||'';if(text)n.textContent=text;return n;}
        function button(label,run,className){var n=node('button',className,label);n.type='button';n.addEventListener('click',run);return n;}
        var dialog=node('dialog','first-person-menu');dialog.id='first_person_menu_'+serial;
        dialog.setAttribute('aria-label','Inventory and magic');
        var header=node('header','first-person-menu-header'),tabs=node('nav','first-person-menu-tabs'),title=node('h1','','Inventory');
        var context=node('span','first-person-menu-context'),closeButton=button('Return · Esc',function(){close();});
        [['inventory','Inventory'],['magic','Magic'],['abilities','Powers'],['favorites','Favorites'],['controls','Controls']].forEach(function(tab){
            var control=button(tab[1],function(){show(tab[0]);});control.dataset.section=tab[0];tabs.append(control);
        });
        tabs.append(button('Map',function(){close(false);options.map();}));header.append(title,context,closeButton);
        var body=node('div','first-person-menu-body'),categories=node('nav','first-person-menu-categories');
        categories.setAttribute('aria-label','Item categories');
        var catalog=node('section','first-person-menu-catalog'),search=document.createElement('input');
        search.type='search';search.placeholder='Search';search.setAttribute('aria-label','Search inventory and magic');
        var list=node('div','first-person-menu-list');list.setAttribute('role','list');list.setAttribute('aria-label','Available items and powers');
        catalog.append(search,list);
        var detail=node('section','first-person-menu-detail'),stage=node('div','first-person-menu-stage');
        var itemName=node('h2',''),facts=node('p','first-person-menu-facts'),description=node('p','first-person-menu-description');
        var use=button('Use',function(){activate(currentRow());},'first-person-menu-use');
        var favorite=button('Favorite',function(){toggleFavorite();},'first-person-menu-pin');
        var detailActions=node('div','first-person-menu-actions');detailActions.append(use,favorite);
        var status=node('p','first-person-menu-status');status.setAttribute('role','status');
        detail.append(stage,itemName,facts,description,detailActions,status);
        var tools=node('section','first-person-menu-tools');tools.hidden=true;
        options.tools(tools);
        body.append(categories,catalog,detail,tools);
        var footer=node('footer','first-person-menu-footer','↑ ↓ Select     Enter Use / equip     F Favorite     Esc Return');
        dialog.append(header,tabs,body,footer);document.body.append(dialog);var preview=stages.create(stage);
        function hero(){var state=window.crawl_party&&window.crawl_party.state;
            return state&&(state.members||[]).find(function(member){return member.slot===party.controlledSlot(state);});}
        function remember(){if(lastHero!==null)contexts.set(lastHero+':'+section,{group:group,query:search.value,selected:selected,scroll:list.scrollTop});}
        function restore(identity,next){var saved=contexts.get(identity+':'+next)||{};group=saved.group||'all';search.value=saved.query||'';selected=saved.selected||null;return saved.scroll||0;}
        function blockedByOverlay(){
            return keyboard.otherDialogOpen(dialog)||Boolean(document.querySelector('#ui-stack > *'));
        }
        function allowed(){return presentation.current()==='first_person'&&host.classList.contains('first-person-active')&&game.get_input_mode()===enums.mouse_mode.COMMAND
            &&(!game.get_ui_state||game.get_ui_state()===enums.ui.NORMAL)&&!blockedByOverlay();}
        function inputContext(){
            if(!allowed())return null;
            var member=hero();
            return JSON.stringify([presentation.current(),presentation.identifier(),member&&(member.player_id||member.slot),
                member&&member.place,contextVersion]);
        }
        function currentRow(){return rows.find(function(row){return model.identity(row)===selected;})||null;}
        function blocked(row){
            var current=row&&quickbar.describeBinding(row.binding);
            return !row?'No item selected.':row.missing?'This favorite is currently unavailable.'
                :!current||!current.entry||current.entry.name!==row.data.name?'This entry changed. Select it again.':current.reason;
        }
        function actionLabel(row){return !row?'Use':row.kind==='item'?actions.itemVerb(row.data):row.kind==='spell'?(section==='favorites'&&row.binding.quick_cast?'Quick cast':'Cast'):'Use';}
        function select(row){
            selected=row?model.identity(row):null;
            list.querySelectorAll('[data-entry]').forEach(function(n){var active=n.dataset.entry===selected;n.classList.toggle('is-selected',active);n.querySelector('.first-person-menu-activate').setAttribute('aria-current',String(active));});
            itemName.textContent=row?row.data.name:'Nothing here';
            var item=row&&row.data;
            facts.textContent=!row?'':row.kind==='item'?[item.kind_name,item.equipped?'Equipped':row.missing?'Unavailable':'In pack',Number.isInteger(item.qty)?'Quantity '+item.qty:''].filter(Boolean).join(' · ')
                :[item.schools,Number.isInteger(item.level)?'Level '+item.level:'',row.kind==='spell'?spellCost.format(item):item.cost].filter(Boolean).join(' · ');
            description.textContent=item&&(item.description||item.desc)||'Select an entry to inspect its known properties.';
            var reason=blocked(row),index=row?model.favoriteIndex(row,favorites):-1;
            use.textContent=actionLabel(row);use.disabled=Boolean(reason);use.title=reason||'';
            favorite.textContent=index>=0?'★ Favorited · '+bindings.shortcut(index):'☆ Favorite';favorite.disabled=!row||Boolean(row.missing);
            favorite.setAttribute('aria-pressed',String(index>=0));status.textContent=reason||'';
            preview.show(hero(),row);
        }
        function activate(row,manualAim){
            var reason=blocked(row);if(reason){status.textContent=reason;return;}
            var member=hero();close();
            if(section==='favorites')quickbar.activateFavorite(row.index,Boolean(manualAim));
            else if(row.kind==='item')actions.itemAction(member,row.data,false);
            else actions.usePower(member,row.data,row.kind,false);
        }
        function toggleFavorite(row){
            row=row||currentRow();if(!row||row.missing)return;
            if(!quickbar.toggleFavorite(row.binding)){status.textContent='All ten favorites are assigned. Remove a favorite to make room.';return;}
            render();
        }
        function render(){
            if(!dialog.open)return;
            var member=hero(),identity=member&&(member.player_id||member.slot);
            if(lastHero!==identity){remember();lastHero=identity;restore(identity,section);}
            favorites=quickbar.favorites();rows=model.entries(member,section,group,search.value,favorites);
            dialog.dataset.section=section;dialog.classList.toggle('is-compact',section==='favorites');
            footer.textContent=section==='favorites'?'1–0 Use · Shift + number Aim spell · F Favorite · Esc Return':'↑ ↓ Select · Enter Use / equip · F Favorite · Esc Return';
            title.textContent=section==='magic'?'Magic':section==='abilities'?'Powers':section==='favorites'?'Favorites':section==='controls'?'Controls':'Inventory';
            context.textContent=member?[member.name,Number.isInteger(member.xl)?'Level '+member.xl:'',Number.isFinite(member.gold)?member.gold+' gold':''].filter(Boolean).join(' · '):'Hero information unavailable';
            tabs.querySelectorAll('[data-section]').forEach(function(tab){tab.setAttribute('aria-current',String(tab.dataset.section===section));});
            categories.hidden=section!=='inventory';catalog.hidden=detail.hidden=section==='controls';tools.hidden=section!=='controls';
            categories.replaceChildren();model.groups.forEach(function(entry){
                var category=button(entry[1],function(){group=entry[0];selected=null;render();});category.setAttribute('aria-current',String(group===entry[0]));categories.append(category);
            });
            var focused=document.activeElement&&document.activeElement.closest('[data-entry]'),focusKey=focused&&selected,focusStar=document.activeElement&&document.activeElement.classList.contains('first-person-menu-star');
            var scroll=list.scrollTop;list.replaceChildren();
            rows.forEach(function(row){
                var line=node('div','first-person-menu-entry');line.dataset.entry=model.identity(row);line.setAttribute('role','listitem');
                var index=model.favoriteIndex(row,favorites),star=button(index>=0?'★':'☆',function(){toggleFavorite(row);},'first-person-menu-star');
                star.setAttribute('aria-label',(index>=0?'Unfavorite ':'Favorite ')+row.data.name);star.setAttribute('aria-pressed',String(index>=0));star.disabled=Boolean(row.missing);
                var choose=button(row.data.name,function(event){if(section==='favorites')activate(row,event.shiftKey);else select(row);},'first-person-menu-activate');
                choose.addEventListener('dblclick',function(){if(section!=='favorites')activate(row);});
                choose.append(node('small','',section==='favorites'?bindings.shortcut(row.index)+(row.binding.quick_cast?' · Quick':''):row.data.equipped?'◆':row.data.qty>1?String(row.data.qty):''));
                choose.title=blocked(row)||(section==='favorites'?actionLabel(row):'Select · Double-click to '+actionLabel(row).toLowerCase());choose.setAttribute('aria-disabled',String(Boolean(blocked(row))));
                choose.addEventListener('focus',function(){select(row);});line.addEventListener('pointerenter',function(){select(row);});line.append(star,choose);list.append(line);
            });
            if(!rows.length)list.append(node('p','first-person-menu-empty',section==='favorites'?'Favorite an item or spell with F to keep it here.':'No matching entries.'));
            select(currentRow()||rows[0]||null);list.scrollTop=scroll;
            if(focusKey){var target=Array.from(list.querySelectorAll('[data-entry]')).find(function(n){return n.dataset.entry===focusKey;});if(target)target.querySelector(focusStar?'.first-person-menu-star':'.first-person-menu-activate').focus({preventScroll:true});}
        }
        function show(next){
            if(!allowed())return;
            contextVersion++;
            remember();var member=hero();lastHero=member&&(member.player_id||member.slot);section=next;var scroll=restore(lastHero,next);
            if(!dialog.open){if(options.onOpen)options.onOpen();opener=document.activeElement;dialog.showModal();host.dataset.menuOpen='true';}
            render();list.scrollTop=scroll;var first=list.querySelector('.first-person-menu-activate');if(first)first.focus({preventScroll:true});else closeButton.focus({preventScroll:true});
        }
        function close(restore){
            contextVersion++;remember();if(dialog.open)dialog.close();delete host.dataset.menuOpen;
            if(restore!==false){var canvas=host.querySelector('#first_person_dungeon');(canvas||opener)?.focus({preventScroll:true});}
        }
        function consume(event){claimed.add(event.code||event.key);event.preventDefault();event.stopImmediatePropagation();}
        function route(event){
            if(blockedByOverlay()){claimed.clear();return;}
            var physical=event.code||event.key;
            if(event.type!=='keydown'){if(claimed.has(physical)){event.preventDefault();event.stopImmediatePropagation();if(event.type==='keyup')claimed.delete(physical);}else if(dialog.open)event.stopImmediatePropagation();return;}
            if(event.defaultPrevented||event.isComposing||event.metaKey||event.ctrlKey)return;
            if(!dialog.open){
                if(!allowed()||keyboard.typing(event.target))return;
                var shortcut=model.shortcut(event);
                if(shortcut||event.key==='Escape'){consume(event);if(!event.repeat)show(shortcut||'inventory');}return;
            }
            var switchTo=!keyboard.typing(event.target)&&model.shortcut(event);
            if(switchTo){consume(event);if(!event.repeat)show(switchTo);return;}
            if(event.key==='Escape'){consume(event);close();return;}
            if(keyboard.typing(event.target)){
                if(event.target===search&&['Enter','ArrowDown'].includes(event.key)){
                    consume(event);if(!event.repeat){if(event.key==='Enter')activate(currentRow());else{var first=list.querySelector('.first-person-menu-activate');if(first)first.focus({preventScroll:true});}}return;
                }
                event.stopImmediatePropagation();return;
            }
            if(event.target===stage.querySelector('canvas')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
            if(event.key==='Tab'){event.stopImmediatePropagation();return;}
            if(event.key.toLowerCase()==='f'){consume(event);if(!event.repeat)toggleFavorite();return;}
            var index=bindings.keyIndex(event.shiftKey&&/^Digit[0-9]$/.test(event.code||'')?event.code.slice(-1):event.key);
            if(section==='favorites'&&index>=0){consume(event);var row=rows.find(function(r){return r.index===index;});if(row&&!event.repeat)activate(row,event.shiftKey);return;}
            if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
                consume(event);var at=rows.indexOf(currentRow());at=event.key==='Home'?0:event.key==='End'?rows.length-1:(at+(event.key==='ArrowUp'?-1:1)+rows.length)%rows.length;
                var item=list.children[at];if(item){item.querySelector('.first-person-menu-activate').focus({preventScroll:true});item.scrollIntoView({block:'nearest'});}return;
            }
            if(event.key==='Enter'||event.key===' '){
                consume(event);if(!event.repeat){var focused=document.activeElement;if(focused&&focused.classList.contains('first-person-menu-activate')&&event.key==='Enter')activate(currentRow());else if(focused&&focused.tagName==='BUTTON')focused.click();else activate(currentRow());}return;
            }
            event.stopImmediatePropagation();
        }
        function release(){claimed.clear();}
        window.addEventListener('blur',release);
        search.addEventListener('input',function(){selected=null;render();});
        dialog.addEventListener('cancel',function(event){event.preventDefault();close();});
        ['keydown','keypress','keyup','mousedown'].forEach(function(type){dialog.addEventListener(type,function(event){event.stopPropagation();});});
        ['keydown','keypress','keyup'].forEach(function(type){document.addEventListener(type,route,true);});
        var atlases=$('#main,#icons,#gui');atlases.on('load'+namespace,function(){render();});
        $(document).on('party_state_rendered'+namespace+' inventory_art_ready'+namespace+' quickbar_assignments_changed'+namespace,function(){render();})
            .on('game_input_changed'+namespace+' game_ui_changed'+namespace,function(){if(!allowed())close(false);});
        return {open:show,close:close,inputContext:inputContext,isOpen:function(){return dialog.open;},destroy:function(){close(false);preview.destroy();dialog.remove();
            ['keydown','keypress','keyup'].forEach(function(type){document.removeEventListener(type,route,true);});$(document).off(namespace);atlases.off(namespace);window.removeEventListener('blur',release);claimed.clear();contexts.clear();}};
    }
    return {create:create};
});
