import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,type World} from './engine';
import {tileCapacity} from './density';
import {advanceWorldDays} from './calendar';
import {createMortal} from './divineDescent';
import {adventureDistance,adventureMapFor,adventureRegion,
  useAdventureGate,walkAdventure} from './adventureMap';
import {reachableLandmarks,surveyLandmark} from './mortalSurveys';
import {compactWorld,readSavedWorld} from './storage';
import type {Point} from './motion';

const worldAt=(seed:number)=>createMortal(advanceWorldDays(createWorld({
  seed,size:'small',layout:'archipelago',
}),365*6),{name:'Mira Reed',species:'human',background:'scout',
  appearance:{skin:0,hair:0,hairStyle:0,outfit:'wanderer'}}).world;
const mortal=(world:World)=>world.agents.find(person=>person.id===world.descent?.agentId)!;
const regionAt=(world:World)=>adventureRegion(world,adventureMapFor(world),mortal(world));
const at=(world:World,point:Point):World=>({...world,agents:world.agents.map(person=>
  person.id===world.descent?.agentId?{...person,x:point.x,y:point.y}:person)});
/** Stand on the landmark or the nearest open ground beside it. A ruin tile
 * can already hold its visitors, so the surveyor uses a free neighboring cell. */
const approach=(world:World,site:Point):World=>{
  const actorId=world.descent!.agentId;
  const caps=tileCapacity(world);
  const others=world.agents.filter(person=>person.id!==actorId);
  const candidates:Point[]=[{...site}];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
    if(dx||dy)candidates.push({x:site.x+dx,y:site.y+dy});
  for(const candidate of candidates){
    const {x,y}=candidate;
    if(x<0||y<0||x>=world.width||y>=world.height)continue;
    const index=y*world.width+x;
    if(world.tiles[index].biome==='water')continue;
    if(others.filter(person=>person.x===x&&person.y===y).length<caps[index])
      return at(world,{x,y});
  }
  return at(world,site);
};

describe('mortal surveys',()=>{
  it('learns real knowledge once and retains the survey after a save round-trip',()=>{
    const initial=worldAt(108);
    const site=reachableLandmarks(initial,adventureMapFor(initial),regionAt(initial))[0];
    expect(site).toBeDefined();
    expect(adventureDistance(mortal(initial),site)).toBeGreaterThan(1);
    expect(surveyLandmark(initial,site.id).world).toBe(initial);
    const beside=approach(initial,site);
    const unchanged=JSON.stringify(beside);
    const {world}=surveyLandmark(beside,site.id);
    expect(JSON.stringify(beside)).toBe(unchanged);
    expect(world.rngState).toBe(initial.rngState);
    expect(mortal(world).knowledge).toContainEqual({
      topic:site.topic,year:world.year,source:'ruin',siteId:site.id,
    });
    expect(world.lineage.find(r=>r.id===mortal(world).id)?.knownKnowledge)
      .toEqual(mortal(world).knowledge);
    expect(world.ancientSites?.find(s=>s.id===site.id)?.visits).toBe((site.visits??0)+1);
    expect(world.expeditions?.at(-1)).toMatchObject({siteId:site.id,outcome:'insight'});
    const restored=readSavedWorld(compactWorld(world))!;
    expect(restored.descent?.surveys).toEqual([{siteId:site.id,topic:site.topic,year:world.year}]);
    expect(surveyLandmark(restored,site.id).world).toBe(restored);
    expect(isWorld({...restored,descent:{...restored.descent!,
      surveys:[...restored.descent!.surveys!,...restored.descent!.surveys!]}})).toBe(false);
  });

  it('walks a signed landmark trail, reloads on it, and returns to its town',()=>{
    const initial=worldAt(8512),town=regionAt(initial);
    const sign=town.gates.find(g=>g.landmark)!;
    expect(sign).toBeDefined();
    let world=at(initial,sign.point);
    world=useAdventureGate(world,town,mortal(world),sign).world;
    const trail=regionAt(world);
    expect(trail.name).toBe('Landmark Trail');
    expect(isWorld(world)).toBe(true);
    world=readSavedWorld(compactWorld(world))!;
    const restoredTrail=regionAt(world),steps=[...restoredTrail.trail].reverse();
    expect(restoredTrail.place).toEqual(trail.place);
    expect(steps.length).toBeGreaterThanOrEqual(5);
    for(const index of steps.slice(1)){
      const actor=mortal(world);
      const walk=walkAdventure(world,restoredTrail,index%world.width-actor.x,
        Math.floor(index/world.width)-actor.y);
      expect(walk.moved).toBe(true);
      world=walk.world;
    }
    const exit=restoredTrail.gates.find(g=>g.destination.kind==='wild')!;
    const arrived=useAdventureGate(world,restoredTrail,mortal(world),exit);
    expect(arrived.moved).toBe(true);
    const glade=regionAt(arrived.world);
    expect(glade.name).toBe(sign.label);
    expect(reachableLandmarks(arrived.world,adventureMapFor(arrived.world),glade)
      .some(site=>adventureDistance(site,glade.focus)===0)).toBe(true);
    const back=useAdventureGate(arrived.world,glade,mortal(arrived.world),glade.gates[0]);
    expect(back.moved).toBe(true);
    const returned=at(back.world,sign.point),returning=regionAt(returned);
    expect(useAdventureGate(returned,returning,mortal(returned),
      returning.gates.find(g=>g.destination.kind==='town')!).world.descent?.place)
      .toEqual(town.place);
  });
});
