import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,isWorld,type Settlement,type World} from './engine';
import {advanceWorldDays} from './calendar';
import {tileCapacity} from './density';
import {createMortal} from './divineDescent';
import {compactWorld,readSavedWorld} from './storage';
import {MortalHUD} from './MortalHUD';
import type {Building} from './construction';
import {mortalDirection,mortalMovementDelay,mortalTileCapacity,
  nearbyMortals,nearbyMortalBuildings,mortalBuildingEntrance,
  describeMortalBuilding,interactWithMortal,walkMortal,
  walkMortalWithAssist} from './mortalGameplay';

const settings={seed:8188,size:'small' as const,
  starting:{human:10,elf:6,dwarf:6,demon:6}};
const makeWorld=()=>createMortal(createWorld(settings),{
  name:'Liora Dawn',species:'human',background:'scout',
  appearance:{skin:0,hair:2,hairStyle:1,outfit:'wanderer'},
}).world;
function playmate(world:World):{world:World;targetId:number}{
  const avatar=world.agents.find(a=>a.id===world.descent?.agentId)!;
  const candidate=world.agents.find(a=>a.id!==avatar.id)!;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    if(!dx&&!dy)continue;
    const x=avatar.x+dx,y=avatar.y+dy;
    if(x<0||y<0||x>=world.width||y>=world.height||
      world.tiles[y*world.width+x].biome==='water')continue;
    if(world.agents.filter(a=>a.id!==candidate.id&&a.x===x&&a.y===y).length>=
      mortalTileCapacity(world,x,y))continue;
    return {world:{...world,agents:world.agents.map(a=>a.id===candidate.id?
      {...a,x,y}:a)},targetId:candidate.id};
  }
  throw Error('No nearby plot for interaction test');
}

function withDoor(world:World,offset:{x:number;y:number}={x:1,y:0}){
  const avatar=world.agents.find(a=>a.id===world.descent!.agentId)!;
  const house:Building={id:901,type:'house',x:avatar.x+offset.x,
    y:avatar.y+offset.y,culture:'human',stage:'complete',progress:100,
    condition:92,started:world.year,finished:world.year,
    spent:{wood:12,stone:5,clay:6},labor:18};
  const seed:Settlement=world.settlements[0]??{
    id:901,species:'human',name:'Test Haven',x:avatar.x,y:avatar.y,
    founded:world.year,population:10,stores:40,emptyYears:0};
  const infra=seed.infrastructure??{land:[],buildings:[],roads:[],
    stock:{wood:0,stone:0,clay:0},nextBuildingId:902,
    foundedWithResidents:seed.population};
  const settlement={...seed,x:avatar.x,y:avatar.y,
    infrastructure:{...infra,buildings:[house],roads:[]}};
  return {world:{...world,settlements:[settlement,...world.settlements.slice(1)]},
    house,settlement,avatar};
}

