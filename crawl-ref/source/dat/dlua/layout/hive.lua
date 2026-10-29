-- Irregular comb clusters with short connections and occasional flight rooms.
crawl_require('dlua/layout/chamber_graph.lua')

local function dry_connected(e, width, height)
    local first,total=nil,0
    for y=0,height-1 do for x=0,width-1 do
        if e.mapgrd[x][y]=='.' then first=first or {x,y};total=total+1 end
    end end
    if not first then return false end
    local queue,head,seen={first},1,{[first[1]..':'..first[2]]=true}
    while head<=#queue do
        local p=queue[head];head=head+1
        for dy=-1,1 do for dx=-1,1 do
            local x,y=p[1]+dx,p[2]+dy
            local key=x..':'..y
            if x>=0 and y>=0 and x<width and y<height and not seen[key]
                and e.mapgrd[x][y]=='.' then
                seen[key]=true;queue[#queue+1]={x,y}
            end
        end end
    end
    return #queue==total
end

local function honey_pools(e, nodes)
    local width,height=dgn.max_bounds()
    e.kfeat('h = shallow_honey')
    local shape={{0,0},{1,0},{-1,0},{0,1},{1,1},{0,-1}}
    for i=4,#nodes,6 do
        local node=nodes[i]
        local side=crawl.coinflip() and 2 or -2
        local cells={}
        for _,offset in ipairs(shape) do
            local x,y=node.x+side+offset[1],node.y+offset[2]
            if e.mapgrd[x][y]=='.' and (x~=node.x or y~=node.y) then
                cells[#cells+1]={x,y};e.mapgrd[x][y]='h'
            end
        end
        if #cells<3 or not dry_connected(e,width,height) then
            for _,p in ipairs(cells) do e.mapgrd[p[1]][p[2]]='.' end
        end
    end
end

function hive_layout(e, ending, hollow)
    local nodes = chamber_graph.build(e, {
        count=28, margin=8, spacing=7, min_radius=3, max_radius=4,
        lobes=1, bend=2, min_width=1, max_width=2,
        loop_percent=65, loop_distance=15
    })
    local flight = nodes[math.floor(#nodes/2)]
    e.make_circle { x=flight.x,y=flight.y,radius=hollow and 7 or 5,fill='.' }
    honey_pools(e,nodes)
    if ending then
        chamber_graph.reserve_arrivals(e,nodes,3)
        for i, stair in ipairs({'{','(','['}) do
            e.mapgrd[nodes[i].x][nodes[i].y] = stair
        end
        local hoard = nodes[#nodes]
        e.mapgrd[hoard.x][hoard.y] = 'Q'
        e.mapgrd[hoard.x-2][hoard.y] = 'W'
        e.mapgrd[hoard.x+2][hoard.y] = 'W'
        for dx=-1,1 do
            e.mapgrd[hoard.x+dx][hoard.y-2] = '*'
            e.mapgrd[hoard.x+dx][hoard.y+2] = '$'
        end
    end
    return nodes
end
