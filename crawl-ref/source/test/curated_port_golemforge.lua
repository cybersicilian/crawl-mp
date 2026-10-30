-- Check actual vault placement, treasure, inhabitants, and portal features.
debug.reset_rng(19)
test.regenerate_level("Forge:1")
test.map_assert(dgn.last_builder_error() == "", dgn.last_builder_error())

local width, height = dgn.grid_bounds()
local pieces = { ["golem helmet"] = 0, ["golem armour"] = 0,
                 ["golem gauntlets"] = 0, ["golem greaves"] = 0 }
local monsters = { ["machine golem"] = 0, ["iron golem"] = 0,
                   ["crystal guardian"] = 0, ["ancient automaton"] = 0 }
local exits = 0
local exit_feature = dgn.fnum("exit_golemforge")
for y = 1, height - 2 do
  for x = 1, width - 2 do
    if dgn.grid(x, y) == exit_feature then exits = exits + 1 end
    local mon = dgn.mons_at(x, y)
    if mon and monsters[mon.entry_name] then
      monsters[mon.entry_name] = monsters[mon.entry_name] + 1
    end
    for _, item in ipairs(dgn.items_at(x, y)) do
      local name = string.lower(item.name(""))
      for piece in pairs(pieces) do
        if string.find(name, piece, 1, true) then
          pieces[piece] = pieces[piece] + 1
        end
      end
    end
  end
end
test.eq(exits, 1, "Golemforge exit")
for piece, count in pairs(pieces) do
  test.eq(count, 1, "Golemforge masterwork: " .. piece)
end
for name, count in pairs(monsters) do
  test.map_assert(count > 0, "Golemforge missing " .. name)
end

debug.goto_place("Elf:2")
debug.reset_player_data()
dgn.reset_level()
local entry = dgn.map_by_name("portal_golemforge_entry")
test.map_assert(entry ~= nil, "missing Golemforge entrance vault")
-- The reset level is solid rock, so there is no existing floor on which the
-- floating entrance can choose a location. Place it explicitly, as other
-- isolated vault tests do.
test.map_assert(dgn.place_map(entry, false, true, 15, 15), "entrance placement failed")
local entrances = 0
local entrance_feature = dgn.fnum("enter_golemforge")
for y = 1, height - 2 do
  for x = 1, width - 2 do
    if dgn.grid(x, y) == entrance_feature then entrances = entrances + 1 end
  end
end
test.eq(entrances, 1, "Golemforge entrance")
