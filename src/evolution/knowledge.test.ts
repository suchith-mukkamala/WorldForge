import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld,editWorld,advanceWorld,
  type Settlement} from './engine';
import {pureAncestry,traitProfile} from './family';
import {TOPICS,advanceKnowledge,generateAncientSites,knows,learn,
  type Topic} from './knowledge';
import {advanceWorldDays} from './calendar';
import {intervene} from './divine';
import {compactWorld,readSavedWorld} from './storage';

describe('WorldForge v1.3: discovery and memory of knowledge',()=>{
  it('starts with instincts, not agriculture, and gives each seed stable ancient sites',()=>{
    const w=createWorld({seed:305,size:'small'});
    expect(w.knowledge?.firsts).toEqual([]);
    expect(w.agents.every(a=>!a.knowledge?.length)).toBe(true);
    expect(w.ancientSites?.length).toBeGreaterThan(4);
    expect(w.ancientSites).toEqual(generateAncientSites(w));
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
  });
  it('records first discovery, personal source, family memory, and a durable world chronicle',()=>{
    const w=createWorld({seed:712,size:'small'}),a=w.agents[0];
    expect(learn(w,a,'agriculture','discovery')).toBe(true);
    expect(learn(w,a,'agriculture','discovery')).toBe(false);
    expect(knows(a,'agriculture')).toBe(true);
    expect(w.knowledge?.firsts).toEqual([{
      topic:'agriculture',year:0,personId:a.id,source:'discovery',
    }]);
    expect(a.development?.memories.some(m=>m.kind==='discovery')).toBe(true);
    expect(w.lineage[0].moments?.some(m=>m.kind==='discovery')).toBe(true);
    expect(w.lineage[0].knownKnowledge?.[0].topic).toBe('agriculture');
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const next=stepWorld(w);
    expect(knows(next.agents.find(b=>b.id===a.id)!, 'agriculture')).toBe(true);
    expect(knows(w.agents[0],'agriculture')).toBe(true);
    expect(next.knowledge?.firsts[0]).toEqual(w.knowledge?.firsts[0]);
  });
  it('preserves learned ideas and their sources after a teacher dies',()=>{
    const w=createWorld({seed:96,size:'small'}),a=w.agents[0];
    learn(w,a,'stonecraft','ruin',undefined,3);
    a.age=999;
    const future=stepWorld(w);
    expect(future.agents.some(b=>b.id===a.id)).toBe(false);
    expect(future.lineage.find(r=>r.id===a.id)?.knownKnowledge).toEqual([{
      topic:'stonecraft',year:0,source:'ruin',siteId:3,
    }]);
    expect(isWorld(future)).toBe(true);
  });
  it('lets a written archive teach future readers when its founder has left',()=>{
    const w=createWorld({seed:105,size:'small',
      starting:{human:2,elf:0,dwarf:0,demon:0}});
    const [scribe,reader]=w.agents;
    scribe.age=32;reader.age=20;
    reader.x=scribe.x;reader.y=scribe.y;
    reader.development!.skills.knowledge=10;
    const x=scribe.x,y=scribe.y;
    const hall={id:1,type:'communal' as const,x,y,culture:'human' as const,
      stage:'complete' as const,progress:100,condition:100,
      started:0,finished:0,spent:{wood:11,stone:9,clay:9},labor:21};
    const town:Settlement={id:1,species:'human',name:'First Library',x,y,
      founded:0,population:2,stores:20,emptyYears:0,
      infrastructure:{land:[y*w.width+x],buildings:[hall],roads:[],
        stock:{wood:0,stone:0,clay:0},oreStock:{coal:0,copper:0,iron:0,gold:0},
        nextBuildingId:2,foundedWithResidents:2}};
    w.settlements.push(town);w.nextSettlementId=2;
    w.history[0].settlements=1;
    learn(w,scribe,'writing','ruin');
    learn(w,scribe,'agriculture','discovery');
    advanceKnowledge(w,()=>.99);
    expect(town.archives).toContain('writing');
    expect(town.archives).toContain('agriculture');
    expect(knows(reader,'agriculture')).toBe(false);
    const far=w.tiles.findIndex((t,i)=>t.biome!=='water'&&
      Math.abs(i%w.width-x)>12&&Math.abs(Math.floor(i/w.width)-y)>12);
    scribe.x=far%w.width;scribe.y=Math.floor(far/w.width);
    advanceKnowledge(w,()=>0);
    expect(reader.knowledge?.[0].source).toBe('archive');
    expect(town.archives?.length).toBeGreaterThan(0);
    expect(isWorld(w)).toBe(true);
  });
  it('transfers knowledge to a nearby mentee, but not to everyone worldwide',()=>{
    const w=createWorld({seed:19,size:'small',
      starting:{human:3,elf:0,dwarf:0,demon:0}});
    const [mentor,student,other]=w.agents;
    // Force one real local meeting while leaving the third person far away.
    student.x=mentor.x;student.y=mentor.y;
    other.x=Math.max(1,w.width-5);other.y=Math.max(1,w.height-5);
    const far=w.tiles[other.y*w.width+other.x];
    if(far.biome==='water'){
      other.x=mentor.x+8;other.y=mentor.y+8;
    }
    student.development!.mentorId=mentor.id;
    expect(learn(w,mentor,'agriculture','discovery')).toBe(true);
    advanceKnowledge(w,()=>0);
    expect(student.knowledge?.find(k=>k.topic==='agriculture')?.source).toBe('teaching');
    expect(w.lineage.find(r=>r.id===student.id)?.knownKnowledge?.[0].teacherId)
      .toBe(mentor.id);
    expect(knows(other,'agriculture')).toBe(false);
    expect(w.knowledge?.firsts).toHaveLength(1);
  });
  it('rejects forged knowledge and ancient-site details in a saved world',()=>{
    const w=createWorld();
    expect(isWorld({...w,knowledge:{firsts:[{
      topic:'teleportation' as Topic,year:0,personId:1,source:'discovery' as const,
    }]}})).toBe(false);
    expect(isWorld({...w,ancientSites:[{...w.ancientSites![0],danger:999}]})).toBe(false);
    expect(isWorld({...w,agents:[{...w.agents[0],knowledge:[{
      topic:'agriculture' as Topic,year:9999,source:'discovery' as const,
    }]},...w.agents.slice(1)]})).toBe(false);
    expect(TOPICS).toHaveLength(9);
  });
  it('accepts older worlds with no knowledge data and begins tracking from then on',()=>{
    const original=createWorld({seed:84,size:'small'});
    const {knowledge:_,ancientSites:__,...legacy}=original;
    expect(isWorld(legacy)).toBe(true);
    expect(readSavedWorld(JSON.stringify(legacy))).toEqual(legacy);
    const upgraded=stepWorld(legacy);
    expect(upgraded.ancientSites?.length).toBeGreaterThan(0);
    expect(upgraded.knowledge).toBeDefined();
    expect(isWorld(upgraded)).toBe(true);
  });
  it('makes dangerous exploration a one-time encounter per site and individual',()=>{
    const w=createWorld({seed:36,size:'small'});
    const a=w.agents.find(p=>p.age>=traitProfile(p.ancestry).maturity)!;
    w.ancientSites=[{id:1,kind:'temple',x:a.x,y:a.y,topic:'writing',
      danger:100,visitors:[]}];
    a.mind={...a.mind!,goal:'explore'};
    const health=a.health;
    advanceKnowledge(w,()=>0);
    expect(w.ancientSites[0].visitors.filter(id=>id===a.id)).toHaveLength(1);
    expect(a.health).toBeLessThan(health);
    const after=a.health;
    advanceKnowledge(w,()=>0);
    expect(w.ancientSites[0].visitors.filter(id=>id===a.id)).toHaveLength(1);
    expect(a.health).toBe(after);
    expect(isWorld(w)).toBe(true);
    expect(a.mortalWound).toBe(true);
    const following=stepWorld(w);
    expect(following.agents.some(person=>person.id===a.id)).toBe(false);
    expect(following.lineage.find(record=>record.id===a.id)?.moments?.at(-1)?.text)
      .toContain('ancient ruin');
    expect(isWorld(following)).toBe(true);
  });
  it('lets divine healing reverse a mortal expedition injury',()=>{
    const w=createWorld({seed:18,size:'small'}),id=w.agents[0].id;
    w.agents[0].mortalWound=true;
    w.agents[0].health=1;
    const healed=intervene(w,{kind:'heal',personId:id});
    expect(healed.agents[0].mortalWound).toBeUndefined();
    expect(healed.agents[0].health).toBe(100);
    expect(isWorld(stepWorld(healed))).toBe(true);
  });
  it('returns remembered discoveries when a deity resurrects a scholar',()=>{
    const w=createWorld({seed:299,size:'small'}),id=w.agents[0].id;
    learn(w,w.agents[0],'herbalism','discovery');
    w.agents[0].age=999;
    const dead=stepWorld(w);
    expect(dead.agents.some(a=>a.id===id)).toBe(false);
    const revived=intervene(dead,{kind:'resurrect',personId:id});
    const scholar=revived.agents.find(a=>a.id===id)!;
    expect(scholar.knowledge?.map(k=>k.topic)).toContain('herbalism');
    expect(revived.lineage.find(r=>r.id===id)?.knownKnowledge?.[0].topic)
      .toBe('herbalism');
    expect(isWorld(revived)).toBe(true);
  });
  it('produces learned farming and professions over lived generations',()=>{
    const world=advanceWorld(createWorld({seed:104729,size:'small'}),32);
    const discovered=world.knowledge?.firsts.map(f=>f.topic)??[];
    expect(discovered.length).toBeGreaterThan(0);
    expect(world.agents.some(a=>a.knowledge?.length)).toBe(true);
    expect(isWorld(world)).toBe(true);
  });
});

