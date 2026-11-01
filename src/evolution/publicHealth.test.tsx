import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {advanceWorld,createWorld,isWorld,stepWorld,type World} from './engine';
import {createEconomy} from './economy';
import {PopulationDiagnostics} from './PopulationDiagnostics';
import {advancePublicHealth,isDiseaseRecord,isPublicHealthState,
  settlementSanitation} from './publicHealth';
import {compactWorld,readSavedWorld} from './storage';

function crowdedTown(){
  const w=createWorld({seed:24313,size:'small'});
  const source=w.agents.find(a=>a.x>=5&&a.y>=5&&a.x<w.width-5&&
    a.y<w.height-5)!;
  const s={id:1,name:'Oldbridge',species:source.species,
    x:source.x,y:source.y,population:600,founded:0,stores:25,emptyYears:0,
    economy:createEconomy()};
  s.economy.coins=30;s.economy.tools=3;
  w.settlements=[s];w.year=1;
  w.agents=Array.from({length:600},(_,i)=>({...source,
    id:1000+i,x:s.x+i%5-2,y:s.y+Math.floor(i/5)%5-2,
    energy:90,health:95,
    disease:i<40?{kind:'ash_cough' as const,stage:'sick' as const,
      since:0}:i===40?{kind:'red_pox' as const,stage:'immune' as const,
        since:0,immuneUntil:12}:undefined}));
  return w;
}

describe('v2.4.3 — real plagues and local public health',()=>{
  it('spreads through bounded contacts, funds care and keeps replay exact',()=>{
    const w=crowdedTown(),copy=structuredClone(w),initialRng=w.rngState;
    const stories=advancePublicHealth(w),again=advancePublicHealth(copy);
    expect(stories).toEqual(again);
    expect(w.agents).toEqual(copy.agents);
    expect(w.publicHealth).toEqual(copy.publicHealth);
    expect(w.rngState).toBe(initialRng);
    expect(w.publicHealth?.newCases).toBeGreaterThan(0);
    expect(w.publicHealth?.active).toBeGreaterThan(40);
    expect(w.publicHealth?.responses).toBe(1);
    expect(w.settlements[0].economy?.coins).toBe(27);
    expect(w.settlements[0].economy?.tools).toBe(2.5);
    expect(w.agents[40].disease?.stage).toBe('immune');
    expect(isPublicHealthState(w.publicHealth,w.year,w.agents.length)).toBe(true);
  });

  it('makes wells, communal care and practiced medicine help towns',()=>{
    const w=crowdedTown(),s=w.settlements[0];
    const residents=w.agents.slice(0,40);
    const initial=settlementSanitation(s,residents);
    s.infrastructure={land:[],roads:[],nextBuildingId:3,
      foundedWithResidents:3,stock:{wood:0,stone:0,clay:0},buildings:[
        {id:1,type:'well',culture:s.species,x:s.x,y:s.y,stage:'complete',
          progress:100,condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0},
        {id:2,type:'communal',culture:s.species,x:s.x,y:s.y,stage:'complete',
          progress:100,condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0},
      ]};
    expect(settlementSanitation(s,residents)).toBeGreaterThan(initial);
  });

  it('records disease deaths as real mortality rather than an automatic cull',()=>{
    const w=createWorld({seed:24314,size:'small'});
    const victim=w.agents.find(a=>a.species==='human')!;
    const doomed:World={...w,agents:w.agents.map(a=>a.id===victim.id?{
      ...a,health:1,energy:98,
      disease:{kind:'red_pox',stage:'sick',since:0},
    }:a)};
    const next=stepWorld(doomed);
    expect(next.demography!.bySpecies.human.causes.plague).toBeGreaterThan(0);
    expect(next.history.at(-1)?.vitals?.causes.plague).toBeGreaterThan(0);
    expect(next.publicHealth!.deaths).toBeGreaterThan(0);
    expect(next.publicHealth!.cumulativeDeaths).toBeGreaterThan(0);
    expect(isWorld(next)).toBe(true);
    expect(readSavedWorld(compactWorld(next))).toEqual(next);
    const ui=renderToStaticMarkup(createElement(PopulationDiagnostics,{world:next}));
    expect(ui).toContain('PLAGUES');
    expect(ui).toContain('Infectious disease');
  });

  it('recovers with finite immunity and validates corrupted illness records',()=>{
    const w=crowdedTown();w.year=4;
    const patient=w.agents[0];
    patient.disease={kind:'ash_cough',stage:'sick',since:0};
    advancePublicHealth(w);
    expect(patient.disease?.stage).toBe('immune');
    expect(patient.disease?.immuneUntil).toBe(10);
    expect(w.publicHealth?.recovered).toBeGreaterThan(0);
    expect(isDiseaseRecord(patient.disease,w.year)).toBe(true);
    expect(isDiseaseRecord({...patient.disease,kind:'unknown'},w.year)).toBe(false);
    expect(isDiseaseRecord({...patient.disease,immuneUntil:99999},w.year)).toBe(false);
  });

  it('handles thousands without a global population trigger or encounter explosion',()=>{
    const local=crowdedTown(),populated=structuredClone(local);
    const town=local.settlements[0];
    const farX=town.x<local.width/2?local.width-2:1;
    const farY=town.y<local.height/2?local.height-2:1;
    populated.agents.push(...Array.from({length:3000},(_,i)=>({
      ...populated.agents[100],id:9000+i,x:farX,y:farY,disease:undefined,
    })));
    advancePublicHealth(local);advancePublicHealth(populated);
    expect(populated.agents).toHaveLength(3600);
    expect(populated.publicHealth?.newCases).toBe(local.publicHealth?.newCases);
    expect(populated.agents.slice(0,600).map(a=>a.disease)).toEqual(
      local.agents.map(a=>a.disease));
  });

  it('accepts older saved mortality ledgers and starts recording plagues safely',()=>{
    const w=advanceWorld(createWorld({seed:24315,size:'small'}),2);
    const legacy=structuredClone(w);
    for(const record of Object.values(legacy.demography!.bySpecies))
      delete (record.causes as Partial<typeof record.causes>).plague;
    for(const year of legacy.history)if(year.vitals)
      delete (year.vitals.causes as Partial<typeof year.vitals.causes>).plague;
    delete legacy.publicHealth;
    expect(isWorld(legacy)).toBe(true);
    const restored=readSavedWorld(compactWorld(legacy));
    expect(restored).not.toBeNull();
    const next=stepWorld(restored!);
    expect(next.demography?.bySpecies.human.causes.plague).toBe(0);
    expect(next.publicHealth).toBeDefined();
    expect(isWorld(next)).toBe(true);
  });
});
