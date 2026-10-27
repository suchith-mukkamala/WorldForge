import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorld,biomeSuitability,createWorld,isWorld,stepWorld,
  type Agent,type World} from './engine';
import {traitProfile} from './family';
import {planMind,movementIntent} from './mind';
import {compactWorld,readSavedWorld} from './storage';
import {PeopleDirectory} from './PeopleDirectory';
import {developSociety,helpDependent,initialDevelopment,lifeStage,
  type CareOutcome} from './development';

describe('Evolution Lab v0.5 — childhood and social development',()=>{
  it('has species-specific infancy, childhood, adolescence, adulthood and elderhood',()=>{
    const world=createWorld({seed:111,size:'small'});
    for(const species of ['human','elf','dwarf','demon'] as const){
      const original=world.agents.find(a=>a.species===species)!;
      const p=traitProfile(original.ancestry);
      const at=(age:number)=>lifeStage({...original,age});
      expect(at(0)).toBe('infant');
      expect(at(Math.ceil(p.maturity*.3))).toBe('child');
      expect(at(Math.ceil(p.maturity*.8))).toBe('adolescent');
      expect(at(Math.ceil(p.maturity+2))).toBe('adult');
      expect(at(Math.ceil(p.lifespan*.9))).toBe('elder');
    }
  });

  it('allows equally gifted children to grow into different skills, values and careers',()=>{
    const start=createWorld({seed:313,size:'small'});
    const teacher=start.agents.find(a=>a.species==='elf')!;
    const [child1,child2]=start.agents.filter(a=>a.species==='human').slice(0,2);
    const sameGenes={vigor:1,curiosity:1,social:1,fertility:1};
    const move=(a:Agent,x:number,y:number,age:number)=>({
      ...a,x,y,age,energy:92,health:98,genes:{...sameGenes},
    });
    const adult=move(teacher,20,20,56),supported=move(child1,21,20,3),
      isolated=move(child2,50,45,3);
    adult.genes.social=1.2;
    adult.development=initialDevelopment(adult,'forest');
    adult.development.career='scholar';
    supported.development=initialDevelopment(supported,'forest');
    isolated.development=initialDevelopment(isolated,'forest');
    expect(supported.genes).toEqual(isolated.genes);
    const w:World={...start,agents:[adult,supported,isolated]};
    for(let year=1;year<=16;year++){
      w.year=year;
      supported.age++;isolated.age++;
      const care=new Map<number,CareOutcome>([
        [supported.id,{providerId:adult.id,shelter:true,protected:true}],
        [isolated.id,{shelter:false,protected:false}],
      ]);
      developSociety(w,care,()=>.99);
    }
    const a=supported.development!,b=isolated.development!;
    expect(a.trust).toBeGreaterThan(b.trust);
    expect(a.values.community).toBeGreaterThan(b.values.community);
    expect(a.skills.knowledge).toBeGreaterThan(b.skills.knowledge);
    expect(a.languages.elf).toBeGreaterThan(b.languages.elf);
    expect(a.yearsTaught).toBeGreaterThan(0);
    expect(a.memories.some(m=>m.kind==='mentorship')).toBe(true);
    expect(b.memories.some(m=>m.kind==='hardship')).toBe(true);
    expect(a.career).not.toBe(b.career);
    const adultIntention=(person:Agent)=>{
      const probe={...person,x:20,y:20,age:24,energy:98,health:98,
        partnerId:undefined,mind:undefined};
      const context={...w,year:(4-person.id%4)%4,agents:[probe]};
      return planMind(context,probe,new Map([[20*w.width+20,probe.id]]),
        new Map([[probe.id,probe]]),new Map(),biomeSuitability,traitProfile);
    };
    const supportedGoal=adultIntention(supported),isolatedGoal=adultIntention(isolated);
    expect([supportedGoal.goal,isolatedGoal.goal]).toEqual(
      expect.arrayContaining(['vocation']));
    expect(supportedGoal.goal+' '+supportedGoal.reason).not.toBe(
      isolatedGoal.goal+' '+isolatedGoal.reason);
    expect(supportedGoal.reason).not.toBe(isolatedGoal.reason);
    expect([a,b].every(d=>!('alignment' in d))).toBe(true);
  });

  it('supports cross-species adoption and language learning without changing ancestry',()=>{
    const start=createWorld({seed:808,size:'small'});
    const guardian=start.agents.find(a=>a.species==='elf')!;
    const young=start.agents.find(a=>a.species==='human')!;
    const parentIds:[number,number]=[90001,90002];
    const a={...guardian,x:20,y:20,age:55,energy:97,
      genes:{...guardian.genes,social:1.3}};
    const b={...young,x:21,y:20,age:4,parents:parentIds,
      development:initialDevelopment({...young,parents:parentIds},'forest')};
    const w:World={...start,year:1,agents:[a,b]};
    developSociety(w,new Map([[b.id,{
      providerId:a.id,shelter:true,protected:true,
    }]]),()=>0);
    expect(b.development?.adoptedBy).toBe(a.id);
    expect(b.development?.householdId).toBe(a.development?.householdId);
    expect(b.development?.languages.elf).toBeGreaterThan(0);
    expect(b.ancestry).toEqual(young.ancestry);
    expect(b.development?.memories.some(m=>m.kind==='adoption')).toBe(true);
  });

  it('makes infant care a real transfer of energy rather than decorative text',()=>{
    const start=createWorld({seed:91,size:'small'});
    const [first,second]=start.agents.filter(a=>a.species==='human').slice(0,2);
    const elder={...first,x:24,y:24,age:42,energy:92};
    const infant={...second,x:25,y:24,age:0,energy:41,
      development:initialDevelopment({...second,parents:[elder.id,7000]},'plains')};
    infant.development.caregiverIds=[elder.id];
    const w:World={...start,agents:[elder,infant]};
    const occupied=new Map([[24*w.width+24,elder.id],[24*w.width+25,infant.id]]);
    const people=new Map([[elder.id,elder],[infant.id,infant]]);
    const care=helpDependent(w,infant,occupied,people);
    expect(care.providerId).toBe(elder.id);
    expect(infant.energy).toBeGreaterThan(41);
    expect(elder.energy).toBeLessThan(92);
    const alone={...infant,energy:41};
    expect(helpDependent(w,alone,new Map(),new Map()).providerId).toBeUndefined();
    expect(alone.energy).toBe(41);
  });

  it('gives healthy, curious adults genuine exploration targets outside home terrain',()=>{
    const w=createWorld({seed:504,size:'small'});
    const explorer=w.agents.find(a=>a.species==='dwarf')!;
    const a:Agent={...explorer,age:42,energy:98,health:98,
      genes:{...explorer.genes,curiosity:1.35},partnerId:undefined};
    w.year=(19-a.id*7%19)%19;
    const occupied=new Map(w.agents.map(b=>[b.y*w.width+b.x,b.id]));
    const byId=new Map(w.agents.map(b=>[b.id,b]));
    const mind=planMind(w,a,occupied,byId,new Map(),biomeSuitability,traitProfile);
    expect(mind.goal).toBe('venture');
    expect(mind.target).toBeDefined();
    a.mind=mind;
    const target=mind.target!;
    const nx=a.x+Math.sign(target.x-a.x),ny=a.y+Math.sign(target.y-a.y);
    expect(movementIntent(a,nx,ny,w.year)).toBeGreaterThan(40);
  });

  it('records journeys into at least one non-native biome in seeded worlds',()=>{
    const world=advanceWorld(createWorld({seed:721,size:'small',resourceLevel:1.2}),120);
    const traveled=world.agents.filter(a=>a.development?.knownBiomes.some(b=>
      biomeSuitability(a.ancestry,b)<.45));
    expect(traveled.length).toBeGreaterThan(0);
  },30000);

  it('keeps v0.4 saves readable, records new experiences, and renders the social profile',()=>{
    const original=createWorld({seed:103,size:'small'});
    const old:World={...original,households:undefined,nextHouseholdId:undefined,
      agents:original.agents.map(({development:_,...a})=>a)};
    expect(isWorld(old)).toBe(true);
    const advanced=advanceWorld(old,24);
    expect(advanced.agents.every(a=>a.development)).toBe(true);
    expect(advanced.households?.length).toBeGreaterThan(0);
    expect(isWorld(advanced)).toBe(true);
    expect(readSavedWorld(compactWorld(advanced))).toEqual(advanced);
    const html=renderToStaticMarkup(createElement(PeopleDirectory,{
      world:advanced,selectedId:advanced.agents[0].id,
      onOpen:()=>{},onFavorite:()=>{},onRename:()=>{},onFindOnMap:()=>{},
    }));
    expect(html).toContain('UPBRINGING &amp; SOCIAL WORLD');
    expect(html).toContain('LEARNED SKILLS');
    expect(html).toContain('FORMATIVE MEMORIES');
    expect(isWorld(stepWorld(advanced))).toBe(true);
  },30000);
});
