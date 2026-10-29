-- This primary vault plus the castle layout used native coordinates to draw
-- beyond the smaller solo map. Exercise their real placement before generation.
debug.reset_rng("11437096116346730075")
debug.goto_place("Elf:3")
debug.reset_player_data()
dgn.reset_level()
local primary = dgn.map_by_name("grunt_elf_hall_asides")
dgn.tags(primary, "no_rotate no_vmirror no_hmirror")
test.map_assert(dgn.place_map(primary, false, true), "Elf:3 primary placement failed")
test.map_assert(dgn.place_map(dgn.map_by_name("layout_geoelf_castle"),
                             false, true), "Elf:3 castle placement failed")

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
for _, seed in ipairs({"11437096116346730075", "1", "7", "19", "43"}) do
  debug.reset_rng(seed)
  test.regenerate_level("Elf:3")
  test.map_assert(has_return_stairs(),
                  "Elf:3 has no return stairs for seed " .. seed)
end
crawl.stderr("PASS: Elf:3 castle placement and five full level generations")
