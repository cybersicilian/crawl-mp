"""Check the castle's drawing requests with a bounds-checked Lua map.

Runs the real castle body and room planning, with Geoelf rendering stubbed out.
This isolates castle coordinate safety; native connectivity is a separate check.
"""
import json
from pathlib import Path
import re
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parents[3] / "crawl-ref/source"
castle = (SOURCE / "dat/des/builder/layout_geoelf_castle.des").read_text()
constants, body = re.findall(r"(?ms)^\{\{\n(.*?)^\}\}", castle)
veto = re.search(r"(?ms)^veto \{\{\n(.*?)^\}\}", castle).group(1)
legacy = body.replace(
    "layout_coordinates.primary_vault_dimensions(_G, frame)",
    "primary_vault_dimensions()",
).replace("dgn.in_vault(frame.to_grid(x, y))", "dgn.in_vault(x, y)")
harness = r'''
local source, width, height = arg[1], tonumber(arg[2]), tonumber(arg[3])
local primary = {tonumber(arg[4]), tonumber(arg[5]), tonumber(arg[6]), tonumber(arg[7])}
dgn = {
  max_bounds = function() return width, height end,
  in_bounds = function(x, y) return x > 0 and x < 119 and y > 0 and y < 103 end,
  in_vault = function(x, y)
    return x >= primary[1] and x <= primary[2]
       and y >= primary[3] and y <= primary[4]
  end
}
function primary_vault_dimensions() return table.unpack(primary) end
local loaded = {}
function crawl_require(path)
  if not loaded[path] then
    loaded[path] = true
    dofile(source .. '/dat/' .. path)
  end
end
math.randomseed(19)
crawl = {
  mpr = function(message) error(message) end,
  random_range = function(a, b)
    a, b = math.floor(a), math.floor(b)
    if a > b then a, b = b, a end
    return math.random(a, b)
  end
}
util = {random_choose_weighted = function(options) return options[1][1] end}
crawl_require('dlua/layout/geoelf.lua')
crawl_require('dlua/layout/coordinates.lua')
geoelf.generate = function() end
local grid, columns = {}, {}
local function check(x, y)
  assert(x >= 0 and x < width and y >= 0 and y < height,
    'OUT OF BOUNDS: ' .. x .. ',' .. y .. ' in ' .. width .. 'x' .. height)
end
mapgrd = setmetatable({}, {__index = function(_, x)
  columns[x] = columns[x] or setmetatable({}, {
    __index = function(_, y) check(x, y); return grid[y * width + x] or 'x' end,
    __newindex = function(_, y, value) check(x, y); grid[y * width + x] = value end
  })
  return columns[x]
end})
function extend_map() end
function fill_area(area)
  local x1, x2 = math.floor(area.x1), math.floor(area.x2)
  local y1, y2 = math.floor(area.y1), math.floor(area.y2)
  if x1 > x2 then x1, x2 = x2, x1 end
  if y1 > y2 then y1, y2 = y2, y1 end
  for y = y1, y2 do
    for x = x1, x2 do mapgrd[x][y] = area.fill or 'x' end
  end
end
function make_circle(circle)
  for y = -circle.radius, circle.radius do
    for x = -circle.radius, circle.radius do
      if x*x + y*y < (circle.radius + 0.5)^2 then
        mapgrd[circle.x + x][circle.y + y] = circle.fill
      end
    end
  end
end
function make_round_box(area) fill_area(area) end
function kmask() end
function kfeat() end
function nsubst() end
function connect_adjacent_rooms() end
CONSTANTS
VETO
BODY
print('PASS: castle drawing requests stay within ' .. width .. 'x' .. height)
'''
results = []
fixtures = ((95, 119, 0, 39), (0, 24, 0, 39),
            (95, 119, 64, 103), (0, 24, 64, 103),
            (80, 119, 0, 24), (0, 39, 0, 24),
            (80, 119, 79, 103), (0, 39, 79, 103), (48, 72, 32, 71))
with tempfile.TemporaryDirectory(prefix="dcss-castle-bounds-") as directory:
    script = Path(directory) / "probe.lua"
    for name, script_body in (("original", legacy), ("patched", body)):
        guard = ("local skip = (function()\n" + veto + "\nend)()\n"
                 "if skip then print('PASS: incompatible primary vetoed'); return end")
        script.write_text(harness.replace("CONSTANTS", constants)
                          .replace("VETO", guard if name == "patched" else "")
                          .replace("BODY", script_body))
        for width, height in ((80, 70), (94, 82), (106, 92), (120, 104)):
            for fixture in fixtures:
                result = subprocess.run(
                    ["lua", str(script), str(SOURCE), str(width), str(height),
                     *(str(value) for value in fixture)],
                    text=True, capture_output=True, timeout=5,
                )
                entry = {"mode": name, "size": [width, height],
                         "primary": fixture, "exit_code": result.returncode,
                         "output": result.stdout + result.stderr}
                results.append(entry)
                print(json.dumps(entry))
assert all(row["exit_code"] == 0 for row in results if row["mode"] == "patched")
assert "OUT OF BOUNDS" in results[0]["output"]
