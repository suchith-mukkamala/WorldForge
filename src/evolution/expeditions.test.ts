import {describe,expect,it} from 'vitest';
import {createWorld,biomeSuitability,isWorld,stepWorld,type Settlement} from './engine';
import {traitProfile} from './family';
import {planMind} from './mind';
import {advanceKnowledge,generateAncientSites} from './knowledge';
import {archiveRuins} from './construction';
import {compactWorld,readSavedWorld} from './storage';

describe('WorldForge v1.4: mortal expeditions and archaeological memory',()=>{
  it('procedurally creates several distinct places without consuming world RNG',()=>{
    const w=createWorld({seed:4812,size:'large'});
    const original=w.rngState;
    const sites=generateAncientSites(w);
    expect(sites).toEqual(generateAncientSites(w));
    expect(sites.length).toBeGreaterThan(6);
    expect(new Set(sites.map(s=>s.kind)).size).toBeGreaterThan(2);
    expect(sites.every(s=>w.tiles[s.y*w.width+s.x].biome!=='water')).toBe(true);
    expect(w.rngState).toBe(original);
  });

  it('lets a healthy curious scout choose, prepare for, and begin a real journey',()=>{
    const w=createWorld({seed:203,size:'small'});
    const a=w.agents[0];
    a.age=30;a.energy=95;a.health=95;a.work=undefined;
    a.partnerId=undefined;
    a.development!.career='scout';
    const sx=a.x>7?a.x-6:a.x+6;
    const step=sx>a.x?1:-1;
    for(let x=a.x;x!==sx+step;x+=step)
      w.tiles[a.y*w.width+x].biome='plains';
    w.ancientSites=[{id:1,kind:'library',x:sx,y:a.y,
      topic:'writing',danger:25,visitors:[]}];
    const choose=()=>planMind(w,a,new Map(),new Map(w.agents.map(v=>[v.id,v])),
      new Map(),biomeSuitability,traitProfile);
    const first=choose();
    expect(first.expedition?.siteId).toBe(1);
    expect(first.expedition?.stage).toBe('preparing');
    expect(first.expedition!.supplies).toBeGreaterThan(0);
    a.mind=first;w.year=1;
    const second=choose();
    expect(second.goal).toBe('venture');
    expect(second.expedition?.stage).toBe('travel');
    expect(second.target).toEqual({x:sx,y:a.y});
  });

  it('turns a genuinely fallen settlement into a named, knowledge-bearing ruin',()=>{
    const w=createWorld({seed:57,size:'small'});
    const s:Settlement={id:17,name:'Last Hearth',species:'dwarf',
      x:w.agents[0].x,y:w.agents[0].y,founded:0,population:0,
      stores:0,emptyYears:5,archives:['stonecraft','writing'],
      infrastructure:{land:[],roads:[],buildings:[],nextBuildingId:1,
        foundedWithResidents:0,stock:{wood:0,stone:0,clay:0}}};
    archiveRuins(w,s);
    const site=w.ancientSites!.find(v=>v.name==='Last Hearth');
    expect(site).toMatchObject({kind:'ruin',origin:'collapsed',culture:'dwarf',
      collapsed:0,lostTopics:['stonecraft','writing']});
    expect(w.ruins?.find(r=>r.name==='Last Hearth')).toBeDefined();
    expect(isWorld(w)).toBe(true);
  });

  it('records extraordinary discoveries and lets artifacts improve real skills',()=>{
    const w=createWorld({seed:24,size:'small'});
    const a=w.agents[0];a.age=30;
    const prior=a.development!.skills.knowledge;
    w.ancientSites=[{id:1,kind:'library',x:a.x,y:a.y,topic:'writing',
      danger:0,visitors:[],lostTopics:['writing'],recovered:0}];
    a.mind={goal:'venture',reason:'A planned dig',since:0,
      target:{x:a.x,y:a.y},expedition:{siteId:1,started:0,stage:'travel',
        preparedness:85,supplies:70,home:{x:a.x,y:a.y}}};
    advanceKnowledge(w,()=>.1);
    expect(a.knowledge?.some(k=>k.topic==='writing'&&k.source==='ruin')).toBe(true);
    expect(a.artifacts?.[0].kind).toBe('tome');
    expect(a.development!.skills.knowledge).toBeGreaterThan(prior+10);
    expect(a.mind.expedition?.stage).toBe('returning');
    expect(w.expeditions?.find(e=>e.personId===a.id)?.outcome).toBe('artifact');
    expect(w.ancientSites[0].visits).toBeGreaterThanOrEqual(1);
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const future=stepWorld(w);
    expect(future.expeditions?.length).toBeGreaterThan(0);
    expect(w.expeditions?.some(e=>e.personId===a.id)).toBe(true);
  });
});