describe('v2.5.1 — mortal movement and interaction',()=>{
  it('turns WASD with the camera without changing world coordinates',()=>{
    const none=new Set<'w'|'a'|'s'|'d'>();
    expect(mortalDirection(none,{yaw:0,pitch:30})).toBeNull();
    const north=new Set<'w'>(['w']);
    const initial=mortalDirection(north,{yaw:0,pitch:30});
    const rotated=mortalDirection(north,{yaw:90,pitch:30});
    expect(initial).not.toEqual(rotated);
    for(const yaw of [0,45,90,135,180,225,270,315]){
      const dir=mortalDirection(north,{yaw,pitch:30})!;
      expect(Math.abs(dir.dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(dir.dy)).toBeLessThanOrEqual(1);
      expect(dir.dx!==0||dir.dy!==0).toBe(true);
    }
  });

  it('uses the same local tile capacity as settlement occupancy',()=>{
    const w=makeWorld(),capacity=tileCapacity(w);
    for(let y=0;y<w.height;y+=7)for(let x=0;x<w.width;x+=7)
      expect(mortalTileCapacity(w,x,y)).toBe(capacity[y*w.width+x]);
  });

  it('walks a real agent, preserves lineage, and uses bounded energy',()=>{
    const w=makeWorld();
    const player=w.agents.find(a=>a.id===w.descent!.agentId)!;
    const steps=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
    const walk=steps.map(([dx,dy])=>walkMortal(w,dx,dy))
      .find(r=>r.moved);
    expect(walk).toBeDefined();
    expect(walk!.world).not.toBe(w);
    const current=walk!.world.agents.find(a=>a.id===player.id)!;
    expect(current.x!==player.x||current.y!==player.y).toBe(true);
    expect(current.energy).toBeLessThanOrEqual(player.energy);
    expect(walk!.world.descent?.agentId).toBe(player.id);
    expect(walk!.world.lineage).toEqual(w.lineage);
    expect(isWorld(walk!.world)).toBe(true);
  });

  it('blocks invalid moves and water rather than teleporting a mortal',()=>{
    const w=makeWorld(),player=w.agents.find(a=>a.id===w.descent!.agentId)!;
    expect(walkMortal(w,42,0).moved).toBe(false);
    expect(walkMortal(w,0,0).world).toBe(w);
    const x=player.x+1;
    if(x<w.width){
      const tiles=[...w.tiles];tiles[player.y*w.width+x]={biome:'water',food:0};
      const blocked=walkMortal({...w,tiles},1,0);
      expect(blocked.moved).toBe(false);
      expect(blocked.reason).toMatch(/water/i);
    }
    expect(mortalMovementDelay(player)).toBeGreaterThan(0);
  });

  it('lets a crowded street yield without overlapping or deleting inhabitants',()=>{
    const base=makeWorld();
    const avatar=base.agents.find(a=>a.id===base.descent!.agentId)!;
    const step=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]
      .find(([dx,dy])=>{
        const x=avatar.x+dx,y=avatar.y+dy;
        return x>=0&&y>=0&&x<base.width&&y<base.height&&
          base.tiles[y*base.width+x].biome!=='water';
      })!;
    const x=avatar.x+step[0],y=avatar.y+step[1];
    const occupants=base.agents.filter(a=>a.id!==avatar.id&&a.x===x&&a.y===y);
    const vacancies=mortalTileCapacity(base,x,y)-occupants.length;
    const additional=base.agents.filter(a=>a.id!==avatar.id&&
      (a.x!==x||a.y!==y)&&!a.work?.tradeId).slice(0,vacancies);
    expect(additional).toHaveLength(vacancies);
    const crowded={...base,agents:base.agents.map(a=>
      additional.some(b=>b.id===a.id)?{...a,x,y}:a)};
    expect(isWorld(crowded)).toBe(true);
    const result=walkMortal(crowded,step[0],step[1]);
    expect(result.moved).toBe(true);
    expect(result.world.agents).toHaveLength(crowded.agents.length);
    expect(result.world.agents.find(a=>a.id===avatar.id)).toMatchObject({x,y});
    expect(result.world.agents.filter(a=>a.x===x&&a.y===y)).toHaveLength(
      mortalTileCapacity(base,x,y));
    expect(result.world.agents.filter(a=>a.x===avatar.x&&a.y===avatar.y)
      .some(a=>a.id!==avatar.id)).toBe(true);
    expect(isWorld(result.world)).toBe(true);
  });

  it('creates real two-way social memories and prevents same-day farming',()=>{
    const {world:w,targetId}=playmate(makeWorld());
    expect(isWorld(w)).toBe(true);
    expect(nearbyMortals(w).some(a=>a.id===targetId)).toBe(true);
    const result=interactWithMortal(w,targetId,'greet');
    expect(result.accepted).toBe(true);
    expect(isWorld(result.world)).toBe(true);
    for(const personId of [w.descent!.agentId,targetId]){
      const a=result.world.agents.find(p=>p.id===personId)!;
      expect(a.dailyLife?.encounters.some(e=>
        e.withId===(personId===targetId?w.descent!.agentId:targetId)))
        .toBe(true);
    }
    const repeat=interactWithMortal(result.world,targetId,'ask');
    expect(repeat.accepted).toBe(false);
    expect(repeat.world).toBe(result.world);
    const loaded=readSavedWorld(compactWorld(result.world));
    expect(loaded).toEqual(result.world);
  });

  it('lets a mortal offer genuine help and records a support episode',()=>{
    const {world:w,targetId}=playmate(makeWorld());
    const giver=w.agents.find(a=>a.id===w.descent!.agentId)!;
    const receiver=w.agents.find(a=>a.id===targetId)!;
    const result=interactWithMortal(w,targetId,'help');
    expect(result.accepted).toBe(true);
    expect(result.world.agents.find(a=>a.id===giver.id)!.energy).toBeLessThan(giver.energy);
    expect(result.world.agents.find(a=>a.id===targetId)!.energy)
      .toBeGreaterThanOrEqual(receiver.energy);
    expect(result.world.agents.find(a=>a.id===giver.id)!
      .development?.memories.some(m=>m.kind==='support')).toBe(true);
    expect(isWorld(result.world)).toBe(true);
  });

  it('retains control through ordinary daily cognition and monthly travel',()=>{
    const w=makeWorld(),before=w.agents.find(a=>a.id===w.descent!.agentId)!;
    const later=advanceWorldDays(w,35);
    const after=later.agents.find(a=>a.id===before.id)!;
    expect({x:after.x,y:after.y}).toEqual({x:before.x,y:before.y});
    expect(later.dayOfYear).toBe(35);
    expect(isWorld(later)).toBe(true);
  });

  it('respects NPC refusal and does not change reputation on a declined chat',()=>{
    const {world:w,targetId}=playmate(makeWorld());
    const guarded={...w,agents:w.agents.map(a=>a.id===targetId?{
      ...a,dailyLife:{...a.dailyLife!,fatigue:98},
    }:a)};
    const result=interactWithMortal(guarded,targetId,'greet');
    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/willing/i);
    expect(result.world).toBe(guarded);
  });

  it('renders an accessible, focused mortal HUD and conversation actions',()=>{
    const {world:w,targetId}=playmate(makeWorld());
    const markup=renderToStaticMarkup(createElement(MortalHUD,{
      world:w,nearby:nearbyMortals(w),targetId,message:'Hello there!',
      running:true,onTalk:()=>{},onSelect:()=>{},onClose:()=>{},
      onToggleTime:()=>{},onLeave:()=>{},
    }));
    expect(markup).toContain('Mortal player controls');
    expect(markup).toContain('GREET');
    expect(markup).toContain('ASK ABOUT LIFE');
    expect(markup).toContain('OFFER HELP');
    expect(markup).toContain('PAUSE TIME');
  });
});

