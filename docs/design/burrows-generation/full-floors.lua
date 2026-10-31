-- Complete native floors: standard layouts, vault placement, population and loot.
crawl_require("dlua/burrows_preview.lua")
local samples = {
    {"bur-1","Bur:1",2026102401},
    {"bur-2","Bur:2",2026102402},
    {"bur-4","Bur:4",2026102403},
    {"worm-1","Worm:1",2026102430,{"worm_mushroom_grove","worm_fungal_nursery","worm_rootbound_pool"}},
    {"worm-2","Worm:2",2026102480,{"worm_deathcap_hollow","worm_rotten_pack","worm_spore_gallery","worm_mushroom_grove"}},
    {"worm-4","Worm:4",2026102530,{"worm_end_fungal_heart"}},
    {"hive-1","Hive:1",2026102421},
    {"hive-2a","Hive:2",2026102422},
    {"hive-2b","Hive:2",2026102423}
}
local candidates = {}
for _, sample in ipairs(samples) do
    local selected = false
    for attempt=0,(sample[4] and 31 or 0) do
        local seed=sample[3]+attempt
        debug.reset_rng(seed)
        test.regenerate_level(sample[2])
        assert(dgn.last_builder_error()=="",dgn.last_builder_error())
        local matches = not sample[4]
        local names = debug.vault_names()
        for _, target in ipairs(sample[4] or {}) do
            if string.find(names,target,1,true) then matches=true end
        end
        if sample[4] then
            local id=sample[1] .. "-seed-" .. seed
            burrows_preview.export(id,sample[2],seed,"native candidate floor","","burrows-candidate-")
            candidates[#candidates+1]={id=id,place=sample[2],seed=seed,selected=matches,vaults=names}
        end
        if matches then
            burrows_preview.export(sample[1],sample[2],seed,
                "native generated floor","","burrows-floor-")
            selected=true
            break
        end
    end
    assert(selected,"No naturally generated fungal example for " .. sample[2])
end
burrows_preview.write_json("burrows-candidate-index.json",candidates)
