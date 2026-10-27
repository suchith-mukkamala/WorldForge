import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  BIOME_INFO,DEATH_CAUSES,SPECIES,SPECIES_INFO,advanceWorld,
  createWorld,editWorld,isWorld,stepWorld,type World,
} from './engine';
import {traitProfile} from './family';
import {PopulationDiagnostics} from './PopulationDiagnostics';
import {EvolutionHistory} from './EvolutionHistory';
import {readSavedWorld,compactWorld} from './storage';

describe('Evolution Lab v0.2.1: honest population diagnostics',()=>{
  it('starts new worlds with zeroed mortality records and empty yearly vitals',()=>{
    const world=createWorld({seed:9021,size:'small'});
    expect(world.demography?.sinceYear).toBe(0);
    for(const s of SPECIES){
      expect(world.demography?.bySpecies[s]).toEqual({
        births:0,deaths:0,juvenileDeaths:0,ageAtDeathSum:0,
        causes:{old_age:0,starvation:0,exposure:0,ill_health:0},
      });
    }
    expect(world.history[0].vitals).toBeUndefined();
    expect(isWorld(world)).toBe(true);
  });

  it('classifies old age, hunger and terrain stress rather than inventing diagnoses',()=>{
    const starting=createWorld({seed:4343,size:'small'});
    const subject=starting.agents.find(a=>a.species==='human')!;
    const ageCase:World={...starting,
      agents:starting.agents.map(a=>a.id===subject.id?{
        ...a,age:Math.ceil(traitProfile(a.ancestry).lifespan*2),
      }:a)};
    const afterAge=stepWorld(ageCase);
    expect(afterAge.demography?.bySpecies.human.causes.old_age).toBeGreaterThan(0);
    expect(afterAge.history.at(-1)?.vitals?.causes.old_age).toBeGreaterThan(0);
    const hungerCase:World={...starting,
      agents:starting.agents.map(a=>a.id===subject.id?{
        ...a,energy:0,health:1,
      }:a)};
    const afterHunger=stepWorld(hungerCase);
    expect(afterHunger.demography?.bySpecies.human.causes.starvation).toBeGreaterThan(0);
    const log=afterHunger.events.filter(e=>e.type==='death').at(-1)?.message;
    expect(log).toContain('starvation');
  });

  it('records true ages and childhood losses with species-specific maturity',()=>{
    const w=createWorld({seed:84,size:'small'});
    const young=w.agents.find(a=>a.species==='elf'&&a.age<SPECIES_INFO.elf.maturity)!;
    const doomed:World={...w,agents:w.agents.map(a=>a.id===young.id?{
      ...a,age:2,energy:0,health:1,
    }:a)};
    const next=stepWorld(doomed);
    const elf=next.demography?.bySpecies.elf;
    expect(elf?.juvenileDeaths).toBeGreaterThan(0);
    expect(next.history.at(-1)?.vitals?.juvenileDeaths.elf).toBeGreaterThan(0);
    expect(elf?.ageAtDeathSum).toBeGreaterThanOrEqual(3);
  });

  it('preserves cause totals and species vital consistency over multiple generations',()=>{
    const w=advanceWorld(createWorld({seed:72,size:'small',resourceLevel:1.3}),90);
    expect(isWorld(w)).toBe(true);
    const dem=w.demography!;
    let births=0,deaths=0;
    for(const s of SPECIES){
      const r=dem.bySpecies[s];
      expect(DEATH_CAUSES.reduce((n,c)=>n+r.causes[c],0)).toBe(r.deaths);
      expect(r.juvenileDeaths).toBeLessThanOrEqual(r.deaths);
      births+=r.births;deaths+=r.deaths;
    }
    expect(births).toBe(w.totalBirths);
    expect(deaths).toBe(w.totalDeaths);
    expect(w.agents.length).toBe(
      Object.values(w.settings.starting).reduce((a,b)=>a+b,0)+births-deaths);
    expect(w.history.at(-1)?.vitals).toBeDefined();
    const saved=readSavedWorld(compactWorld(w));
    expect(saved).toEqual(w);
  });

  it('starts diagnostics at first post-upgrade tick without fabricating legacy causes',()=>{
    const previous=advanceWorld(createWorld({seed:78,size:'small'}),5);
    const old:World={...previous,demography:undefined,
      history:previous.history.map(({vitals:_,...sample})=>sample)};
    expect(isWorld(old)).toBe(true);
    expect(readSavedWorld(JSON.stringify(old))).toEqual(old);
    const next=stepWorld(old);
    expect(next.demography?.sinceYear).toBe(5);
    expect(next.history[0].vitals).toBeUndefined();
    expect(next.history.at(-1)?.vitals).toBeDefined();
    expect(isWorld(next)).toBe(true);
  });

  it('does not erase birth and death observations when painting or spawning',()=>{
    const w=advanceWorld(createWorld({seed:95,size:'small'}),22);
    const last=w.history.at(-1)!;
    const position=w.tiles.findIndex((t,i)=>t.biome==='plains'&&
      !w.agents.some(a=>a.y*w.width+a.x===i));
    const edited=editWorld(w,position%w.width,Math.floor(position/w.width),
      {kind:'food'});
    expect(edited.history.at(-1)?.births).toBe(last.births);
    expect(edited.history.at(-1)?.deaths).toBe(last.deaths);
    expect(edited.history.at(-1)?.vitals).toEqual(last.vitals);
    expect(isWorld(edited)).toBe(true);
  });

  it('renders real demographic data and the tracking boundary in World History',()=>{
    const w=advanceWorld(createWorld({seed:504,size:'small'}),5);
    const html=renderToStaticMarkup(<EvolutionHistory world={w}/>);
    expect(html).toContain('POPULATION HEALTH');
    expect(html).toContain('SPECIES VITALS');
    expect(html).toContain('RECORDED CAUSES OF DEATH');
    expect(html).toContain('TRACKED SINCE Y0');
    expect(html).toContain('Childhood deaths recorded');
    expect(html).toContain('Starvation');
    const bare=renderToStaticMarkup(<PopulationDiagnostics
      world={{...w,demography:undefined}}/>);
    expect(bare).toContain('STARTS AFTER FIRST TICK');
  });

  it('keeps food bounded and leaves genuine scarcity possible',()=>{
    const w=advanceWorld(createWorld({seed:85,size:'small',
      resourceLevel:.5,starting:{human:65,elf:65,dwarf:65,demon:65}}),50);
    expect(isWorld(w)).toBe(true);
    for(const tile of w.tiles){
      expect(tile.food).toBeGreaterThanOrEqual(0);
      expect(tile.food).toBeLessThanOrEqual(
        Math.round(BIOME_INFO[tile.biome].food*.5*100)/100+.01);
    }
  });
});

