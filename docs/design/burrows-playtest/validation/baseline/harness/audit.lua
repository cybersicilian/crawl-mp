-- Read-only level telemetry and stair navigation, kept out of combat decisions.
crawl_require("dlua/burrows_preview.lua")
route_audit = {}
function route_audit.snapshot(tag)
    local width,height=dgn.grid_bounds()
    local result={tag=tag,where=you.where(),turn=you.turns(),xl=you.xl(),
        progress=you.xl_progress(),monsters={},items={},xp=0,vaults=debug.vault_names()}
    result.hp,result.maxhp=you.hp()
    result.mp,result.maxmp=you.mp()
    for y=1,height-2 do
        for x=1,width-2 do
            local m=dgn.mons_at(x,y)
            if m then
                local xp=m.experience
                result.xp=result.xp+xp
                result.monsters[#result.monsters+1]={name=m.entry_name,x=x,y=y,xp=xp}
            end
            for _,item in ipairs(dgn.items_at(x,y)) do
                result.items[#result.items+1]={name=item.name(),class=item.class(true),
                    quantity=item.quantity,artefact=item.artefact,x=x,y=y}
            end
        end
    end
    crawl.stderr("ROUTE_AUDIT "..route_audit.encode(result))
    return #result.monsters
end
function route_audit.encode(value)
    if type(value)=="string" then return string.format("%q",value) end
    if type(value)=="number" or type(value)=="boolean" then return tostring(value) end
    local parts={}
    if #value>0 or next(value)==nil then
        for _,v in ipairs(value) do parts[#parts+1]=route_audit.encode(v) end
        return "["..table.concat(parts,",").."]"
    end
    for k,v in pairs(value) do parts[#parts+1]=route_audit.encode(k)..":"..route_audit.encode(v) end
    return "{"..table.concat(parts,",").."}"
end
function route_audit.step(feature)
    local width,height=dgn.grid_bounds()
    local sx,sy=you.pos()
    local queue,head,visited={{sx,sy}},1,{[sx..":"..sy]=true}
    while head<=#queue do
        local p=queue[head];head=head+1
        if dgn.feature_name(dgn.grid(p[1],p[2]))==feature then
            return p[3] or "arrived"
        end
        for dy=-1,1 do for dx=-1,1 do
            local x,y=p[1]+dx,p[2]+dy
            local key=x..":"..y
            if x>0 and y>0 and x<width-1 and y<height-1 and not visited[key]
               and (dgn.is_passable(x,y) or dgn.feature_name(dgn.grid(x,y))=="closed_door") then
                visited[key]=true
                queue[#queue+1]={x,y,p[3] or (dx..","..dy)}
            end
        end end
    end
    return "missing"
end
