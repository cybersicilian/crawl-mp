-- Exercise the Slime layout and our revived Forest in actual level generation.
debug.reset_rng(19)
local width, height = dgn.grid_bounds()
local door = dgn.fnum("closed_door")
local function walkable(x, y)
  return dgn.is_passable(x, y) or dgn.grid(x, y) == door
end
local function check_connected(context, slime_end)
  local start, total = nil, 0
  local up = { [dgn.fnum("stone_stairs_up_i")] = true,
               [dgn.fnum("stone_stairs_up_ii")] = true,
               [dgn.fnum("stone_stairs_up_iii")] = true }
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if walkable(x, y) then
        if not start or (slime_end and up[dgn.grid(x, y)]) then
          start = {x, y}
        end
        total = total + 1
      end
    end
  end
  test.map_assert(start ~= nil, context .. ": no walkable floor")
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
           and not seen[key] and walkable(x, y) then
          seen[key] = true
          queue[#queue + 1] = {x, y}
        end
      end
    end
  end
  if slime_end then
    -- The Royal Jelly's treasure is intentionally sealed until its death.
    -- The entrance stairs and the boss must still share a reachable region.
    local boss = false
    for y = 1, height - 2 do
      for x = 1, width - 2 do
        local reached = seen[x .. ":" .. y]
        if up[dgn.grid(x, y)] then
          test.map_assert(reached, context .. ": unreachable upstairs")
        end
        local mon = dgn.mons_at(x, y)
        if mon and mon.entry_name == "Royal Jelly" then
          boss = true
          test.map_assert(reached, context .. ": Royal Jelly unreachable")
        end
      end
    end
    test.map_assert(boss, context .. ": Royal Jelly missing")
  else
    test.map_assert(#queue == total, context .. ": connected " .. #queue .. "/" .. total)
  end
end
local function count_feature(name)
  local feature, count = dgn.fnum(name), 0
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      if dgn.grid(x, y) == feature then count = count + 1 end
    end
  end
  return count
end
local function count_monster(name)
  local count = 0
  for y = 1, height - 2 do
    for x = 1, width - 2 do
      local mon = dgn.mons_at(x, y)
      if mon and mon.entry_name == name then count = count + 1 end
    end
  end
  return count
end

-- Force the imported layout to test actual placement, independent of weight.
for depth = 1, 5 do
  for sample = 1, 4 do
    local context = "forced Slime grid " .. depth .. ":" .. sample
    debug.goto_place("Slime:" .. depth)
    debug.reset_player_data()
    dgn.reset_level()
    local layout = dgn.map_by_name("layout_slime_grid")
    test.map_assert(layout ~= nil, context .. ": layout missing")
    test.map_assert(dgn.place_map(layout, false, true), context .. ": placement failed")
    check_connected(context)
  end
end

-- Exercise the real branch builder, entrances, and ordinary stairs.
for _, seed in ipairs({1, 7, 19}) do
  debug.reset_rng(seed)
  for _, branch in ipairs({{"Slime", 5, "exit_slime_pits"}, {"Forest", 4, "exit_forest"}}) do
    for depth = 1, branch[2] do
      local context = branch[1] .. ":" .. depth .. " seed " .. seed
      test.regenerate_level(branch[1] .. ":" .. depth)
      -- The builder may accept a fallback after a nonfatal map-validation veto;
      -- in that case last_builder_error retains the rejected map's message.
      local err = dgn.last_builder_error()
      if err ~= "" and string.match(err, "^Lua validation for map .+ failed%.$") then
        print(context .. ": nonfatal fallback: " .. err)
      else
        test.map_assert(err == "", context .. ": " .. err)
      end
      check_connected(context, branch[1] == "Slime" and depth == branch[2])
      if depth == 1 then
        test.eq(count_feature(branch[3]), 1, context .. ": branch exit")
      else
        for _, stair in ipairs({"stone_stairs_up_i", "stone_stairs_up_ii", "stone_stairs_up_iii"}) do
          test.eq(count_feature(stair), 1, context .. ": upstairs")
        end
      end
      if depth < branch[2] then
        for _, stair in ipairs({"stone_stairs_down_i", "stone_stairs_down_ii", "stone_stairs_down_iii"}) do
          test.eq(count_feature(stair), 1, context .. ": downstairs")
        end
      end
    end
  end
end

-- The adapted Forest encounter should actually place its imported witch.
local witches = 0
for sample = 1, 24 do
  debug.goto_place("Forest:2")
  debug.reset_player_data()
  dgn.reset_level()
  local encounter = dgn.map_by_name("forest_elder_glade")
  test.map_assert(encounter ~= nil, "Forest glade missing")
  test.map_assert(dgn.place_map(encounter, false, true, 15, 15), "Forest glade placement failed")
  witches = witches + count_monster("greenwood witch")
end
test.map_assert(witches > 0, "Forest glade never placed a greenwood witch")
