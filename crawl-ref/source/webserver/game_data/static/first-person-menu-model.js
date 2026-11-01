/* Catalog projection shared by the full inventory browser and compact favorites. */
define(["./quickbar-model"],function(bindings){
    "use strict";
    var groups=[['all','All items'],['weapons','Weapons'],['apparel','Apparel'],['jewelry','Jewelry'],
        ['potions','Potions'],['scrolls','Scrolls'],['devices','Devices'],['books','Books'],['other','Other']];
    function category(item){
        var kind=String(item.kind_name||'').toLowerCase();
        return /weapon|stave|staff/.test(kind)?'weapons':/armour|armor/.test(kind)?'apparel':/jewel|ring|amulet/.test(kind)?'jewelry'
            :/potion/.test(kind)?'potions':/scroll/.test(kind)?'scrolls':/wand|miscellan|device/.test(kind)?'devices'
            :/book/.test(kind)?'books':'other';
    }
    function identity(entry){var binding=entry.binding||entry;return JSON.stringify([binding.kind,binding.id,binding.action||null,binding.action?binding.uid:null]);}
    function entries(hero,section,group,query,favorites){
        var rows;
        if(section==='favorites')rows=(favorites||[]).map(function(favorite){return {kind:favorite.binding.kind,id:favorite.binding.id,
            binding:favorite.binding,data:favorite.entry||favorite.binding.last_item||{name:'Unavailable action'},missing:!favorite.entry,index:favorite.index};});
        else {
            var kind=section==='magic'?'spell':section==='abilities'?'ability':'item';
            rows=(hero&&hero[kind==='item'?'inventory':kind==='spell'?'spells':'abilities']||[]).map(function(data){
                var id=kind==='item'?data.slot:data.id;return {kind:kind,id:id,binding:{kind:kind,id:id},data:data};
            });
        }
        var search=String(query||'').trim().toLowerCase();
        return rows.filter(function(row){return (group==='all'||row.kind!=='item'||category(row.data)===group)
            &&[row.data.name,row.data.kind_name,row.data.schools].join(' ').toLowerCase().includes(search);});
    }
    function favoriteIndex(row,favorites){
        var result=(favorites||[]).find(function(f){return bindings.same(f.binding,row.binding||row);});
        return result?result.index:-1;
    }
    function shortcut(event){
        if(!event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return null;
        var letter=/^Key[IMQ]$/.test(event.code||'')?event.code.slice(3).toLowerCase():String(event.key||'').toLowerCase();
        return {i:'inventory',m:'magic',q:'favorites'}[letter]||null;
    }
    return {shortcut:shortcut,groups:groups,category:category,entries:entries,identity:identity,favoriteIndex:favoriteIndex};
});
