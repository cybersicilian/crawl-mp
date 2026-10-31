-- Exercise actual native vault placement and branch generation.
debug.reset_rng(1)
local context = ""
local width, height = dgn.grid_bounds()
local closed_door = dgn.fnum("closed_door")
local function passable(x, y)
  return dgn.is_passable(x, y) or dgn.grid(x, y) == closed_door
end

local function connected()
  local first, floors = nil, 0
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if passable(x, y) then
        first = first or {x, y}
        floors = floors + 1
      end
    end
  end
  assert(first, "No walkable floor")
  local queue, visited, head = {first}, {}, 1
  visited[first[1] .. ":" .. first[2]] = true
  while head <= #queue do
    local p = queue[head]
    head = head + 1
    for dy = -1, 1 do
      for dx = -1, 1 do
        local x, y = p[1] + dx, p[2] + dy
        local key = x .. ":" .. y
        if x > 0 and y > 0 and x < width - 1 and y < height - 1
           and not visited[key] and passable(x, y) then
          visited[key] = true
          queue[#queue + 1] = {x, y}
        end
      end
    end
  end
  local missing = {}
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if passable(x, y) and not visited[x .. ":" .. y] and #missing < 5 then
        missing[#missing + 1] = x .. ":" .. y .. "=" .. dgn.grid(x, y)
      end
    end
  end
  test.map_assert(#queue == floors, context .. ": connected " .. #queue
    .. "/" .. floors .. "; unreached " .. table.concat(missing, ","))
end

local function feature_count(name)
  local feature, count = dgn.fnum(name), 0
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if dgn.grid(x, y) == feature then count = count + 1 end
    end
  end
  return count
end

local function count_items(name)
  local count = 0
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if iter.stack_search(x, y, name) then count = count + 1 end
    end
  end
  return count
end

crawl_require("dlua/burrows_catalogue.lua")
local vaults = burrows_vault_catalogue()
-- Verify the authored encounters that carry the branch's build pressures.
local pressure_vaults = {
  bur_claw_through={"burrowing beast", "crag boar"},
  bur_drake_overlook={"shale drake", "crag boar"},
  bur_delver_workshop={"deep troll delver", "earth elemental"},
  bur_end_split_delve={"deep troll delver", "shale drake", "burrowing beast", "crag boar"},
  worm_mushroom_grove={"wandering mushroom", "coil worm"},
  worm_deathcap_hollow={"deathcap", "gallery worm"},
  worm_fungal_nursery={"fungus"},
  worm_spore_gallery={"coil worm", "deathcap"},
  worm_rotten_pack={"caustic worm", "wandering mushroom"},
  worm_capstone_ring={"deathcap", "coil worm"},
  worm_rootbound_pool={"gallery worm", "wandering mushroom"},
  worm_end_fungal_heart={"gallery worm", "coil worm", "deathcap", "wandering mushroom"},
  hive_beetle_gate={"wax beetle", "venom wasp"},
  hive_queen_gallery={"queen bee", "killer bee"},
  hive_spark_crossing={"spark wasp", "wax beetle"},
  hive_lost_apothecary={"venom wasp", "wax beetle"},
  hive_winged_hunt={"meliai", "venom wasp"},
  hive_amber_jewels={"queen bee", "killer bee"},
  hive_end_amber_brood={"queen bee", "venom wasp", "wax beetle", "killer bee"},
  worm_delvers_cache={"caustic worm", "coil worm"},
  worm_buried_armoury={"iron troll", "caustic worm"},
  worm_corroded_gallery={"coil worm", "caustic worm"},
  uniq_old_coil={"Old Coil"},
  hive_amber_store={"wax beetle", "venom wasp"},
  hive_raided_satchel={"meliai", "wax beetle"},
  hive_guard_line={"wax beetle", "venom wasp", "killer bee"},
  uniq_vespara={"Vespara", "killer bee", "wax beetle"},
  worm_double_mouth={"gallery worm", "coil worm"},
  worm_troll_cut={"iron troll", "deep troll shaman"},
  hive_split_brood={"queen bee", "killer bee", "killer bee larva"},
  hive_wasp_roost={"spark wasp", "killer bee"},
  hive_meliai_shelter={"meliai", "killer bee"}
}
-- Slash-separated classes are alternatives for a single native item slot.
local loot_vaults = {
  worm_delvers_cache={["weapon/armour"]=1,wand=1,potion=1,gold=1},
  worm_buried_armoury={armour=1,weapon=1,scroll=1,gold=1},
  hive_amber_store={jewellery=1,potion=2,gold=1},
  hive_raided_satchel={["book/wand"]=1,potion=1,scroll=1,gold=1},
  uniq_old_coil={["weapon/armour"]=1,gold=2},
  uniq_vespara={jewellery=1,gold=1},
  bur_delver_workshop={["weapon/armour"]=1,wand=1,gold=1},
  worm_spore_gallery={wand=1},
  worm_rotten_pack={["weapon/armour"]=1,potion=1,gold=1},
  hive_lost_apothecary={potion=1,scroll=1,gold=1},
  hive_amber_jewels={jewellery=1,book=1,gold=1}
}
local function floor_items()
  local found = {}
  for y=1,height-2 do
    for x=1,width-2 do
      for _, item in ipairs(dgn.items_at(x,y)) do found[#found+1]=item end
    end
  end
  return found
end
local function item_class(item)
  return item.class(true)
end
-- The legacy test iterator caches 80x70 bounds. Encompass vaults can occupy
-- the whole native grid, so count their guards over the actual grid bounds.
local function monster_counts()
  local counts = {}
  for y=1,height-2 do
    for x=1,width-2 do
      local mon = dgn.mons_at(x,y)
      if mon then counts[mon.entry_name]=(counts[mon.entry_name] or 0)+1 end
    end
  end
  return counts
end
local ordinary = {Bur=0,Worm=0,Hive=0}
for _, entry in ipairs(vaults) do
  if entry[4]=="ordinary" then
    local branch=string.match(entry[2],"([^:]+)")
    ordinary[branch]=ordinary[branch]+1
  end
end
for branch,count in pairs(ordinary) do
  assert(count>=20,branch .. ": fewer than twenty ordinary vaults")
end
local placements, floors = 0, 0
local fungi = {["wandering mushroom"]=0,deathcap=0}
for _, entry in ipairs(vaults) do
  for variant = 1, 3 do
    context = entry[1] .. " variant " .. variant
    debug.goto_place(entry[2])
    debug.reset_player_data()
    dgn.reset_level()
    local map = dgn.map_by_name(entry[1])
    assert(map, "Missing vault " .. entry[1])
    test.map_assert(dgn.place_map(map, false, true, 15, 15),
                    "Cannot place vault " .. entry[1])
    connected()
    placements=placements+1
    local occupants = monster_counts()
    for _, monster in ipairs(pressure_vaults[entry[1]] or {}) do
      test.map_assert((occupants[monster] or 0)>0, context .. ": missing " .. monster)
    end
    if entry[1] == "hive_split_brood" then
      test.eq(occupants["killer bee larva"] or 0, 3,
              context .. ": larval brood count")
      test.eq(occupants["queen bee"] or 0, 1,
              context .. ": queen count")
    end
    local reward = loot_vaults[entry[1]]
    if reward then
      local classes, artifacts = {}, 0
      for _, item in ipairs(floor_items()) do
        local class = item_class(item)
        classes[class] = (classes[class] or 0)+1
        if item.artefact then artifacts=artifacts+1 end
      end
      for alternatives, minimum in pairs(reward) do
        local count = 0
        for class in string.gmatch(alternatives, "[^/]+") do
          count=count+(classes[class] or 0)
        end
        test.map_assert(count>=minimum,context .. ": missing " .. alternatives)
      end
      if string.find(entry[1], "uniq_", 1, true) then
        test.eq(artifacts,1,context .. ": ordinary randart reward")
      end
    end
    if string.find(entry[1], "worm_end_", 1, true)
       or string.find(entry[1], "hive_end_", 1, true) then
      for _, stair in ipairs({"stone_stairs_up_i", "stone_stairs_up_ii",
                              "stone_stairs_up_iii"}) do
        test.eq(feature_count(stair), 1, context)
      end
      local items = 0
      for y=1,height-2 do
        for x=1,width-2 do items = items+#dgn.items_at(x,y) end
      end
      test.eq(items,6,context .. ": ending reward budget")
      local worm = string.find(entry[1], "worm_end_", 1, true)
      local allowed = worm and {weapon=true,armour=true,["magical staff"]=true,wand=true}
        or {jewellery=true,book=true,wand=true}
      local gold, treasure = 0, 0
      for _, item in ipairs(floor_items()) do
        local class = item_class(item)
        if class=="gold" then gold=gold+1
        else
          test.map_assert(allowed[class],context .. ": unexpected reward " .. class)
          treasure=treasure+1
        end
      end
      test.eq(gold,3,context)
      test.eq(treasure,3,context)
      if string.find(entry[1], "worm_end_", 1, true) then
        test.eq(feature_count("wormlands_to_depths"), 1, context)
      end
    end
    if string.find(entry[1], "bur_end_", 1, true) then
      test.eq(feature_count("enter_wormlands"), 1, entry[1])
      test.eq(count_items("ochre gem"), 1, context)
      if entry[1] == "bur_end_worldworm" then
        test.eq(occupants.Worldworm or 0, 1, entry[1])
      end
    elseif string.find(entry[1], "bur_entry_", 1, true) then
      test.eq(feature_count("enter_burrows"), 1, context)
    end
  end
end

for _, seed in ipairs({1, 7, 19, 43}) do
  debug.reset_rng(seed)
  for _, branch in ipairs({{"Bur",4}, {"Worm",4}, {"Hive",2}}) do
   for depth = 1, branch[2] do
    for iteration = 1, 2 do
      local place = branch[1] .. ":" .. depth
      context = "seed " .. seed .. " " .. place .. " iteration " .. iteration
      test.regenerate_level(place)
      assert(dgn.last_builder_error() == "", context .. ": " .. dgn.last_builder_error())
      connected()
      floors=floors+1
      if branch[1]=="Worm" then
        local occupants = monster_counts()
        for name in pairs(fungi) do fungi[name]=fungi[name]+(occupants[name] or 0) end
      end
      test.eq(count_items("clay rune of Zot"), 0, context)
      for _, stair in ipairs({"stone_stairs_down_i", "stone_stairs_down_ii",
                              "stone_stairs_down_iii"}) do
        test.eq(feature_count(stair), depth < branch[2] and 1 or 0, context)
      end
      if depth > 1 then
        for _, stair in ipairs({"stone_stairs_up_i", "stone_stairs_up_ii",
                                "stone_stairs_up_iii"}) do
          test.eq(feature_count(stair), 1, context)
        end
      end
      if depth == 1 then
        local exits = {Bur="exit_burrows", Worm="exit_wormlands", Hive="exit_hive"}
        test.eq(feature_count(exits[branch[1]]), 1, context)
      end
      if branch[1] == "Bur" then
        test.eq(feature_count("enter_wormlands"), depth == 4 and 1 or 0, context)
        test.eq(feature_count("enter_hive"), depth == 2 and 1 or 0, context)
        test.eq(count_items("ochre gem"), depth == 4 and 1 or 0, context)
      elseif branch[1] == "Worm" then
        test.eq(feature_count("wormlands_to_depths"), depth == 4 and 1 or 0, context)
        local layout = depth < 4 and "layout_wormlands" or "worm_end_"
        test.map_assert(string.find(debug.vault_names(), layout, 1, true), context)
      else
        local layout = depth < 2 and "layout_hive" or "hive_end_"
        test.map_assert(string.find(debug.vault_names(), layout, 1, true), context)
        test.eq(feature_count("web"), 0, context)
      end
    end
   end
  end
  test.regenerate_level("Lair:5")
  floors=floors+1
  test.eq(feature_count("enter_burrows"), 1, "Burrows always beneath Lair")
  test.regenerate_level("Depths:1")
  floors=floors+1
  test.eq(feature_count("depths_to_wormlands"), 1, "Return path from Depths")
  test.eq(feature_count("exit_depths"), 1, "Original Depths exit preserved")
end

-- The normal placement API must reject an already generated unique, including
-- after its original level is cleared. Do not reset player data between tries.
for _, entry in ipairs({{"Old Coil","Worm:2"},{"Vespara","Hive:1"}}) do
  debug.goto_place(entry[2])
  debug.reset_player_data()
  dgn.reset_level()
  dgn.grid(20,20,"floor")
  dgn.grid(22,20,"floor")
  local first = dgn.create_monster(20,20,entry[1])
  test.map_assert(first and first.unique,entry[1] .. ": missing unique flag")
  test.map_assert(not dgn.create_monster(22,20,entry[1]),entry[1] .. ": duplicate unique")
  dgn.dismiss_monsters()
  test.map_assert(not dgn.create_monster(22,20,entry[1]),entry[1] .. ": unique history lost")
end

for name,count in pairs(fungi) do
  assert(count>0,"Generated Wormlands omitted " .. name)
end
assert(file.writefile("burrows-validation-counts.json", string.format(
  '{"vaults":%d,"placements":%d,"floors":%d,"ordinary":{"Bur":%d,"Worm":%d,"Hive":%d},"wanderingMushrooms":%d,"deathcaps":%d}',
  #vaults,placements,floors,ordinary.Bur,ordinary.Worm,ordinary.Hive,
  fungi["wandering mushroom"],fungi.deathcap)))
