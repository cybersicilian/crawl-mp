-- Export real native levels for a fully revealed generation preview.
local seed = 20261024
debug.reset_rng(seed)
crawl_require("dlua/burrows_preview.lua")
local function export(id, title, mode, role)
  burrows_preview.export(id,title,seed,mode,role)
end

for _, branch in ipairs({{"Bur",4}, {"Worm",4}, {"Hive",2}}) do
  for depth = 1, branch[2] do
    test.regenerate_level(branch[1] .. ":" .. depth)
    assert(dgn.last_builder_error() == "", dgn.last_builder_error())
    export(string.lower(branch[1]) .. "-" .. depth,
           branch[1] .. ":" .. depth, "native generated floor")
  end
end

for _, entry in ipairs({{"Lair:5","lair-5"}, {"Depths:1","depths-1"}}) do
  test.regenerate_level(entry[1])
  assert(dgn.last_builder_error() == "", dgn.last_builder_error())
  export(entry[2], entry[1], "native generated connection floor")
end

crawl_require("dlua/burrows_catalogue.lua")
for _, entry in ipairs(burrows_vault_catalogue()) do
  debug.goto_place(entry[2])
  debug.reset_player_data()
  dgn.reset_level()
  assert(dgn.place_map(dgn.map_by_name(entry[1]),false,true,15,15))
  export(entry[1],entry[3],"native placed " .. entry[4] .. " vault",entry[4])
end

-- More than one seed makes the absence of fixed room rows visible.
for _, variant_seed in ipairs({20261025,20261026}) do
  seed = variant_seed
  debug.reset_rng(seed)
  for _, entry in ipairs({{"Worm:2","worm"}, {"Hive:1","hive"}}) do
    test.regenerate_level(entry[1])
    assert(dgn.last_builder_error() == "", dgn.last_builder_error())
    export(entry[2] .. "-seed-" .. seed, entry[1] .. " / " .. seed,
           "native generated seed variant")
  end
end

