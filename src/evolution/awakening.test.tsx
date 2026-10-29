import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {awakeningWindow,isAwakeningRecord,naturalAwakeningPlan} from './awakening';
import {intervene} from './divine';
import {createWorld,isWorld,stepWorld,SPECIES,type World} from './engine';
import {mixAncestry,pureAncestry} from './family';
import {PeopleDirectory} from './PeopleDirectory';
import {PixelPortrait} from './PixelPortrait';
import {RankProfile} from './RankProfile';
import {compactWorld,readSavedWorld} from './storage';

describe('v2.1.3 — age-based natural awakening',()=>{
  const genes={vigor:1,curiosity:1,fertility:1,social:1};

  it('scales the entire timing window to a species or mixed ancestry',()=>{
    const human=awakeningWindow(pureAncestry('human'));
    const elf=awakeningWindow(pureAncestry('elf'));
    const dwarf=awakeningWindow(pureAncestry('dwarf'));
    const demon=awakeningWindow(pureAncestry('demon'));
    expect(human).toEqual({earliest:10,latest:60});
    expect(elf).toEqual({earliest:22,latest:182});
    expect(human.latest).toBeLessThan(demon.latest);
    expect(demon.latest).toBeLessThan(dwarf.latest);
    expect(dwarf.latest).toBeLessThan(elf.latest);
    const mixed=awakeningWindow(mixAncestry(
      pureAncestry('human'),pureAncestry('elf')));
    expect(mixed.earliest).toBeGreaterThan(human.earliest);
    expect(mixed.earliest).toBeLessThan(elf.earliest);
    expect(mixed.latest).toBeGreaterThan(human.latest);
    expect(mixed.latest).toBeLessThan(elf.latest);
    for(const species of SPECIES){
      const ancestry=pureAncestry(species),window=awakeningWindow(ancestry);
      for(let id=1;id<=1000;id++){
        const plan=naturalAwakeningPlan(213,id,genes,ancestry);
        if(plan.age!==null){
          expect(plan.age).toBeGreaterThanOrEqual(window.earliest);
          expect(plan.age).toBeLessThanOrEqual(window.latest);
        }
      }
    }
  });

  it('gives individuals stable, independent fate, including never awakening',()=>{
    const ancestry=pureAncestry('human');
    const count={early:0,adult:0,late:0,never:0};
    for(let id=1;id<=10000;id++){
      const plan=naturalAwakeningPlan(213,id,genes,ancestry);
      expect(naturalAwakeningPlan(213,id,genes,ancestry)).toEqual(plan);
      count[plan.phase]++;
      expect(plan.age===null).toBe(plan.phase==='never');
    }
    expect(count.never).toBeGreaterThan(1400);
    expect(count.never).toBeLessThan(2200);
    expect(count.early).toBeGreaterThan(1000);
    expect(count.adult).toBeGreaterThan(4000);
    expect(count.late).toBeGreaterThan(1000);
    const sample=naturalAwakeningPlan(213,99,genes,ancestry);
    expect(naturalAwakeningPlan(214,99,genes,ancestry)).not.toEqual(sample);
  });

  it('begins with dormant founders and records only witnessed life events',()=>{
    const world=createWorld({seed:21313,size:'small'});
    expect(world.agents.every(a=>a.awakening===undefined)).toBe(true);
    expect(world.lineage.every(a=>a.awakening===undefined)).toBe(true);
    const next=stepWorld(world);
    const living=new Map(next.agents.map(a=>[a.id,a]));
    const awakened=next.lineage.filter(r=>r.awakening!==undefined);
    expect(awakened.length).toBeGreaterThan(0);
    for(const record of awakened){
      const mortal=living.get(record.id);
      expect(mortal).toBeDefined();
      expect(mortal!.awakening).toEqual(record.awakening);
      expect(record.awakening?.year).toBe(next.year);
      expect(record.awakening?.age).toBe(mortal!.age);
      expect(record.moments?.filter(m=>m.kind==='awakening')).toHaveLength(1);
      expect(mortal!.age).toBeGreaterThanOrEqual(naturalAwakeningPlan(
        world.settings.seed,mortal!.id,mortal!.genes,mortal!.ancestry).age!);
    }
    expect(world.lineage.every(r=>r.awakening===undefined)).toBe(true);
    expect(isWorld(next)).toBe(true);
  });

  it('never schedules powers, changes the RNG, or re-awakens the same life',()=>{
    const world=createWorld({seed:21313,size:'small'});
    const awakened=stepWorld(world);
    const alreadyAwake:World={...world,
      agents:world.agents.map(a=>({...a,
        awakening:{kind:'natural',age:a.age||1,year:world.year}})),
      lineage:world.lineage.map(r=>({...r,
        awakening:{kind:'natural',age:1,year:world.year}})),
    };
    const forced=stepWorld(alreadyAwake);
    expect(forced.rngState).toBe(awakened.rngState);
    expect(forced.agents.map(a=>[a.id,a.age,a.health,a.energy,a.x,a.y]))
      .toEqual(awakened.agents.map(a=>[a.id,a.age,a.health,a.energy,a.x,a.y]));
    const twoYears=stepWorld(awakened);
    for(const r of twoYears.lineage){
      const events=r.moments?.filter(m=>m.kind==='awakening')??[];
      expect(events.length).toBeLessThanOrEqual(1);
      if(r.awakening)expect(events).toHaveLength(1);
    }
  });

  it('does not awaken newborns or fabricate awakenings for the dead',()=>{
    let world=createWorld({seed:212121,size:'small'});
    for(let i=0;i<40&&!world.lineage.some(r=>r.generation>0);i++)
      world=stepWorld(world);
    const child=world.lineage.find(r=>r.generation>0)!;
    expect(child).toBeDefined();
    expect(child.awakening).toBeUndefined();
    const a=world.agents.find(r=>r.id===child.id);
    if(a)expect(a.awakening).toBeUndefined();
    const archived={...world,
      lineage:world.lineage.map(r=>({...r,awakening:undefined})),
      agents:world.agents.map(r=>({...r,awakening:undefined}))};
    expect(isWorld(archived)).toBe(true);
    const next=stepWorld(archived);
    expect(next.lineage.filter(r=>r.died!==undefined)
      .every(r=>r.awakening===undefined)).toBe(true);
  });

  it('round-trips the milestone and reads older saves without awakening fields',()=>{
    const original=createWorld({seed:21313,size:'small'});
    const awakened=stepWorld(original);
    expect(readSavedWorld(compactWorld(awakened))).toEqual(awakened);
    const old={...original,
      agents:original.agents.map(({awakening:_awakening,...rest})=>rest),
      lineage:original.lineage.map(({awakening:_awakening,...rest})=>rest)};
    expect(isWorld(old)).toBe(true);
    expect(readSavedWorld(JSON.stringify(old))).toBeTruthy();
  });

  it('rejects corrupt or impossible history, including events in the future',()=>{
    expect(isAwakeningRecord({kind:'natural',age:20,year:1},-20,1)).toBe(true);
    expect(isAwakeningRecord({kind:'natural',age:20,year:5},0,1)).toBe(false);
    expect(isAwakeningRecord({kind:'legendary',age:20,year:1},0,1)).toBe(false);
    expect(isAwakeningRecord({kind:'natural',age:0,year:1},0,1)).toBe(false);
    expect(isAwakeningRecord({kind:'natural',age:20,year:-1},-20,1)).toBe(false);
    const world=createWorld({seed:21313,size:'small'});
    expect(isWorld({...world,agents:[{...world.agents[0],
      awakening:{kind:'natural',age:17,year:world.year+1}},
      ...world.agents.slice(1)]})).toBe(false);
    expect(isWorld({...world,lineage:[{...world.lineage[0],
      awakening:{kind:'natural',age:0,year:0}},
      ...world.lineage.slice(1)]})).toBe(false);
  });

  it('remembers the awakening if a person dies and is brought back',()=>{
    const once=stepWorld(createWorld({seed:21313,size:'small'}));
    const subject=once.agents.find(a=>a.awakening)!;
    expect(subject).toBeDefined();
    const afterDeath={...once,agents:once.agents.filter(a=>a.id!==subject.id),
      lineage:once.lineage.map(r=>r.id===subject.id?{...r,died:once.year}:r)};
    const returned=intervene(afterDeath,{kind:'resurrect',personId:subject.id});
    expect(returned.agents.find(a=>a.id===subject.id)?.awakening)
      .toEqual(subject.awakening);
    expect(returned.lineage.find(r=>r.id===subject.id)?.awakening)
      .toEqual(subject.awakening);
    expect(isWorld(returned)).toBe(true);
  });

  it('makes a timeline, roster filters and subtle portrait cue visible',()=>{
    const world=stepWorld(createWorld({seed:21313,size:'small'}));
    const person=world.agents.find(a=>a.awakening)!;
    expect(person).toBeDefined();
    const awake=renderToStaticMarkup(createElement(RankProfile,{
      seed:world.settings.seed,person}));
    expect(awake).toContain('NATURALLY AWAKENED');
    expect(awake).toContain('evo-awakening-timeline');
    expect(awake).toContain('AGE '+person.awakening!.age);
    const dormant=renderToStaticMarkup(createElement(RankProfile,{
      seed:world.settings.seed,person:{...person,awakening:undefined}}));
    expect(dormant).toContain('NATURAL AWAKENING NOT GUARANTEED');
    expect(dormant).not.toContain('AGE '+person.awakening!.age+' · YEAR');
    const portrait=renderToStaticMarkup(createElement(PixelPortrait,{
      person,name:'Sample Person'}));
    expect(portrait).toContain('is-awakened');
    expect(portrait).toContain('awakened innate gift');
    const directory=renderToStaticMarkup(createElement(PeopleDirectory,{
      world,selectedId:person.id,onOpen:()=>{},onFavorite:()=>{},
      onRename:()=>{},onFindOnMap:()=>{},
    }));
    expect(directory).toContain('evo-people-awakening');
    expect(directory).toContain('evo-people-sort');
    expect(directory).toContain('awakened lives');
    expect(directory).toContain('AWAKENED · Y');
  });
});
