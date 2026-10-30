-- Exercise the imported end hall through the native vault placer.
debug.reset_player_data()
debug.dungeon_setup()
debug.goto_place("Zot:5")
local hall = dgn.map_by_name("hall_of_Zot_bcrawl")
test.map_assert(hall ~= nil, "missing alternate Zot hall")
local width, height = dgn.grid_bounds()
local dais = dgn.fnum("orb dais")
local door = dgn.fnum("closed_door")

for _, seed in ipairs({1, 7, 19, 101}) do
  debug.reset_player_data()
  debug.reset_rng(seed)
  debug.dungeon_setup()
  debug.goto_place("Zot:5")
  dgn.reset_level()
  test.map_assert(dgn.place_map(hall, false, true),
                  "alternate Zot hall failed placement, seed " .. seed)
  local orbs, gems, daises, start, floors = 0, 0, 0, nil, 0
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if dgn.grid(x, y) == dais then
        daises = daises + 1
        start = {x, y}
      end
      if dgn.is_passable(x, y) or dgn.grid(x, y) == door then
        floors = floors + 1
      end
      for _, item in ipairs(dgn.items_at(x, y)) do
        local name = string.lower(item.name(""))
        if string.find(name, "orb of zot", 1, true) then orbs = orbs + 1 end
        if string.find(name, "prismatic gem", 1, true) then gems = gems + 1 end
      end
    end
  end
  test.eq(orbs, 1, "alternate Zot hall Orb, seed " .. seed)
  test.eq(gems, 1, "alternate Zot hall gem, seed " .. seed)
  test.eq(daises, 1, "alternate Zot hall dais, seed " .. seed)
  test.map_assert(start ~= nil, "missing dais in alternate Zot hall")
  local queue, seen, head = {start}, {}, 1
  seen[start[1] .. ":" .. start[2]] = true
  while head <= #queue do
    local p = queue[head]
    head = head + 1
    for dy = -1, 1 do
      for dx = -1, 1 do
        local x, y = p[1] + dx, p[2] + dy
        local key = x .. ":" .. y
        if x > 0 and y > 0 and x < width - 1 and y < height - 1
           and not seen[key] and (dgn.is_passable(x, y) or dgn.grid(x, y) == door) then
          seen[key] = true
          queue[#queue + 1] = {x, y}
        end
      end
    end
  end
  test.eq(#queue, floors, "alternate Zot hall connected floor, seed " .. seed)
end

-- Fixed seeds exercise the real level builder's weighted choice of both halls.
local found_original, found_alternate = false, false
for seed = 1, 24 do
  debug.reset_rng(seed)
  test.regenerate_level("Zot:5")
  local names = debug.vault_names()
  if string.find(names, "hall_of_Zot_bcrawl", 1, true) then
    found_alternate = true
  elseif string.find(names, "hall_of_Zot", 1, true) then
    found_original = true
  end
  if found_original and found_alternate then break end
end
test.map_assert(found_original, "normal Zot generation never selected the original hall")
test.map_assert(found_alternate, "normal Zot generation never selected the alternate hall")
