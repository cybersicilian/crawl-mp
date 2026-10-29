-- Native data contract shared by the branch catalogue and full-floor previews.
burrows_preview = {}

local function json(value)
    if type(value)=="string" then return string.format("%q",value) end
    if type(value)=="number" or type(value)=="boolean" then return tostring(value) end
    local parts = {}
    if #value>0 or next(value)==nil then
        for _, entry in ipairs(value) do parts[#parts+1]=json(entry) end
        return "[" .. table.concat(parts,",") .. "]"
    end
    local keys = {}
    for key in pairs(value) do keys[#keys+1]=key end
    table.sort(keys)
    for _, key in ipairs(keys) do parts[#parts+1]=json(key) .. ":" .. json(value[key]) end
    return "{" .. table.concat(parts,",") .. "}"
end

function burrows_preview.write_json(filename,value)
    assert(file.writefile(filename,json(value)))
end

function burrows_preview.export(id,title,seed,mode,role,prefix)
    local width,height = dgn.grid_bounds()
    local level = {id=id,title=title,seed=seed,mode=mode,vaultRole=role or "",
        branch=you.branch(),width=width-2,height=height-2,origin=1,
        vaults=debug.vault_names(),features={},grid={},walkable={},
        vaultGrid={},vaultPlacements={},monsters={},items={}}
    local features,vaults = {},{}
    local function vault_id(placement)
        if not placement then return 0 end
        local name = dgn.name(placement:map())
        if string.sub(name,1,7)=="layout_" then return 0 end
        if not vaults[name] then
            local pos,size = placement:pos(),placement:size()
            level.vaultPlacements[#level.vaultPlacements+1] = {
                name=name,x=pos.x,y=pos.y,width=size.x,height=size.y}
            vaults[name]=#level.vaultPlacements
        end
        return vaults[name]
    end
    for _, placement in ipairs(dgn.maps_used_here()) do vault_id(placement) end
    for y=1,height-2 do
        local row,walk,vault = {},{},{}
        for x=1,width-2 do
            local name = dgn.feature_name(dgn.grid(x,y))
            if not features[name] then
                level.features[#level.features+1]=name
                features[name]=#level.features
            end
            row[#row+1]=features[name]
            walk[#walk+1]=dgn.is_passable(x,y) or name=="closed_door"
            vault[#vault+1]=vault_id(dgn.vault_at(x,y))
            local mon = dgn.mons_at(x,y)
            if mon then level.monsters[#level.monsters+1]={x=x,y=y,name=mon.entry_name} end
            for _, item in ipairs(dgn.items_at(x,y)) do
                level.items[#level.items+1]={x=x,y=y,name=item.name(),
                    class=item.class(true),artefact=item.artefact}
            end
        end
        level.grid[#level.grid+1]=row
        level.walkable[#level.walkable+1]=walk
        level.vaultGrid[#level.vaultGrid+1]=vault
    end
    burrows_preview.write_json((prefix or "burrows-preview-") .. id .. ".json",level)
end
