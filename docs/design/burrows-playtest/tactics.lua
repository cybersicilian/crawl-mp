-- Public monster information and ordinary movement only; no dungeon telemetry.
route_tactics = {}
local previous_retreat=-10
local priorities={['deathcap']=7,['spark wasp']=7,['caustic worm']=5,['deep troll shaman']=6,['deep troll earth mage']=5,
    ['naga ritualist']=6,['naga mage']=5,['guardian serpent']=5,
    ['naga sharpshooter']=6,['meliai']=6,['queen bee']=4,['Vespara']=5,['great orb of eyes']=5}
function route_tactics.target(enemies)
    local best,score=enemies[1],-100
    for _,e in ipairs(enemies) do
        local value=(priorities[e.m:mname()] or 0)-e.d*.5
        if e.m:is_constricting_you() then value=value+12 end
        if value>score then best,score=e,value end
    end
    return best
end
function route_tactics.adjacent(enemies)
    local n=0
    for _,e in ipairs(enemies) do if e.d<=1 then n=n+1 end end
    return n
end
function route_tactics.cluster(target,enemies)
    local n=0
    for _,e in ipairs(enemies) do
        if math.max(math.abs(e.x-target.x),math.abs(e.y-target.y))<=1
            and e.m:res_fire()<=0 then n=n+1 end
    end
    return n
end
function route_tactics.retreat(enemies)
    if you.turns()-previous_retreat<2 then return false end
    local best,score=nil,enemies[1].d
    local directions={{-1,-1,'y'},{0,-1,'k'},{1,-1,'u'},{-1,0,'h'},
        {1,0,'l'},{-1,1,'b'},{0,1,'j'},{1,1,'n'}}
    for _,step in ipairs(directions) do
        local x,y=step[1],step[2]
        local feature=view.feature_at(x,y)
        if view.is_safe_square(x,y) and you.see_cell_no_trans(x,y)
            and travel.feature_traversable(feature) and not monster.get_monster_at(x,y)
            and not feature:find('trap',1,true) and feature~='closed_door'
            and feature~='shallow_honey' and feature~='shallow_water' then
            local distance=20
            for _,e in ipairs(enemies) do
                distance=math.min(distance,math.max(math.abs(e.x-x),math.abs(e.y-y)))
            end
            if distance>score then best,score=step[3],distance end
        end
    end
    if best then previous_retreat=you.turns();crawl.sendkeys(best);return true end
    return false
end

function route_tactics.recoil_safe()
    -- Bombard can knock the caster back. Avoid prompts caused by known hazards.
    for y=-1,1 do for x=-1,1 do
        local feature=view.feature_at(x,y)
        if (x~=0 or y~=0) and (feature:find('trap',1,true)
            or travel.feature_traversable(feature) and not monster.get_monster_at(x,y)
                and not view.is_safe_square(x,y)) then return false end
    end end
    return true
end