describe('WorldForge v1.3: demonic physical advantages',()=>{
  it('grants meaningful inherited speed and strength without a biome bonus',()=>{
    const human=traitProfile(pureAncestry('human'));
    const demon=traitProfile(pureAncestry('demon'));
    const hybrid=traitProfile({human:.5,demon:.5,dwarf:0,elf:0});
    expect(demon.strength).toBeGreaterThan(human.strength*1.7);
    expect(demon.speed).toBeGreaterThan(human.speed*1.6);
    expect(hybrid.strength).toBeCloseTo((demon.strength+human.strength)/2);
    expect(hybrid.speed).toBeCloseTo((demon.speed+human.speed)/2);
  });
  it('allows a swift demon to cover more real distance in the same calendar months',()=>{
    const starting={human:0,elf:0,dwarf:0,demon:0};
    const base=createWorld({seed:421,size:'small',starting});
    const position=base.tiles.findIndex((t,i)=>t.biome==='plains'&&
      i%base.width<base.width-12&&Math.floor(i/base.width)>8);
    const x=position%base.width,y=Math.floor(position/base.width);
    const make=(species:'human'|'demon')=>{
      const w=editWorld(base,x,y,{kind:'spawn',species});
      const a=w.agents[0];
      a.mind={...a.mind!,goal:'venture',target:{x:x+9,y},
        reason:'Exploring the far side of the valley.'};
      return w;
    };
    const h=advanceWorldDays(make('human'),184);
    const d=advanceWorldDays(make('demon'),184);
    expect(d.agents[0].x-x).toBeGreaterThan(h.agents[0].x-x);
    expect(isWorld(h)).toBe(true);
    expect(isWorld(d)).toBe(true);
  });
});
