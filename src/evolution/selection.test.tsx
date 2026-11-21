import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorld,createWorld,isWorld,stepWorld,type Genes,type World} from './engine';
import {EvolutionView} from './EvolutionView';
import {WorldforgeApp} from './WorldforgeApp';
import {compactWorld,readSavedWorld} from './storage';
import {
  EVOLUTION_SAMPLE_CAP,SURVIVAL_TRAITS,advanceEvolution,evolutionShiftMessage,
  findShifts,founderSurvivalGenes,inheritSurvivalGenes,mortalWoundIsFatal,
  partnerLean,projectTraitDrift,reproductiveEdge,sampleHerdTraits,
  survivalHealthDelta,type EvolutionSample,type LocalStress,type TraitMeans,
} from './selection';

const calm:LocalStress={cold:0,heat:0,famine:0,sick:false,wounded:false,hurt:0};
const cold:LocalStress={...calm,cold:.9};
const ordinary:Genes={vigor:1,curiosity:1,fertility:1,social:1};

function row(trait:Partial<TraitMeans> & {count?:number}={}):TraitMeans{
  return {count:20,vigor:1,curiosity:1,fertility:1,social:1,
    cold:1,heat:1,scarcity:1,immunity:1,mending:1,...trait};
}
function sample(year:number,dwarfCold:number,count=20):EvolutionSample{
  return {year,species:{
    human:row({count:0}),elf:row({count:0}),
    dwarf:row({cold:dwarfCold,count}),demon:row({count:0}),
  }};
}
function classicGenes(genes:Genes):Genes{
  return {vigor:genes.vigor,curiosity:genes.curiosity,
    fertility:genes.fertility,social:genes.social};
}

