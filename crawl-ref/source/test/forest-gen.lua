-- The Forest ending must remain connected, including its shallow ponds.
-- Closed tree rings around the ponds used to veto every Forest:4 build.
debug.goto_place("Forest:4")

-- dgn.max_bounds() is the builder rectangle, which can be smaller than the
-- allocated grid and offset within it. Search the native grid for the rune.
local function has_mossy_rune()
  local y = 1
  while dgn.in_bounds(1, y) do
    local x = 1
    while dgn.in_bounds(x, y) do
      if iter.stack_search(x, y, "mossy rune") then return true end
      x = x + 1
    end
    y = y + 1
  end
  return false
end

for i = 1, 10 do
  crawl.message("Forest:4 connectivity and rune test " .. i .. " of 10")
  test.regenerate_level()
  test.map_assert(dgn.count_disconnected_zones() == 1,
                  "Forest:4 contains disconnected walkable regions")
  test.map_assert(has_mossy_rune(),
                  "Forest:4 is missing its mossy rune")
end
