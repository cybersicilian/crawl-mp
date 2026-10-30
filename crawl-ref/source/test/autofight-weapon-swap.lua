-- Exercise the real autofight.lua decision path with deterministic client API
-- substitutes. This does not replace an in-engine multiplayer turn test.
-- Run from crawl-ref/source: lua test/autofight-weapon-swap.lua
local actor, targets, commands, messages
local players = {}
chk_lua_option = {}

local function player(ranged, enabled)
  return {ranged = ranged, enabled = enabled, turns = 0, x = 0, y = 0}
end
local function enemy(x, y)
  return {x = x, y = y, name = function() return "orc" end,
    is_damage_immune = function(self) return self.immune or false end,
    is = function(_, name) return name == "warding" end,
    is_safe = function() return false end,
    is_constricting_you = function() return false end,
    stabbability = function() return 0 end,
    damage_level = function() return 0 end,
    threat = function() return 0 end,
    status = function() return false end}
end
monster = {get_monster_at = function(x, y)
  for _, m in ipairs(targets) do if m.x == x and m.y == y then return m end end
end}
items = {equipped_at = function() return {is_ranged = actor.ranged, is_melded = false} end}
you = {
  los = function() return 7 end, reach_range = function() return actor.reach or 1 end,
  see_cell_no_trans = function() return not actor.blocked end,
  see_cell_solid_see = function() return not actor.blocked end,
  quiver_valid = function() return false end, quiver_enabled = function() return false end,
  has_good_stab = function() return false end, hp = function() return 100, 100 end,
  confused = function() return false end, caught = function() return nil end,
  status = function() return false end, is_web_immune = function() return true end,
}
view = {can_reach = function() return true end, feature_at = function() return "floor" end,
  is_safe_square = function() return true end, cell_see_cell = function() return true end}
autofight = {
  is_piercing = function() return false end,
  is_candidate_for_attack = function(x, y) return monster.get_monster_at(x, y) ~= nil end,
  weapon_swap_available = function(want_ranged)
    return actor.enabled and not actor.warning and actor.ranged ~= want_ranged
  end,
  best_aim = function(x, y) if actor.blocked_aim then return 0, 0 end return x, y end,
}
crawl = {
  weapon_check = function() return true end,
  mpr = function(s) messages[#messages + 1] = s end,
  do_commands = function(cmds)
    for _, cmd in ipairs(cmds) do
      commands[#commands + 1] = {name = cmd, actor = actor}
      if cmd == "CMD_WEAPON_SWAP" then actor.ranged = not actor.ranged end
      actor.turns = actor.turns + 1
    end
  end,
  do_targeted_command = function(cmd, x, y)
    commands[#commands + 1] = {name = cmd, x = x, y = y, actor = actor}
    actor.turns = actor.turns + 1
  end,
}
dofile("dat/clua/autofight.lua")
local function setup(ranged, enabled, target)
  players = {player(ranged, enabled), player(false, true)}
  actor, targets, commands, messages = players[1], {target}, {}, {}
end
local function command(expected)
  assert(#commands == 1, "expected one command, got " .. #commands)
  assert(commands[1].name == expected, "expected " .. expected .. ", got " .. commands[1].name)
  assert(commands[1].actor == players[1] and players[1].turns == 1 and players[2].turns == 0)
end

setup(false, true, enemy(3, 0)); hit_closest(); command("CMD_WEAPON_SWAP")
assert(actor.x == 0 and actor.y == 0 and actor.ranged)
commands = {}; hit_closest(); assert(commands[1].name == "CMD_PRIMARY_ATTACK")
assert(commands[1].x == 3 and commands[1].y == 0)
setup(true, true, enemy(1, 0)); hit_closest(); command("CMD_WEAPON_SWAP")
commands = {}; hit_closest(); assert(commands[1].name == "CMD_ATTACK_RIGHT")
setup(true, true, enemy(3, 0)); targets[2] = enemy(1, 0)
hit_closest(); command("CMD_WEAPON_SWAP")
commands = {}; hit_closest(); assert(commands[1].name == "CMD_ATTACK_RIGHT")
setup(false, true, enemy(3, 0)); hit_closest_nomove(); command("CMD_WEAPON_SWAP")
setup(false, false, enemy(3, 0)); hit_closest_nomove(); assert(#commands == 0)
setup(false, true, enemy(3, 0)); actor.warning = true; hit_closest_nomove(); assert(#commands == 0)
setup(false, true, enemy(3, 0)); actor.blocked = true; hit_closest_nomove(); assert(#commands == 0)
setup(false, true, enemy(3, 0)); actor.blocked_aim = true; hit_closest_nomove(); assert(#commands == 0)
setup(false, true, enemy(3, 0)); fire_closest(); command("CMD_FIRE")
setup(false, true, enemy(2, 0)); actor.reach = 2; hit_closest(); command("CMD_PRIMARY_ATTACK")
setup(false, true, enemy(3, 0)); targets[1].immune = true; hit_closest_nomove(); assert(#commands == 0)
print("autofight Lua decision scenarios passed (substituted client API)")
