-- Native generation survey, separate from the live combat games.
crawl_require('dlua/route_audit.lua')
local routes={
    {'Bur:1','Bur:2','Hive:1','Hive:2','Bur:3','Bur:4','Worm:1','Worm:2','Worm:3','Worm:4'},
    {'D:11','D:12','D:13','D:14','D:15'},
    {'Snake:1','Snake:2','Snake:3','Snake:4'},
    {'Spider:1','Spider:2','Spider:3','Spider:4'},
    {'Depths:1','Depths:2'}
}
local records={}
for offset=1,12 do
    local seed=2026102700+offset
    for route,places in ipairs(routes) do
        debug.reset_rng(seed)
        debug.reset_player_data()
        for _,place in ipairs(places) do
            debug.goto_place(place)
            dgn.reset_level()
            debug.generate_level()
            assert(dgn.last_builder_error()=='',dgn.last_builder_error())
            local w,h=dgn.grid_bounds()
            local entries,positions={},{}
            local record={seed=seed,route=route,place=place,monsters=0,xp=0,roster={},
                items=0,gold=0,artefacts=0,honey=0,classes={},vaults=debug.vault_names()}
            for y=1,h-2 do for x=1,w-2 do
                local feature=dgn.feature_name(dgn.grid(x,y))
                if feature:find('stone_stairs_up_',1,true) then entries[#entries+1]={x,y} end
                if feature=='shallow_honey' then record.honey=record.honey+1 end
                local m=dgn.mons_at(x,y)
                if m then
                    positions[#positions+1]={x,y}
                    record.monsters=record.monsters+1
                    record.xp=record.xp+m.experience
                    record.roster[m.entry_name]=(record.roster[m.entry_name] or 0)+1
                end
                for _,item in ipairs(dgn.items_at(x,y)) do
                    local class=item.class(true)
                    record.items=record.items+1
                    record.classes[class]=(record.classes[class] or 0)+1
                    if class=='gold' then record.gold=record.gold+item.quantity end
                    if item.artefact then record.artefacts=record.artefacts+1 end
                end
            end end
            record.entryNearby3=0
            for _,p in ipairs(positions) do
                local near=false
                for _,entry in ipairs(entries) do
                    if math.max(math.abs(p[1]-entry[1]),math.abs(p[2]-entry[2]))<=3 then near=true end
                end
                if near then record.entryNearby3=record.entryNearby3+1 end
            end
            if place=='Worm:4' or place=='Hive:2' then
                assert(#entries==3 and record.entryNearby3==0,'Crowded ending arrival: '..place)
            end
            if place:find('Hive:' ,1,true) then
                record.dryConnected=route_audit.dry_connected()
                assert(record.dryConnected,'Honey disconnected '..place)
            end
            if seed==2026102701 and route==1 then
                burrows_preview.export(place:gsub(':','-'):lower(),place,seed,
                    'native tuned floor','','route-floor-')
            end
            records[#records+1]=record
        end
    end
    crawl.stderr('ECONOMY_PROGRESS seed '..seed..' floors '..#records)
end
burrows_preview.write_json('route-economy.json',records)
crawl.stderr('ECONOMY_PASS '..#records..' native floors across twelve seeds')
