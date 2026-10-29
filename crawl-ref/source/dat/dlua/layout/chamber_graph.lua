-- Scattered chambers joined by a spanning tree and a few short loops.
-- Consumers supply room sizes and passage shapes, and retain normal terrain.
chamber_graph = {}

local function distance(a, b)
    return math.sqrt((a.x-b.x)^2 + (a.y-b.y)^2)
end

local function link_key(a, b)
    return math.min(a,b) .. ':' .. math.max(a,b)
end

local function connect(e, a, b, options, width, height)
    local dx, dy = b.x-a.x, b.y-a.y
    local length = math.max(1, distance(a,b))
    local points = {a}
    for _, fraction in ipairs({0.33, 0.67}) do
        local bend = crawl.random_range(-options.bend, options.bend)
        points[#points+1] = {
            x=math.max(4, math.min(width-5,
                math.floor(a.x+dx*fraction-dy*bend/length))),
            y=math.max(4, math.min(height-5,
                math.floor(a.y+dy*fraction+dx*bend/length)))
        }
    end
    points[#points+1] = b
    local thickness = crawl.random_range(options.min_width, options.max_width)
    for i=2,#points do
        e.join_the_dots { x1=points[i-1].x, y1=points[i-1].y,
            x2=points[i].x, y2=points[i].y, thickness=thickness,
            force_straight=true, allow_diagonals=true }
    end
end

-- Order landmarks from an edge of the graph. Protected endings can put their
-- entry stairs near the beginning and the exit/hoard far along the passages.
local function ordered_nodes(nodes, edges)
    local start = 1
    for i=2,#nodes do
        if distance(nodes[i],nodes[1]) > distance(nodes[start],nodes[1]) then
            start = i
        end
    end
    local costs, visited = {[start]=0}, {}
    for _=1,#nodes do
        local best
        for i=1,#nodes do
            if not visited[i] and costs[i] and (not best or costs[i]<costs[best]) then
                best = i
            end
        end
        assert(best, 'Disconnected chamber graph')
        visited[best] = true
        for _, edge in ipairs(edges) do
            local other = edge.a == best and edge.b or edge.b == best and edge.a
            if other then
                local cost = costs[best]+distance(nodes[best],nodes[other])
                costs[other] = math.min(costs[other] or math.huge,cost)
            end
        end
    end
    for i,node in ipairs(nodes) do node.cost = costs[i] end
    table.sort(nodes, function(a,b) return a.cost<b.cost end)
    return nodes
end

function chamber_graph.build(e, options)
    local width, height = dgn.max_bounds()
    e.extend_map { width=width, height=height, fill='x' }
    local count = math.floor(options.count*width*height/(80*70))
    local nodes, edges, links = {}, {}, {}
    -- Bounded rejection sampling, rather than rows/columns or a jittered grid.
    for _=1,count*100 do
        local node = {
            x=crawl.random_range(options.margin,width-options.margin-1),
            y=crawl.random_range(options.margin,height-options.margin-1),
            radius=crawl.random_range(options.min_radius,options.max_radius)
        }
        local fits = true
        for _, other in ipairs(nodes) do
            if distance(node,other)<options.spacing then fits=false; break end
        end
        if fits then nodes[#nodes+1]=node end
        if #nodes == count then break end
    end
    assert(#nodes>=math.floor(count*0.75), 'Insufficient room for chambers')

    local function add_edge(a,b)
        links[link_key(a,b)] = true
        edges[#edges+1] = {a=a,b=b}
    end
    local connected = {[1]=true}
    for _=2,#nodes do
        local from, to, closest
        for a=1,#nodes do
            if connected[a] then
                for b=1,#nodes do
                    local length = distance(nodes[a],nodes[b])
                    if not connected[b] and (not closest or length<closest) then
                        from,to,closest = a,b,length
                    end
                end
            end
        end
        add_edge(from,to)
        connected[to] = true
    end
    for a=1,#nodes do
        local candidates = {}
        for b=1,#nodes do
            if a~=b and not links[link_key(a,b)]
                and distance(nodes[a],nodes[b])<=options.loop_distance then
                candidates[#candidates+1] = b
            end
        end
        table.sort(candidates, function(b,c)
            return distance(nodes[a],nodes[b])<distance(nodes[a],nodes[c])
        end)
        if #candidates>0 and crawl.random2(100)<options.loop_percent then
            add_edge(a,candidates[crawl.random_range(1,math.min(3,#candidates))])
        end
    end
    for _, edge in ipairs(edges) do
        connect(e,nodes[edge.a],nodes[edge.b],options,width,height)
    end
    for _, node in ipairs(nodes) do
        e.make_circle { x=node.x,y=node.y,radius=node.radius,fill='.' }
        if options.lobes then
            for _=1,options.lobes do
                e.make_circle { x=node.x+crawl.random_range(-3,3),
                    y=node.y+crawl.random_range(-3,3),
                    radius=crawl.random_range(2,node.radius-1),fill='.' }
            end
        end
    end
    return ordered_nodes(nodes,edges)
end

-- Keep initial stair rooms readable using native placement masks. Monsters can
-- enter them normally after generation; these flags create no combat sanctuary.
function chamber_graph.reserve_arrivals(e, nodes, radius)
    e.kfeat('e = floor')
    e.kmask('e{([ = no_monster_gen')
    e.kmask('e{([ = no_trap_gen')
    for i=1,3 do
        local node=nodes[i]
        for dx=-radius,radius do for dy=-radius,radius do
            if e.mapgrd[node.x+dx][node.y+dy]=='.' then
                e.mapgrd[node.x+dx][node.y+dy]='e'
            end
        end end
    end
end