describe('Ecological survival smoke tests across seeded worlds',()=>{
  it('supports multiple generations and long-lived populations under normal resources',async()=>{
    const seeds=[31,721,2027];
    const worlds=[];
    for(const seed of seeds){
      let world=createWorld({seed,size:'small',resourceLevel:1.15});
      for(let year=0;year<160;year+=10){
        world=advanceWorld(world,10);
        // Allow the test runner to process heartbeat messages on long runs.
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      worlds.push(world);
    }
    // The world is stochastic and ecological. We reject systematic collapse,
    // not every possible extinction: unlucky populations may still vanish.
    const surviving=worlds.filter(w=>w.agents.length>=12);
    expect(surviving.length).toBeGreaterThanOrEqual(3);
    const producing=worlds.filter(w=>w.totalBirths>=20);
    expect(producing.length).toBeGreaterThanOrEqual(3);
    for(const species of ['human','dwarf','demon'] as const){
      const counts=worlds.map(w=>w.agents.filter(a=>a.species===species).length);
      const alive=counts.filter(n=>n>=3).length;
      expect(alive,species+' populations after 180 years: '+counts.join(', '))
        .toBeGreaterThanOrEqual(3);
    }
    for(const world of worlds){
      expect(world.agents.length).toBeLessThanOrEqual(world.tiles.length);
      expect(isWorld(world)).toBe(true);
      expect(world.history.at(-1)?.total).toBe(world.agents.length);
    }
  },150000);
});
