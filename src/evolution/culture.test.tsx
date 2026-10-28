import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,isWorld,stepWorld,advanceWorld,type World,type Settlement} from './engine';
import {advanceCulture,governmentOf,faithOf,validCulture} from './culture';
import {createEconomy} from './economy';
import {CultureCodex} from './CultureCodex';
import {compactWorld,readSavedWorld} from './storage';

function townWorld(){
  const w=createWorld({seed:517,size:'small',
    starting:{human:10,elf:4,dwarf:0,demon:0}});
  const humans=w.agents.filter(a=>a.species==='human');
  for(const [i,a] of humans.entries()){
    a.x=20+i%4;a.y=20+Math.floor(i/4);a.age=30;a.energy=95;a.health=98;
    a.development!.values.community=70;
    a.development!.values.tradition=67;
    a.development!.values.discovery=66;
    a.development!.values.independence=38;
    a.development!.memories.push({year:0,kind:'discovery',detail:'Learned a lesson.'});
  }
  for(let y=18;y<=24;y++)for(let x=17;x<=24;x++)
    w.tiles[y*w.width+x]={biome:'plains',food:7};
  const s:Settlement={id:w.nextSettlementId++,x:21,y:21,name:'New Concord',
    species:'human',population:10,stores:40,founded:0,emptyYears:0,
    economy:createEconomy()};
  w.settlements.push(s);
  w.year=16;w.history.at(-1)!.year=16;
  return {w,humans,s};
}

describe('WorldForge v1.5: emergent religions and civic choice',()=>{
  it('does not assign faith or government to any species at world creation',()=>{
    const w=createWorld({seed:45,size:'small'});
    expect(w.agents.every(a=>a.belief===undefined)).toBe(true);
    expect(w.culture).toEqual({faiths:[],nextFaithId:1,governments:[],history:[]});
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
  });
  it('accepts v1.4 worlds without cultural data and begins tracking from then on',()=>{
    const newWorld=createWorld({seed:67,size:'small'});
    const {culture:_,...legacy}=newWorld;
    expect(isWorld(legacy)).toBe(true);
    expect(readSavedWorld(JSON.stringify(legacy))).toEqual(legacy);
    const upgraded=stepWorld(legacy);
    expect(upgraded.culture).toBeDefined();
    expect(isWorld(upgraded)).toBe(true);
  });
  it('lets an individual create a belief from life experience without forcing followers',()=>{
    const {w,humans}=townWorld();
    advanceCulture(w,()=>0);
    expect(w.culture!.faiths.length).toBe(1);
    const founder=w.culture!.faiths[0];
    expect(founder.founded).toBe(w.year);
    expect(founder.founderId).toBeGreaterThan(0);
    expect(humans.some(a=>a.belief?.faithId===founder.id)).toBe(true);
    expect(humans.some(a=>!a.belief)).toBe(true);
    expect(w.lineage.find(r=>r.id===founder.founderId)?.moments?.some(m=>
      m.text.includes('Founded'))).toBe(true);
    expect(validCulture(w)).toBe(true);
  });
  it('permits cross-species conversation, adoption, and genuine dissent',()=>{
    const {w,humans}=townWorld();
    const teacher=humans[0],learner=humans[1],independent=humans[2];
    w.culture!.faiths=[{id:1,name:'Circle of Many Voices',theme:'harmony',
      tenet:'community',tolerance:92,founderId:teacher.id,founded:10}];
    w.culture!.nextFaithId=2;
    teacher.belief={faithId:1,since:10,conviction:95};
    // Personal contact is considered only on an agent's own reflection year.
    w.year=(3-learner.id%3)%3+18;
    w.history.at(-1)!.year=w.year;
    independent.development!.values.independence=100;
    advanceCulture(w,()=>0);
    expect(faithOf(w,learner)?.id).toBe(1);
    const outsider=w.agents.find(a=>a.species==='elf')!;
    outsider.x=teacher.x;outsider.y=teacher.y;outsider.age=60;
    outsider.development!.languages.human=50;
    outsider.development!.values.community=80;
    outsider.development!.values.independence=20;
    w.year+=3;w.history.at(-1)!.year=w.year;
    advanceCulture(w,()=>0);
    expect(outsider.belief?.faithId).toBe(1);
    // Resistance is a personal outcome, even after contact with believers.
    independent.belief=undefined;
    w.year+=3;w.history.at(-1)!.year=w.year;
    advanceCulture(w,()=>.99);
    expect(independent.belief).toBeUndefined();
    expect(validCulture(w)).toBe(true);
  });
  it('elects local leadership and lets policies spend real resources',()=>{
    const {w,s,humans}=townWorld();
    advanceCulture(w,()=>.99);
    const g=governmentOf(w,s.id)!;
    expect(g).toBeDefined();
    expect(['assembly','council','elders','chiefdom']).toContain(g.kind);
    expect(humans.some(a=>a.id===g.leaderId)).toBe(true);
    expect(g.turnout).toBeGreaterThanOrEqual(4);
    const before=s.economy!.coins;
    g.policy='learning';g.elected=w.year;
    const knowledgeBefore=humans.map(a=>a.development!.skills.knowledge);
    w.year++;w.history.at(-1)!.year=w.year;
    advanceCulture(w,()=>.99);
    expect(s.economy!.coins).toBeLessThan(before);
    expect(humans.some((a,i)=>a.development!.skills.knowledge>knowledgeBefore[i]))
      .toBe(true);
    expect(validCulture(w)).toBe(true);
  });
  it('persists cultural history through save and reproduction, and keeps past immutable',()=>{
    const {w}=townWorld();advanceCulture(w,()=>0);
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const prior=structuredClone(w);
    const next=stepWorld(w);
    expect(w).toEqual(prior);
    expect(next.culture?.history.length).toBeGreaterThan(0);
    expect(isWorld(next)).toBe(true);
    const html=renderToStaticMarkup(<CultureCodex world={next}
      onFindSettlement={()=>{}} onOpenPerson={()=>{}}/>);
    expect(html).toContain('BELIEFS &amp; GOVERNMENT');
    expect(html).toContain('NEW CONCORD');
  });
  it('evolves societies across multiple generations without a species religion template',()=>{
    const w=advanceWorld(createWorld({seed:119,size:'small'}),45);
    expect(isWorld(w)).toBe(true);
    expect(w.culture?.governments.length).toBeGreaterThan(0);
    expect(w.culture?.history.some(m=>m.kind==='election')).toBe(true);
    expect(w.agents.some(a=>a.belief===undefined)).toBe(true);
  },40000);
});