describe('natural selection on people',()=>{
  it('gives cold places a modest edge to cold-tolerant parents',()=>{
    const hardy={...ordinary,cold:1.3};
    const frail={...ordinary,cold:.7};
    expect(reproductiveEdge(hardy,hardy,calm)).toBe(0);
    expect(survivalHealthDelta(ordinary,calm)).toBe(0);
    expect(partnerLean(hardy,calm)).toBe(0);
    expect(reproductiveEdge(hardy,hardy,cold)).toBeGreaterThan(0);
    expect(reproductiveEdge(frail,frail,cold)).toBeLessThan(0);
    expect(survivalHealthDelta(hardy,cold)).toBeGreaterThan(survivalHealthDelta(frail,cold));
    expect(partnerLean(hardy,cold)).toBeGreaterThan(partnerLean(frail,cold));
    expect(survivalHealthDelta(hardy,cold)).toBeLessThanOrEqual(1.5);
    expect(survivalHealthDelta(frail,cold)).toBeGreaterThanOrEqual(-1.5);
  });

  it('mutates inherited survival traits a little, without a world-RNG draw',()=>{
    const parent={...ordinary,...founderSurvivalGenes(4,2)};
    let different=0,sum=0;
    for(let id=1;id<=48;id++){
      const child=inheritSurvivalGenes(8,id,parent,parent);
      sum+=child.cold;
      if(child.cold!==parent.cold)different++;
      for(const trait of SURVIVAL_TRAITS){
        expect(child[trait]).toBeGreaterThanOrEqual(.65);
        expect(child[trait]).toBeLessThanOrEqual(1.4);
      }
      expect(inheritSurvivalGenes(8,id,parent,parent)).toEqual(child);
    }
    expect(different).toBeGreaterThan(0);
    expect(Math.abs(sum/48-parent.cold)).toBeLessThan(.02);
  });

  it('drifts a cold-biased line toward cold tolerance and leaves heat behind',()=>{
    const selected=projectTraitDrift(11,36,cold,'cold',80);
    const heat=projectTraitDrift(11,36,cold,'heat',80);
    const still=projectTraitDrift(11,30,calm,'cold',80);
    expect(selected.end).toBeGreaterThan(selected.start+.04);
    expect(selected.end-selected.start).toBeGreaterThan(heat.end-heat.start+.03);
    expect(Math.abs(still.end-still.start)).toBeLessThan(.05);
    expect(projectTraitDrift(11,36,cold,'cold',80)).toEqual(selected);
  });

  it('keeps ordinary wounds fatal and lets only a hardy few survive',()=>{
    expect(mortalWoundIsFatal(1,1,1,undefined)).toBe(true);
    expect(mortalWoundIsFatal(1,1,1,1)).toBe(true);
    expect(mortalWoundIsFatal(1,1,1,1.18)).toBe(true);
    const lived=[...Array(40)].some((_,id)=>!mortalWoundIsFatal(9,id+1,3,1.4));
    expect(lived).toBe(true);
  });

  it('names a cold-north shift and can chart herd traits later',()=>{
    expect(evolutionShiftMessage('dwarf','cold','cold'))
      .toBe('Dwarves of the cold north grew hardier.');
    const shifts=findShifts(
      [sample(0,1),sample(30,1.06)],
      {human:'wide',elf:'wide',dwarf:'cold',demon:'wide'},[]);
    expect(shifts.map(shift=>shift.message)).toContain(
      'Dwarves of the cold north grew hardier.');
    expect(sampleHerdTraits(4,[
      {kind:'grazer',traits:{hardiness:1.1,bulk:.9}},
      {kind:'grazer',traits:{hardiness:1.3}},
      {kind:'fish',genes:{schooling:.5}},
    ])).toEqual([
      {year:4,kind:'fish',trait:'schooling',mean:.5},
      {year:4,kind:'grazer',trait:'bulk',mean:.9},
      {year:4,kind:'grazer',trait:'hardiness',mean:1.2},
    ]);
    expect(sampleHerdTraits(1,[{kind:'grazer'}])).toEqual([]);
  });

  it('records a capped yearly history and keeps older saves readable',()=>{
    const world=advanceWorld(createWorld({seed:501,size:'small'}),4);
    expect(world.evolution?.samples.map(item=>item.year)).toEqual([0,1,2,3,4]);
    expect(world.agents.every(agent=>agent.genes.cold!==undefined)).toBe(true);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
    expect(isWorld(world)).toBe(true);
    const again=advanceWorld(createWorld({seed:501,size:'small'}),4);
    expect(again.evolution).toEqual(world.evolution);
    expect(again.rngState).toBe(world.rngState);

    const modern=createWorld({seed:9,size:'small'});
    const stripped:World={
      ...modern,evolution:undefined,
      agents:modern.agents.map(agent=>({...agent,genes:classicGenes(agent.genes)})),
      lineage:modern.lineage.map(record=>({...record,genes:classicGenes(record.genes)})),
    };
    expect(isWorld(stripped)).toBe(true);
    expect(readSavedWorld(JSON.stringify(stripped))).toEqual(stripped);
    const prior=structuredClone(stripped);
    const next=stepWorld(stripped);
    expect(stripped).toEqual(prior);
    expect(next.evolution?.samples.map(item=>item.year)).toEqual([1]);
    expect(isWorld(next)).toBe(true);
    expect(readSavedWorld(compactWorld(next))).toEqual(next);

    const logged:World={...modern,events:[...modern.events,{
      id:900,year:0,type:'evolution',
      message:'Dwarves of the cold north grew hardier.',
    }]};
    expect(isWorld(logged)).toBe(true);
    expect(isWorld({...modern,agents:modern.agents.map((agent,index)=>index===0?
      {...agent,genes:{...agent.genes,cold:9}}:agent)})).toBe(false);
    expect(isWorld({...modern,evolution:{samples:[],shifts:[]}})).toBe(false);

    const capped=createWorld({seed:3,size:'small',starting:{
      human:1,elf:0,dwarf:0,demon:0}});
    const blank=capped.evolution!.samples[0].species;
    capped.year=130;
    capped.evolution={samples:Array.from({length:130},(_,year)=>({year,species:blank})),
      shifts:[]};
    advanceEvolution(capped);
    expect(capped.evolution?.samples).toHaveLength(EVOLUTION_SAMPLE_CAP);
    expect(capped.evolution?.samples[0].year).toBe(11);
    expect(capped.evolution?.samples.at(-1)?.year).toBe(130);
  });

  it('renders the evolution view, notable shifts, and the herd hook',()=>{
    const world=createWorld({seed:4,size:'small'});
    world.evolution!.shifts.push({
      year:0,species:'dwarf',trait:'cold',band:'cold',before:1,after:1.04,
      message:'Dwarves of the cold north grew hardier.',
    });
    const html=renderToStaticMarkup(<EvolutionView world={world}/>);
    expect(html).toContain('Evolution of the peoples');
    expect(html).toContain('Cold tolerance');
    expect(html).toContain('Dwarves of the cold north grew hardier.');
    expect(html).toContain('HERD TRAITS');
    expect(html).toContain('do not carry heritable traits yet');
    expect(html).toContain('Toggle species on the graph');
    const withHerds:World={...world,evolution:{
      ...world.evolution!,
      herds:[{year:0,kind:'grazer',trait:'hardiness',mean:1.05}],
    }};
    const herdHtml=renderToStaticMarkup(<EvolutionView world={withHerds}/>);
    expect(herdHtml).toContain('grazer · hardiness');
    const nav=renderToStaticMarkup(<WorldforgeApp/>);
    expect(nav).toContain('EVOLUTION');
  });
});
