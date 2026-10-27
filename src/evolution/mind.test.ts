import {describe,expect,it} from 'vitest';
import {
  biomeSuitability,createWorld,isWorld,population,stepWorld,advanceWorld,
  type World,
} from './engine';
import {traitProfile} from './family';
import {foodAround,planMind,rememberForage} from './mind';
import {compactWorld,readSavedWorld} from './storage';

const context=(w:World)=>({
  occupied:new Map(w.agents.map(a=>[a.y*w.width+a.x,a.id])),
  people:new Map(w.agents.map(a=>[a.id,a])),
  contacts:new Map(w.bonds.filter(b=>b.stage!=='ended').flatMap(b=>
    [[b.a,b.b],[b.b,b.a]] as [number,number][])),
});

describe('Evolution Lab v0.4: autonomous intentions',()=>{
  it('prioritizes hunger over romance and remembers unsuccessful foraging',()=>{
    const w=createWorld({seed:504,size:'small'});
    const a={...w.agents.find(a=>a.species==='human')!,energy:20};
    const {occupied,people,contacts}=context(w);
    const mind=planMind(w,a,occupied,people,contacts,biomeSuitability,traitProfile);
    expect(mind.goal).toBe('forage');
    expect(mind.target).toBeDefined();
    a.mind=mind;
    rememberForage(a,1,.2,5);
    expect(a.mind.lastScarcity).toEqual({x:a.x,y:a.y,year:1});
    expect(foodAround(w,a.x,a.y)).toBeGreaterThanOrEqual(0);
  });

  it('seeks safer terrain and follows a living caregiver when young',()=>{
    const w=createWorld({seed:808,size:'small'});
    const a=w.agents.find(a=>a.species==='human')!;
    const unsafe:World={...w,tiles:w.tiles.map((t,i)=>i===a.y*w.width+a.x?
      {biome:'volcanic',food:t.food}:t)};
    const {occupied,people,contacts}=context(unsafe);
    const vulnerable={...a,energy:90,health:90};
    expect(planMind(unsafe,vulnerable,occupied,people,contacts,biomeSuitability,
      traitProfile).goal).toBe('seek_safety');
    const child={...a,age:3,energy:90,parents:[a.id,unsafe.agents[1].id] as [number,number]};
    const childMind=planMind(w,child,occupied,people,contacts,biomeSuitability,
      traitProfile);
    expect(childMind.goal).toBe('seek_family');
    expect(childMind.target).toEqual({x:a.x,y:a.y});
  });

  it('stays loyal to an active courtship rather than chasing an unavailable person',()=>{
    const w=createWorld({seed:401,size:'small'});
    const [a,b]=w.agents.filter(p=>p.species==='human').slice(0,2);
    const contacts=new Map([[a.id,b.id],[b.id,a.id]]);
    const {occupied,people}=context(w);
    const mind=planMind(w,{...a,age:30,energy:95},occupied,people,
      contacts,biomeSuitability,traitProfile);
    expect(mind.goal).toBe('stay_together');
    expect(mind.target).toEqual({x:b.x,y:b.y});
  });

  it('round-trips minds and upgrades legacy v0.3 people on their next tick',()=>{
    const beginning=createWorld({seed:500,size:'small'});
    const progressed=advanceWorld(beginning,12);
    expect(progressed.agents.every(a=>a.mind)).toBe(true);
    expect(isWorld(progressed)).toBe(true);
    expect(readSavedWorld(compactWorld(progressed))).toEqual(progressed);
    const legacy:World={...beginning,
      agents:beginning.agents.map(({mind:_,...a})=>a)};
    expect(isWorld(legacy)).toBe(true);
    expect(readSavedWorld(JSON.stringify(legacy))).toEqual(legacy);
    const upgraded=stepWorld(legacy);
    expect(upgraded.agents.every(a=>a.mind)).toBe(true);
    expect(isWorld(upgraded)).toBe(true);
    expect(legacy.agents.every(a=>a.mind===undefined)).toBe(true);
    const corrupted:World={...progressed,agents:progressed.agents.map((a,i)=>
      i===0?{...a,mind:{...a.mind!,goal:'impossible' as 'explore'}}:a)};
    expect(isWorld(corrupted)).toBe(false);
  });

  it('replays identical thoughts and populations from the same world seed',()=>{
    const a=advanceWorld(createWorld({seed:707,size:'small'}),35);
    const b=advanceWorld(createWorld({seed:707,size:'small'}),35);
    expect(a).toEqual(b);
  });

  it.each([31,203,721,104729])(
    'supports all four peoples without a global birth ceiling (seed %i)',
    async seed=>{
      // Give Vitest's worker a chance to report progress during CPU-heavy
      // multi-century simulations; the stepped years are otherwise identical.
      let end=createWorld({seed,size:'small',resourceLevel:1});
      for(let year=0;year<180;year+=10){
        end=advanceWorld(end,10);
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      const counts=population(end);
      for(const [species,count] of Object.entries(counts))
        expect(count,`seed ${seed} ${species} at year 180`).toBeGreaterThanOrEqual(20);
      expect(end.agents.length).toBeGreaterThan(850);
      expect(isWorld(end)).toBe(true);
    },90000);
});