describe('v2.5.3 — physical entrances and assisted movement',()=>{
  it('keeps homes solid without turning pixel-art roofs into giant collision boxes',()=>{
    const base=makeWorld(),avatar=base.agents.find(a=>a.id===base.descent!.agentId)!;
    const target=[[1,0],[-1,0],[0,1],[0,-1]]
      .find(([dx,dy])=>avatar.x+dx>=1&&avatar.x+dx<base.width-1&&
        avatar.y+dy>=1&&avatar.y+dy<base.height-1&&
        base.tiles[(avatar.y+dy)*base.width+avatar.x+dx].biome!=='water')!;
    const {world:w}=withDoor(base,{x:target[0],y:target[1]});
    const blocked=walkMortal(w,target[0],target[1]);
    expect(blocked.moved).toBe(false);
    expect(blocked.reason).toMatch(/building/i);
    expect(blocked.world).toBe(w);
    expect(w.agents.find(a=>a.id===avatar.id)).toMatchObject({x:avatar.x,y:avatar.y});
  });

  it('uses a stable walkable road-facing entrance, independent of camera and time',()=>{
    const base=makeWorld(),player=base.agents.find(a=>a.id===base.descent!.agentId)!;
    const {world:w,house,settlement}=withDoor(base);
    const entrance=mortalBuildingEntrance(w,settlement,house);
    expect(Math.abs(entrance.x-house.x)+Math.abs(entrance.y-house.y)).toBe(1);
    expect(w.tiles[entrance.y*w.width+entrance.x].biome).not.toBe('water');
    const roads=[entrance.y*w.width+entrance.x];
    const roadWorld={...w,settlements:w.settlements.map((s,i)=>i===0?{
      ...s,infrastructure:{...s.infrastructure!,roads}}:s)};
    const roadSite=nearbyMortalBuildings(roadWorld)[0];
    expect(roadSite?.entrance).toEqual(entrance);
    expect(roadSite?.building.id).toBe(house.id);
    expect(describeMortalBuilding(roadWorld,roadSite!)).toMatch(/hut|home|dwelling/i);
    expect(roadSite!.distance).toBeLessThanOrEqual(2);
    expect(player.id).toBe(base.descent?.agentId);
  });

  it('assists a held direction around a single building without crossing water',()=>{
    const base=makeWorld(),player=base.agents.find(a=>a.id===base.descent!.agentId)!;
    const x=player.x+1,y=player.y;
    expect(x).toBeLessThan(base.width-1);
    const {world:w}=withDoor(base);
    const direct=walkMortal(w,1,0);
    expect(direct.moved).toBe(false);
    const assisted=walkMortalWithAssist(w,1,0);
    if(assisted.moved){
      const next=assisted.world.agents.find(a=>a.id===player.id)!;
      expect(next.x).toBe(x);
      expect(Math.abs(next.y-y)).toBe(1);
      expect(assisted.world.descent).toEqual(w.descent);
    }else expect(assisted.reason).toMatch(/building|blocked|corner/i);
    const tiles=[...w.tiles];
    for(const dy of [-1,1])tiles[(y+dy)*w.width+x]={biome:'water',food:0};
    expect(walkMortalWithAssist({...w,tiles},1,0).moved).toBe(false);
  });

  it('shows one contextual building inspection without writing fake interiors',()=>{
    const {world:w}=withDoor(makeWorld());
    const nearby=nearbyMortalBuildings(w);
    expect(nearby.length).toBeGreaterThan(0);
    const markup=renderToStaticMarkup(createElement(MortalHUD,{
      world:w,nearby:[],buildings:nearby,
      targetId:null,selectedBuilding:nearby[0],message:'',running:false,
      onTalk:()=>{},onSelect:()=>{},onInspectBuilding:()=>{},
      onClose:()=>{},onToggleTime:()=>{},onLeave:()=>{},
    }));
    expect(markup).toContain('Nearby building');
    expect(markup).toContain('ready to explore');
    expect(w.descent?.mode).toBe('mortal');
  });
});
