-- Check real Temple and overflow generation for Imus Thea's altar.
local altar = dgn.fnum("altar_imus_thea")
assert(altar, "Imus altar feature is not registered")
local count = 0
debug.reset_player_data()
debug.dungeon_setup()
for _, place in ipairs({"Temple:1", "D:2", "D:3", "D:4", "D:5", "D:6", "D:7", "D:8", "D:9", "D:10"}) do
  debug.goto_place(place)
  dgn.reset_level()
  debug.generate_level()
  local err = dgn.last_builder_error()
  if err ~= "" and string.match(err, "^Lua validation for map .+ failed%.$") then
    print(place .. ": nonfatal fallback: " .. err)
  else
    test.map_assert(err == "", place .. ": " .. err)
  end
  local w, h = dgn.grid_bounds()
  for y = 1, h - 2 do
    for x = 1, w - 2 do
      if dgn.grid(x, y) == altar then count = count + 1 end
    end
  end
end
assert(count >= 1, "Imus altar missing from Temple and overflow depths")
print("Imus altar placements across Temple/D:2-10: " .. count)
