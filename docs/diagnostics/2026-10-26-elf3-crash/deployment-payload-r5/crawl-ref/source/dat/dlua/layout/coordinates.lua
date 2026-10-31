-- Encompass layouts use local coordinates and are centered in the native grid.
-- Existing vault masks and placement bounds use native grid coordinates.
layout_coordinates = {}

function layout_coordinates.centered(width, height, grid_width, grid_height)
  local origin_x = math.floor((grid_width - width) / 2)
  local origin_y = math.floor((grid_height - height) / 2)
  return {
    to_local = function(x, y) return x - origin_x, y - origin_y end,
    to_grid = function(x, y) return x + origin_x, y + origin_y end,
    contains = function(x_min, x_max, y_min, y_max)
      return x_min >= 0 and y_min >= 0 and x_max < width and y_max < height
    end
  }
end

function layout_coordinates.builder_frame()
  local width, height = dgn.max_bounds()
  -- in_bounds excludes the outer border; max_bounds is only the builder size.
  -- Probe the allocated grid so this also works with the deployed engine,
  -- which predates the grid_bounds binding.
  local grid_width, grid_height = 1, 1
  while dgn.in_bounds(grid_width, 1) do grid_width = grid_width + 1 end
  while dgn.in_bounds(1, grid_height) do grid_height = grid_height + 1 end
  grid_width, grid_height = grid_width + 1, grid_height + 1
  return layout_coordinates.centered(width, height, grid_width, grid_height)
end

function layout_coordinates.primary_vault_dimensions(e, frame)
  local x_min, x_max, y_min, y_max = e.primary_vault_dimensions()
  if x_min == nil then return end
  local left, top = frame.to_local(x_min, y_min)
  local right, bottom = frame.to_local(x_max, y_max)
  return left, right, top, bottom
end
