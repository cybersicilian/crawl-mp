-- Uneven caverns and long, bent galleries. Shared by ordinary floors/endings.
crawl_require('dlua/layout/chamber_graph.lua')

function wormlands_layout(e)
    local nodes = chamber_graph.build(e, {
        count=12, margin=11, spacing=12, min_radius=4, max_radius=6,
        lobes=3, bend=6, min_width=2, max_width=3,
        loop_percent=30, loop_distance=30
    })
    for _, node in ipairs(nodes) do
        local clear = true
        for dx=2,6 do
            for dy=-2,2 do
                if e.mapgrd[node.x+dx][node.y+dy]~='.' then clear=false end
            end
        end
        if clear and crawl.one_chance_in(3) then
            e.make_circle { x=node.x+4,y=node.y,radius=1,fill='c' }
        end
    end
    -- Keep the core of every landmark clear. Endings can safely place stairs,
    -- guardians and treasure without hollowing an isolated tile in a pillar.
    for _, node in ipairs(nodes) do
        e.make_circle { x=node.x,y=node.y,radius=4,fill='.' }
    end
    return nodes
end

-- Ending roles use graph distance, not a row/column position in a fixed grid.
function wormlands_ending(e, cache_offset)
    local nodes = wormlands_layout(e)
    chamber_graph.reserve_arrivals(e,nodes,4)
    for i, stair in ipairs({'{','(','['}) do
        e.mapgrd[nodes[i].x][nodes[i].y] = stair
    end
    local exit, hoard = nodes[#nodes], nodes[#nodes-cache_offset]
    e.mapgrd[exit.x][exit.y] = 'O'
    for dx=-1,1 do
        e.mapgrd[hoard.x+dx][hoard.y-2] = '*'
        e.mapgrd[hoard.x+dx][hoard.y+2] = '$'
    end
    return exit, hoard
end
