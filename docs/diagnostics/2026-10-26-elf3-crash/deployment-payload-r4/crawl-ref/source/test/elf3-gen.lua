-- This primary vault plus the castle layout used native coordinates to draw
-- beyond the smaller solo map. Exercise their real placement before generation.
debug.reset_rng("11437096116346730075")
debug.goto_place("Elf:3")
debug.reset_player_data()
dgn.reset_level()
crawl_require("dlua/layout/coordinates.lua")
local castle = dgn.map_by_name("layout_geoelf_castle")
for _, name in ipairs({"grunt_elf_hall_asides", "minmay_elf_hall_furrowed"}) do
  dgn.reset_level()
  local primary = dgn.map_by_name(name)
  local original_tags, original_orient = dgn.tags(primary), dgn.orient(primary)
  dgn.tags(primary, "no_rotate no_vmirror no_hmirror")
  test.map_assert(dgn.place_map(primary, false, true), "Elf:3 primary placement failed")
  local frame = layout_coordinates.builder_frame()
  local x1,x2,y1,y2 = layout_coordinates.primary_vault_dimensions({
    primary_vault_dimensions = function() return dgn.primary_vault_dimensions(primary) end
  }, frame)
  if not frame.contains(x1,x2,y1,y2) then
    test.map_assert(not dgn.place_map(castle, false, true),
                    "Castle accepted a primary outside its local grid")
  end
  if name == "grunt_elf_hall_asides" then
    dgn.reset_level()
    dgn.orient(primary, "float")
    test.map_assert(dgn.place_map(primary, false, true, 60, 52), "Interior primary placement failed")
    test.map_assert(dgn.place_map(castle, false, true), "Compatible castle placement failed")
  end
  dgn.tags(primary, nil)
  dgn.tags(primary, original_tags)
  dgn.orient(primary, original_orient)
end

-- test.find_feature uses dgn.GXM/GYM, initialized to the smaller builder size.
-- Search the actual grid: the first return stair can lie beyond that rectangle.
local function has_return_stairs()
  local upstairs = dgn.fnum("stone_stairs_up_i")
  local y = 1
  while dgn.in_bounds(1, y) do
    local x = 1
    while dgn.in_bounds(x, y) do
      if dgn.grid(x, y) == upstairs then return true end
      x = x + 1
    end
    y = y + 1
  end
  return false
end

-- Include the reported seed without converting its 64-bit value to a Lua float.
local seeds = {"11437096116346730075", "43"}
for seed = 1, 24 do seeds[#seeds + 1] = tostring(seed) end
for _, seed in ipairs(seeds) do
  debug.reset_rng(seed)
  test.regenerate_level("Elf:3")
  test.map_assert(has_return_stairs(),
                  "Elf:3 has no return stairs for seed " .. seed)
end
crawl.stderr("PASS: compatible castle placement, unsafe-placement vetoes and "
             .. #seeds .. " full Elf:3 generations")
