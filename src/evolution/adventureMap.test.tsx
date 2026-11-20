import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorldDays} from './calendar';
import {createMortal} from './divineDescent';
import {createWorld,isWorld,type World} from './engine';
import {adventureDistance,adventureMapFor,adventureRegion,
  useAdventureGate,walkAdventure} from './adventureMap';
import {compactWorld,readSavedWorld} from './storage';
import {MortalAdventure} from './MortalAdventure';

const options={name:'Mira Reed',species:'human',background:'scout',
  appearance:{skin:0,hair:0,hairStyle:0,outfit:'wanderer'}} as const;
const player=(world:World)=>world.agents.find(a=>a.id===world.descent?.agentId)!;

describe('towns and trails',()=>{
  it('walks a signed connection end to end and reloads on the same route',()=>{
    let world=createMortal(advanceWorldDays(createWorld({seed:8512,size:'small'}),
      365*6),options).world;
    const start=player(world),map=adventureMapFor(world);
    const town=adventureRegion(world,map,start);
    expect(town.settlement).toBeDefined();
    const exit=town.gates.find(g=>adventureDistance(start,g.point)===0)!;
    expect(exit).toBeDefined();
    world=useAdventureGate(world,town,start,exit).world;
    expect(world.descent?.place).toEqual(exit.destination);
    const route=adventureRegion(world,map,player(world));
    expect(route.place.kind).toBe('route');
    const path=[...route.trail];
    if(path[0]!==start.y*world.width+start.x)path.reverse();
    expect(path.length).toBeGreaterThanOrEqual(5);
    expect(route.gates.some(g=>g.label===town.name)).toBe(true);
    for(const [step,index] of path.slice(1).entries()){
      const before=player(world);
      const result=walkAdventure(world,route,index%world.width-before.x,
        Math.floor(index/world.width)-before.y);
      expect(result.moved).toBe(true);
      world=result.world;
      if(step===1){
        const restored=readSavedWorld(compactWorld(world))!;
        expect(restored.descent?.place).toEqual(route.place);
        expect(adventureRegion(restored,adventureMapFor(restored),player(restored)).name)
          .toBe(route.name);
      }
    }
    const arrival=route.gates.find(g=>g.label===exit.label)!;
    const entered=useAdventureGate(world,route,player(world),arrival);
    expect(entered.moved).toBe(true);
    const nextTown=adventureRegion(entered.world,map,player(entered.world));
    expect(nextTown.name).toBe(exit.label);
    expect(nextTown.settlement?.id).not.toBe(town.settlement?.id);
    expect(adventureMapFor(entered.world)).toBe(map);
    expect(isWorld(entered.world)).toBe(true);
  });

  it('keeps legacy characters in a bounded area and refuses off-scene steps',()=>{
    const initial=createMortal(createWorld({seed:5174,size:'small'}),options).world;
    expect(initial.descent?.place).toBeUndefined();
    const map=adventureMapFor(initial);
    const camp=adventureRegion(initial,map,player(initial));
    expect(camp.place.kind).toBe('wild');
    expect(camp.area.size).toBeLessThanOrEqual(121);
    const index=[...camp.area].find(i=>{
      const x=i%initial.width;
      return x+1<initial.width&&!camp.area.has(i+1)&&!!map.open[i+1];
    })!;
    expect(index).toBeDefined();
    const world={...initial,agents:initial.agents.map(a=>a.id===player(initial).id?
      {...a,x:index%initial.width,y:Math.floor(index/initial.width)}:a)};
    const denied=walkAdventure(world,camp,1,0);
    expect(denied.world).toBe(world);
    expect(denied.moved).toBe(false);
    expect(denied.reason).toMatch(/marked exit/i);
    expect(isWorld({...world,descent:{...world.descent!,place:{kind:'wild',x:-1,y:0}}}))
      .toBe(false);
  });

  it('keeps an isolated town disconnected until its actual bridge is usable',()=>{
    const world=createWorld({seed:99,size:'small'});
    const mid=30,from={id:1,name:'Alder',species:'human' as const,
      x:mid-5,y:21,founded:0,population:5,stores:20,emptyYears:0};
    const to={...from,id:2,name:'Fern',species:'elf' as const,x:mid+5};
    const tiles=world.tiles.map((_,i)=>i%world.width===mid?
      {biome:'water' as const,food:0}:{biome:'plains' as const,food:1});
    const split={...world,tiles,settlements:[from,to]};
    expect(adventureMapFor(split).routes.size).toBe(0);
    const index=from.y*world.width+mid;
    const linked={...split,transport:{roads:[],bridges:[
      {index,sponsorId:1,built:0,condition:80},
    ]}};
    const map=adventureMapFor(linked);
    expect(map.routes.size).toBe(1);
    expect([...map.routes.values()][0].path).toContain(index);
    expect(map.open[index]).toBe(1);
  });

  it('ferries the mortal between reachable shores and restores the new settlement',()=>{
    const settled=advanceWorldDays(createWorld({seed:108,size:'small',
      layout:'archipelago'}),365*6);
    const {world,agent}=createMortal(settled,options);
    const map=adventureMapFor(world),town=adventureRegion(world,map,agent);
    const ferry=town.gates.find(g=>g.ferry)!;
    expect(ferry).toBeDefined();
    expect(ferry.ferry!.seaTiles).toBeGreaterThan(2);
    const atDock={...world,agents:world.agents.map(a=>a.id===agent.id?{...a,...ferry.point}:a)};
    const crossed=useAdventureGate(atDock,town,player(atDock),ferry);
    expect(crossed.moved).toBe(true);
    expect(crossed.world.rngState).toBe(world.rngState);
    const restored=readSavedWorld(compactWorld(crossed.world))!;
    const pilgrim=player(restored);
    expect(restored.tiles[pilgrim.y*world.width+pilgrim.x].biome).not.toBe('water');
    expect(adventureDistance(pilgrim,ferry.ferry!.landing)).toBeLessThanOrEqual(1);
    const destination=adventureRegion(restored,adventureMapFor(restored),pilgrim);
    expect(destination.name).toBe(ferry.label);
    expect(destination.gates.some(g=>g.ferry&&g.label===town.name)).toBe(true);
  });

  it('shows an exploration-led HUD for older worlds with no towns',()=>{
    const {world,agent}=createMortal(createWorld({seed:5174,size:'small'}),options);
    const markup=renderToStaticMarkup(<MortalAdventure world={world} actor={agent}
      onChange={()=>{}} onAscend={()=>{}}/>);
    expect(markup).toContain('Wilderness exploration map');
    expect(markup).toContain('Ascend');
    expect(markup).toContain('Move north');
    expect(markup).not.toContain('Map options');
  });
});
