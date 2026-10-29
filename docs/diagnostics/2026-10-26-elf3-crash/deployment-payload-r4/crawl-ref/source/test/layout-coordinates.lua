crawl_require("dlua/layout/coordinates.lua")

-- Solo through four-player sizes, a full-grid identity, and an odd grid gap.
for _, size in ipairs({{80, 70}, {94, 82}, {106, 92}, {120, 104}, {81, 71}}) do
  local width, height = size[1], size[2]
  local frame = layout_coordinates.centered(width, height, 120, 104)
  local origin_x, origin_y = frame.to_grid(0, 0)
  test.eq(origin_x, math.floor((120 - width) / 2))
  test.eq(origin_y, math.floor((104 - height) / 2))
  local x, y = frame.to_local(frame.to_grid(width - 1, height - 1))
  test.eq(x, width - 1)
  test.eq(y, height - 1)

  local map = {primary_vault_dimensions = function()
    return origin_x + 2, origin_x + width - 3,
           origin_y + 3, origin_y + height - 4
  end}
  local left, right, top, bottom =
    layout_coordinates.primary_vault_dimensions(map, frame)
  test.eq(left, 2)
  test.eq(right, width - 3)
  test.eq(top, 3)
  test.eq(bottom, height - 4)
  test.eq(frame.contains(left, right, top, bottom), true)
  test.eq(frame.contains(-1, right, top, bottom), false)
  test.eq(frame.contains(left, width, top, bottom), false)
  test.eq(frame.contains(left, right, -1, bottom), false)
  test.eq(frame.contains(left, right, top, height), false)
  assert(layout_coordinates.primary_vault_dimensions(
    {primary_vault_dimensions = function() return nil end}, frame) == nil)
end

local original_max_bounds, original_in_bounds = dgn.max_bounds, dgn.in_bounds
dgn.max_bounds = function() return 80, 70 end
dgn.in_bounds = function(x, y)
  return x > 0 and x < 119 and y > 0 and y < 103
end
local frame = layout_coordinates.builder_frame()
local x, y = frame.to_grid(0, 0)
test.eq(x, 20)
test.eq(y, 17)
dgn.max_bounds, dgn.in_bounds = original_max_bounds, original_in_bounds
