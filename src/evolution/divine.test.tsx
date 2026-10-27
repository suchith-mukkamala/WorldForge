import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,advanceWorld,biomeSuitability,isWorld,stepWorld,
  SPECIES_INFO,type Agent,type World} from './engine';
import {DivinePowers} from './DivinePowers';
import {PeopleDirectory} from './PeopleDirectory';
import {traitProfile} from './family';
import {makeLifeRecord} from './identity';
import {compactWorld,readSavedWorld} from './storage';
import {planMind} from './mind';
import {divineFactor,inheritDivinity,intervene,mortalWhisper} from './divine';

describe('Evolution Lab v0.6 — divine powers and mortal agency',()=>{
  it('maintains backward-compatible world saves and validates divine history',()=>{
    const start=createWorld({seed:616,size:'small'});
    expect(isWorld(start)).toBe(true);
    const legacy:World={...start,divine:undefined};
    expect(isWorld(legacy)).toBe(true);
    const next=stepWorld(legacy);
    expect(isWorld(next)).toBe(true);
    expect(next.divine?.mode).toBe('sandbox');
    expect(readSavedWorld(compactWorld(next))).toEqual(next);
  });

  it('makes temporary, permanent, debuff and hereditary effects change real modifiers',()=>{
    const start=createWorld({seed:44,size:'small'});
    const id=start.agents[0].id;
    const blessed=intervene(start,{kind:'blessing',personId:id,
      stat:'fertility',strength:.5,duration:'hereditary',years:10});
    const cursed=intervene(blessed,{kind:'blessing',personId:id,
      stat:'health',strength:-.5,duration:'temporary',years:2});
    const person=cursed.agents.find(a=>a.id===id)!;
    expect(divineFactor(person,'fertility',0)).toBe(1.5);
    expect(divineFactor(person,'health',0)).toBe(.5);
    expect(divineFactor(person,'health',3)).toBe(1);
    expect(person.blessings?.[0].hereditary).toBe(true);
    expect(person.blessings?.[1].expires).toBe(2);
    expect(start.agents[0].blessings).toBeUndefined();
    expect(isWorld(cursed)).toBe(true);
    expect(readSavedWorld(compactWorld(cursed))).toEqual(cursed);
    expect(stepWorld(advanceWorld(cursed,3)).agents.find(a=>a.id===id)
      ?.blessings?.some(e=>e.stat==='health')).toBeFalsy();
  });

  it('allows independent refusal, acceptance and reinterpretation of whispers',()=>{
    let w=createWorld({seed:709,size:'small'});
    const outcomes=new Map<string,number>();
    for(const person of w.agents.filter(a=>a.age>=traitProfile(a.ancestry).maturity)){
      w=intervene(w,{kind:'whisper',personId:person.id,theme:'learning',
        voice:person.id%2?'dream':'prophecy',words:'Study the world.',years:5});
      const response=w.divine!.history.at(-1)!.response!;
      outcomes.set(response,person.id);
    }
    expect(outcomes.has('accepted')).toBe(true);
    expect(outcomes.has('resisted')).toBe(true);
    expect(outcomes.has('reinterpreted')).toBe(true);
    const accepting=w.agents.find(a=>a.id===outcomes.get('accepted'))!;
    const resisting=w.agents.find(a=>a.id===outcomes.get('resisted'))!;
    const reinterpret=w.agents.find(a=>a.id===outcomes.get('reinterpreted'))!;
    expect(mortalWhisper(resisting,w.year)).toBeUndefined();
    expect(mortalWhisper(reinterpret,w.year)?.interpretedAs).toBe('personal_goal');
    expect(w.agents.some(a=>a.whispers?.some(q=>q.voice==='dream'))).toBe(true);
    expect(w.agents.some(a=>a.whispers?.some(q=>q.voice==='prophecy'))).toBe(true);
    const probe:Agent={...accepting,age:30,energy:99,health:99,
      partnerId:undefined,mind:undefined};
    const byId=new Map(w.agents.map(a=>[a.id,a]));byId.set(probe.id,probe);
    const occupied=new Map(w.agents.map(a=>[a.y*w.width+a.x,a.id]));
    const mind=planMind(w,probe,occupied,byId,new Map(),
      biomeSuitability,traitProfile);
    expect(mind.goal).toBe('vocation');
    expect(mind.reason).toContain('divine whisper');
    expect(w.divine?.history.some(r=>r.response==='resisted')).toBe(true);
    expect(isWorld(w)).toBe(true);
  });

  it('passes family blessings and curses to children and grandchildren with source IDs',()=>{
    const original=createWorld({seed:919,size:'small'});
    const id=original.agents[0].id;
    const w=intervene(original,{kind:'blessing',personId:id,
      stat:'intelligence',strength:1,duration:'hereditary',years:50});
    const parent=w.agents[0],other=w.agents[1];
    const child:Agent={...w.agents[2],id:w.nextAgentId++,age:0,born:w.year,
      parents:[parent.id,other.id],blessings:undefined,whispers:undefined};
    w.lineage.push(makeLifeRecord(w,child));
    inheritDivinity(w,child,[parent,other]);
    expect(divineFactor(child,'intelligence',w.year)).toBe(1.92);
    expect(child.blessings?.[0].sourceId).toBe(id);
    expect(child.blessings?.[0].inheritedFrom).toBe(parent.id);
    const descendant:Agent={...w.agents[3],id:w.nextAgentId++,age:0,born:w.year,
      parents:[child.id,other.id],blessings:undefined,whispers:undefined};
    w.lineage.push(makeLifeRecord(w,descendant));
    inheritDivinity(w,descendant,[child,other]);
    expect(descendant.blessings?.[0].strength).toBeCloseTo(.846,2);
    expect(w.lineage.find(r=>r.id===descendant.id)?.divineOrigins).toEqual([1]);
    expect(w.lineage.find(r=>r.id===descendant.id)?.moments?.some(m=>
      m.kind==='divine')).toBe(true);
  });

  it('directly heals, punishes, summons and transforms terrain without breaking saves',()=>{
    const start=createWorld({seed:333,size:'small'});
    const id=start.agents[0].id;
    const hurt={...start,agents:start.agents.map(a=>a.id===id?
      {...a,energy:10,health:22}:a)};
    const healed=intervene(hurt,{kind:'heal',personId:id});
    expect(healed.agents[0].health).toBe(100);
    expect(healed.agents[0].energy).toBe(100);
    const punished=intervene(healed,{kind:'punish',personId:id,severity:43});
    expect(punished.agents[0].health).toBe(57);
    const next=intervene(punished,{kind:'summon',species:'demon',x:30,y:30});
    expect(next.agents).toHaveLength(start.agents.length+1);
    expect(next.lineage).toHaveLength(start.lineage.length+1);
    expect(next.history.at(-1)?.total).toBe(next.agents.length);
    const transformed=intervene(next,{kind:'terrain',biome:'forest',x:1,y:1});
    expect(transformed.tiles[1+transformed.width].biome).toBe('forest');
    expect(isWorld(transformed)).toBe(true);
    expect(readSavedWorld(compactWorld(transformed))).toEqual(transformed);
  });

  it('returns an archived person from death while retaining their identity',()=>{
    const seed=createWorld({seed:2027,size:'small'});
    const victim=seed.agents[0];
    const future=stepWorld({...seed,agents:seed.agents.map(a=>a.id===victim.id?
      {...a,health:1,energy:0}:a)});
    const archived=future.lineage.find(r=>r.died!==undefined)!;
    expect(archived).toBeDefined();
    const risen=intervene(future,{kind:'resurrect',personId:archived.id,x:30,y:30});
    expect(risen.agents.some(a=>a.id===archived.id)).toBe(true);
    expect(risen.lineage.find(r=>r.id===archived.id)?.died).toBeUndefined();
    expect(risen.lineage.find(r=>r.id===archived.id)?.moments?.at(-1)?.kind).toBe('divine');
    expect(risen.agents.length).toBe(future.agents.length+1);
    expect(isWorld(risen)).toBe(true);
  });

  it('rejects impossible interventions without modifying an existing world',()=>{
    const w=createWorld({seed:12,size:'small'});
    const person=w.agents[0];
    expect(()=>intervene(w,{kind:'terrain',biome:'water',
      x:person.x,y:person.y})).toThrow();
    expect(()=>intervene(w,{kind:'blessing',personId:person.id,
      stat:'fertility',strength:50,duration:'permanent',years:0})).toThrow();
    expect(()=>intervene(w,{kind:'resurrect',personId:person.id})).toThrow();
    expect(isWorld(w)).toBe(true);
    expect(w.divine?.history).toHaveLength(0);
  });

  it('renders actionable controls, cultural interpretations and source tracing',()=>{
    const start=createWorld({seed:42,size:'small'});
    const id=start.agents[0].id;
    const w=intervene(start,{kind:'blessing',personId:id,
      stat:'fertility',strength:.5,duration:'hereditary',years:2});
    const controls=renderToStaticMarkup(createElement(DivinePowers,{world:w,
      selectedId:id,selectedTile:{x:20,y:20},onApply:()=>{},
      onOpenPerson:()=>{},onFindOnMap:()=>{}}));
    expect(controls).toContain('DIVINE INTERVENTION HISTORY');
    expect(controls).toContain('UNRESTRICTED SANDBOX');
    expect(controls).toContain('SEND DIVINE MESSAGE');
    const profile=renderToStaticMarkup(createElement(PeopleDirectory,{world:w,
      selectedId:id,onOpen:()=>{},onFavorite:()=>{},onRename:()=>{},
      onFindOnMap:()=>{}}));
    expect(profile).toContain('DIVINE INFLUENCE &amp; LINEAGE');
    expect(profile).toContain('HEREDITARY');
    expect(w.divine?.history[0].interpretations.dwarf).not.toBe(
      w.divine?.history[0].interpretations.human);
  });

  it('improves human and demon demographic parameters without making them immortal',()=>{
    expect(SPECIES_INFO.human.fertility).toBeGreaterThan(.23);
    expect(SPECIES_INFO.demon.fertility).toBeGreaterThan(.105);
    expect(SPECIES_INFO.demon.metabolism).toBeLessThan(10.5);
    const w=advanceWorld(createWorld({seed:31,size:'small',resourceLevel:1}),140);
    expect(w.agents.filter(a=>a.species==='human').length).toBeGreaterThan(2);
    expect(w.agents.filter(a=>a.species==='demon').length).toBeGreaterThan(2);
    expect(isWorld(w)).toBe(true);
  },40000);

  it('maintains viable human and demon communities through a longer ecological horizon',async()=>{
    let w=createWorld({seed:31,size:'small',resourceLevel:1});
    for(let i=0;i<240;i+=10){
      w=advanceWorld(w,10);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    const human=w.agents.filter(a=>a.species==='human').length;
    const demon=w.agents.filter(a=>a.species==='demon').length;
    expect(human,'human community at year 240').toBeGreaterThanOrEqual(8);
    expect(demon,'demon community at year 240').toBeGreaterThanOrEqual(8);
    expect(isWorld(w)).toBe(true);
  },120000);
});
