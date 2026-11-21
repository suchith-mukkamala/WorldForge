/** Natural selection on people.
 *
 * Survival traits are inherited with a small mutation taken from a seeded
 * hash, the same idea as temperament. That hash is not the world RNG, so
 * birth, movement and aging keep their existing rolls. The four original
 * genes already mutate inside inheritedGenes through that world RNG.
 *
 * Effects stay small. A harsh year nudges health by at most a point and a
 * half, and birth odds by at most four percent. Populations should drift,
 * not crash. Missing traits count as 1, the ordinary value, so older saves
 * stay valid without rewritten genes.
 */
import {climateField} from './climate';
import type {Agent,Genes,Species,World} from './engine';
import {SPECIES,SPECIES_INFO} from './engine';

export const SURVIVAL_TRAITS=['cold','heat','scarcity','immunity','mending'] as const;
export type SurvivalTrait=typeof SURVIVAL_TRAITS[number];
export type SurvivalGenes=Record<SurvivalTrait,number>;
export const GENE_TRAITS=['vigor','curiosity','fertility','social'] as const;
export type GeneTrait=typeof GENE_TRAITS[number];
export const EVOLUTION_TRAITS=[...GENE_TRAITS,...SURVIVAL_TRAITS] as const;
export type EvolutionTrait=typeof EVOLUTION_TRAITS[number];
export const CLIMATE_BANDS=['cold','mild','hot','wide'] as const;
export type ClimateBand=typeof CLIMATE_BANDS[number];

export const EVOLUTION_SAMPLE_CAP=120;
export const EVOLUTION_SHIFT_CAP=32;
export const HERD_TRAIT_CAP=180;
const SHIFT_MIN_YEARS=28;
const SHIFT_MIN_COUNT=12;
const SHIFT_DELTA=0.025;
const SHIFT_COOLDOWN=28;
const MAX_SHIFTS_PER_YEAR=2;

export const TRAIT_LABELS:Record<EvolutionTrait,string>={
  vigor:'Vigor',curiosity:'Curiosity',fertility:'Fertility',social:'Sociability',
  cold:'Cold tolerance',heat:'Heat tolerance',scarcity:'Famine endurance',
  immunity:'Disease resistance',mending:'Wound mending',
};

export type LocalStress={
  cold:number;heat:number;famine:number;
  sick:boolean;wounded:boolean;hurt:number;
};
export type TraitMeans=Record<EvolutionTrait,number>&{count:number};
export type EvolutionSample={year:number;species:Record<Species,TraitMeans>};
export type EvolutionShift={
  year:number;species:Species;trait:EvolutionTrait;
  band:ClimateBand;before:number;after:number;message:string;
};
/** Yearly mean of one heritable herd trait.
 * People selection never invents these. A herd with `traits` or `genes`
 * (a flat map of trait name to number) is averaged by kind into this list.
 */
export type HerdTraitSample={year:number;kind:string;trait:string;mean:number};
export type HerdTraitCarrier={
  kind:string;
  traits?:Readonly<Record<string,number>>;
  genes?:Readonly<Record<string,number>>;
};
export type EvolutionState={
  samples:EvolutionSample[];
  shifts:EvolutionShift[];
  herds?:HerdTraitSample[];
};

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const round2=(n:number)=>Math.round(n*100)/100;
const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
const SALTS:Record<SurvivalTrait,number>={
  cold:0x51ed2c1b,heat:0x27d4eb2d,scarcity:0x165667b1,
  immunity:0x85ebca6b,mending:0x6c62272e,
};
/** Cold and hot are the tails of climate.ts temperature, which runs from 0 to 1. */
export function climateBandOf(temperature:number):'cold'|'mild'|'hot'{
  if(temperature<0.40)return 'cold';
  if(temperature>0.62)return 'hot';
  return 'mild';
}
const neutralMeans=():TraitMeans=>({
  count:0,vigor:1,curiosity:1,fertility:1,social:1,
  cold:1,heat:1,scarcity:1,immunity:1,mending:1,
});

function locus(seed:number,id:number,trait:SurvivalTrait,extra:number):number{
  return mix(seed^Math.imul(id+1,SALTS[trait])^extra)/4294967296;
}

/** Founders vary around the ordinary value. No world-RNG draw. */
export function founderSurvivalGenes(seed:number,id:number):SurvivalGenes{
  const genes={} as SurvivalGenes;
  for(const trait of SURVIVAL_TRAITS){
    genes[trait]=round2(0.82+locus(seed,id,trait,0x9e3779b1)*0.36);
  }
  return genes;
}

/** Midparent value plus a small unbiased mutation. Does not call the world RNG. */
export function inheritSurvivalGenes(seed:number,childId:number,
  mother:Genes,father:Genes):SurvivalGenes{
  const genes={} as SurvivalGenes;
  for(const trait of SURVIVAL_TRAITS){
    const mid=((mother[trait]??1)+(father[trait]??1))/2;
    const delta=(locus(seed,childId,trait,0xa5a55a5a)-.5)*0.06;
    genes[trait]=round2(clamp(mid+delta,.65,1.4));
  }
  return genes;
}

/** Local cold, heat, hunger, illness and injury. All inputs are already known. */
export function personStress(
  person:{energy:number;health:number;mortalWound?:boolean;
    disease?:{stage:string}},
  tile:{food:number},
  temperature:number,
):LocalStress{
  const cold=clamp((0.44-temperature)/0.44,0,1);
  const heat=clamp((temperature-0.60)/0.40,0,1);
  const hungry=person.energy<52?clamp((52-person.energy)/52,0,1):0;
  const scarce=tile.food<2.4?clamp((2.4-tile.food)/2.4,0,1):0;
  return {
    cold,heat,famine:clamp(Math.max(hungry,scarce*0.75),0,1),
    sick:person.disease?.stage==='sick',
    wounded:!!person.mortalWound,
    hurt:person.health<82?clamp((82-person.health)/82,0,1):0,
  };
}

/** Health added this year. Zero when the place is mild and the person is well. */
export function survivalHealthDelta(genes:Genes,stress:LocalStress):number{
  const cold=genes.cold??1,heat=genes.heat??1,scarcity=genes.scarcity??1;
  const immunity=genes.immunity??1,mending=genes.mending??1;
  let delta=0;
  delta+=(cold-1)*stress.cold*2.4;
  delta+=(heat-1)*stress.heat*2.4;
  delta+=(scarcity-1)*stress.famine*2.1;
  if(stress.sick)delta+=(immunity-1)*2.4+(genes.vigor-1)*0.45;
  if(stress.wounded||stress.hurt>0)
    delta+=(mending-1)*Math.max(stress.wounded?0.55:0,stress.hurt)*1.3;
  const strain=stress.cold+stress.heat+stress.famine;
  delta+=(genes.vigor-1)*strain*0.55;
  delta+=(genes.curiosity-1)*(stress.famine*0.4-stress.cold*0.3);
  delta+=(genes.social-1)*(stress.famine*0.28-(stress.sick?0.22:0));
  delta+=(1-genes.fertility)*stress.famine*0.12;
  return clamp(round2(delta),-1.5,1.5);
}

export function applySelectionHealth(person:{health:number;genes:Genes},
  stress:LocalStress):void{
  person.health+=survivalHealthDelta(person.genes,stress);
}

/** Multiplier added to an existing birth chance. Zero in an easy year. */
export function reproductiveEdge(mother:Genes,father:Genes,stress:LocalStress):number{
  const mean=(trait:SurvivalTrait)=>((mother[trait]??1)+(father[trait]??1))/2;
  let edge=0;
  edge+=(mean('cold')-1)*stress.cold*0.2;
  edge+=(mean('heat')-1)*stress.heat*0.2;
  edge+=(mean('scarcity')-1)*stress.famine*0.16;
  if(stress.sick)edge+=(mean('immunity')-1)*0.1;
  edge+=((mother.vigor+father.vigor)/2-1)*(stress.cold+stress.heat)*0.05;
  return clamp(round2(edge),-0.04,0.04);
}

export function pairStress(a:LocalStress,b:LocalStress):LocalStress{
  return {
    cold:(a.cold+b.cold)/2,heat:(a.heat+b.heat)/2,famine:(a.famine+b.famine)/2,
    sick:a.sick||b.sick,wounded:a.wounded||b.wounded,
    hurt:Math.max(a.hurt,b.hurt),
  };
}

/** Tie-break for an already acceptable partner. Zero unless the place is harsh. */
export function partnerLean(mate:Genes,stress:LocalStress):number{
  const lean=((mate.cold??1)-1)*stress.cold*0.06+
    ((mate.heat??1)-1)*stress.heat*0.06+
    ((mate.scarcity??1)-1)*stress.famine*0.04;
  return clamp(round2(lean),-0.025,0.025);
}

/** Ordinary constitutions still die of a mortal wound. Only the hardiest,
 * and only sometimes, pull through. The roll is a seeded hash. */
export function mortalWoundIsFatal(seed:number,id:number,year:number,
  mending:number|undefined):boolean{
  const trait=mending??1;
  if(!(trait>1.22))return true;
  const roll=mix(seed^Math.imul(id+1,0x6c62272e)^Math.imul(year+1,0x45d9f3b))/4294967296;
  return roll>=Math.min(0.22,(trait-1.22)*0.7);
}

export function woundSurvivalHealth(mending:number|undefined):number{
  return Math.round(clamp(14+((mending??1)-1)*18,12,28));
}

function averageTraits(people:readonly {genes:Genes}[]):TraitMeans{
  if(!people.length)return neutralMeans();
  const totals:Record<EvolutionTrait,number>={
    vigor:0,curiosity:0,fertility:0,social:0,
    cold:0,heat:0,scarcity:0,immunity:0,mending:0,
  };
  for(const person of people){
    for(const trait of EVOLUTION_TRAITS){
      const value=person.genes[trait];
      totals[trait]+=value===undefined?1:value;
    }
  }
  const means=neutralMeans();
  means.count=people.length;
  for(const trait of EVOLUTION_TRAITS)
    means[trait]=round2(totals[trait]/people.length);
  return means;
}

export function measurePopulation(agents:readonly Pick<Agent,'species'|'genes'>[]):
  Record<Species,TraitMeans>{
  const grouped={human:[],elf:[],dwarf:[],demon:[]} as Record<Species,{genes:Genes}[]>;
  for(const agent of agents)grouped[agent.species].push(agent);
  return {
    human:averageTraits(grouped.human),elf:averageTraits(grouped.elf),
    dwarf:averageTraits(grouped.dwarf),demon:averageTraits(grouped.demon),
  };
}

function numericBag(value:Readonly<Record<string,number>>|undefined):
  Record<string,number>|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const bag:Record<string,number>={};
  let kept=0;
  for(const [trait,amount] of Object.entries(value)){
    if(!trait||trait.length>32||!Number.isFinite(amount)||kept>=8)continue;
    bag[trait]=amount;kept++;
  }
  return kept?bag:undefined;
}

/** Hook for herd genetics. Returns nothing until a herd carries traits or genes. */
export function sampleHerdTraits(year:number,
  herds:readonly HerdTraitCarrier[]|undefined):HerdTraitSample[]{
  const groups=new Map<string,{kind:string;trait:string;sum:number;n:number}>();
  for(const herd of herds??[]){
    if(!herd||typeof herd.kind!=='string'||!herd.kind||herd.kind.length>24)continue;
    const bag=numericBag(herd.traits)??numericBag(herd.genes);
    if(!bag)continue;
    for(const [trait,amount] of Object.entries(bag)){
      const key=herd.kind+'\0'+trait;
      const row=groups.get(key)??{kind:herd.kind,trait,sum:0,n:0};
      row.sum+=amount;row.n++;
      groups.set(key,row);
    }
  }
  return [...groups.values()].map(row=>({
    year,kind:row.kind,trait:row.trait,mean:round2(row.sum/row.n),
  })).sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.trait<b.trait?-1:1);
}

export function evolutionShiftMessage(species:Species,trait:EvolutionTrait,
  band:ClimateBand):string{
  const name=SPECIES_INFO[species].name;
  if((trait==='cold'||trait==='vigor')&&band==='cold')
    return name+' of the cold north grew hardier.';
  if(trait==='heat'&&band==='hot')
    return name+' of the hot lands grew more used to the heat.';
  if(trait==='cold')return name+' grew more tolerant of cold.';
  if(trait==='heat')return name+' grew more tolerant of heat.';
  if(trait==='scarcity')return name+' grew better able to endure lean years.';
  if(trait==='immunity')return name+' grew more resistant to disease.';
  if(trait==='mending')return name+' grew quicker to heal from wounds.';
  if(trait==='vigor')return name+' grew hardier.';
  if(trait==='fertility')return name+' grew more fertile.';
  if(trait==='social')return name+' grew more drawn to one another.';
  return name+' grew more curious.';
}

function speciesClimateBands(world:World):Record<Species,ClimateBand>{
  const field=climateField(world);
  const counts=Object.fromEntries(SPECIES.map(species=>
    [species,{cold:0,mild:0,hot:0}])) as Record<Species,Record<'cold'|'mild'|'hot',number>>;
  for(const agent of world.agents){
    const index=agent.y*world.width+agent.x;
    const band=climateBandOf(field.temperature[index]??0.5);
    counts[agent.species][band]++;
  }
  const bands={} as Record<Species,ClimateBand>;
  for(const species of SPECIES){
    const row=counts[species];
    const total=row.cold+row.mild+row.hot;
    let best:'cold'|'mild'|'hot'='mild',bestCount=-1;
    for(const band of ['cold','mild','hot'] as const){
      if(row[band]>bestCount){best=band;bestCount=row[band];}
    }
    bands[species]=total>=6&&bestCount/total>=0.45?best:'wide';
  }
  return bands;
}

function smoothed(samples:EvolutionSample[],species:Species,trait:EvolutionTrait,
  index:number):{mean:number;count:number}|null{
  let sum=0,weight=0,count=0;
  for(let i=index;i>=Math.max(0,index-2);i--){
    const row=samples[i]?.species[species];
    if(!row||row.count<SHIFT_MIN_COUNT)continue;
    sum+=row[trait]*row.count;weight+=row.count;
    count=Math.max(count,row.count);
  }
  return weight?{mean:sum/weight,count}:null;
}

export function findShifts(samples:EvolutionSample[],
  bands:Record<Species,ClimateBand>,already:readonly EvolutionShift[]):EvolutionShift[]{
  if(samples.length<2)return [];
  const currentYear=samples[samples.length-1].year;
  let pastIndex=-1;
  for(let i=samples.length-2;i>=0;i--){
    const gap=currentYear-samples[i].year;
    if(gap>=SHIFT_MIN_YEARS&&gap<=SHIFT_MIN_YEARS+8){pastIndex=i;break;}
  }
  if(pastIndex<0){
    for(let i=samples.length-2;i>=0;i--){
      if(currentYear-samples[i].year>=SHIFT_MIN_YEARS){pastIndex=i;break;}
    }
  }
  if(pastIndex<0)return [];
  const blocked=new Set(already.filter(shift=>currentYear-shift.year<SHIFT_COOLDOWN)
    .map(shift=>shift.species+':'+shift.trait));
  const found:EvolutionShift[]=[];
  for(const species of SPECIES){
    for(const trait of EVOLUTION_TRAITS){
      if(blocked.has(species+':'+trait))continue;
      const now=smoothed(samples,species,trait,samples.length-1);
      const then=smoothed(samples,species,trait,pastIndex);
      if(!now||!then)continue;
      const delta=now.mean-then.mean;
      if(delta<SHIFT_DELTA)continue;
      const band=bands[species];
      found.push({
        year:currentYear,species,trait,band,
        before:round2(then.mean),after:round2(now.mean),
        message:evolutionShiftMessage(species,trait,band),
      });
    }
  }
  found.sort((a,b)=>(b.after-b.before)-(a.after-a.before)||
    (a.species<b.species?-1:1));
  return found.slice(0,MAX_SHIFTS_PER_YEAR);
}

export function cloneEvolution(state:EvolutionState|undefined):EvolutionState|undefined{
  if(!state)return undefined;
  const species=(row:Record<Species,TraitMeans>)=>({
    human:{...row.human},elf:{...row.elf},dwarf:{...row.dwarf},demon:{...row.demon},
  });
  return {
    samples:state.samples.map(sample=>({year:sample.year,species:species(sample.species)})),
    shifts:state.shifts.map(shift=>({...shift})),
    ...(state.herds?{herds:state.herds.map(row=>({...row}))}:{}),
  };
}

/** Record this year and any notable shift. Returns chronicle lines. */
export function advanceEvolution(world:World):string[]{
  const sample:EvolutionSample={year:world.year,species:measurePopulation(world.agents)};
  const prior=world.evolution;
  const samples=[...(prior?.samples??[]),sample].slice(-EVOLUTION_SAMPLE_CAP);
  const herdPoints=sampleHerdTraits(world.year,world.wildlife);
  const herds=[...(prior?.herds??[]),...herdPoints].slice(-HERD_TRAIT_CAP);
  const shifts=[...(prior?.shifts??[])];
  const messages:string[]=[];
  const span=samples.length>1?samples[samples.length-1].year-samples[0].year:0;
  if(span>=SHIFT_MIN_YEARS){
    for(const shift of findShifts(samples,speciesClimateBands(world),shifts)){
      shifts.push(shift);messages.push(shift.message);
    }
  }
  world.evolution={
    samples,shifts:shifts.slice(-EVOLUTION_SHIFT_CAP),
    ...(herds.length?{herds}:{}),
  };
  return messages;
}

function finiteTrait(value:unknown):value is number{
  return typeof value==='number'&&Number.isFinite(value)&&value>=.5&&value<=1.5;
}
function validMeans(value:unknown):value is TraitMeans{
  if(!value||typeof value!=='object')return false;
  const row=value as TraitMeans;
  return Number.isInteger(row.count)&&row.count>=0&&row.count<=100000&&
    EVOLUTION_TRAITS.every(trait=>finiteTrait(row[trait]));
}
export function validEvolution(value:unknown,year:number):value is EvolutionState{
  if(!value||typeof value!=='object')return false;
  const state=value as EvolutionState;
  if(!Array.isArray(state.samples)||state.samples.length<1||
    state.samples.length>EVOLUTION_SAMPLE_CAP||
    !Array.isArray(state.shifts)||state.shifts.length>EVOLUTION_SHIFT_CAP)
    return false;
  let previous=-1;
  for(const sample of state.samples){
    if(!sample||!Number.isInteger(sample.year)||sample.year<0||sample.year>year||
      sample.year<=previous||!sample.species||
      !SPECIES.every(species=>validMeans(sample.species[species])))return false;
    previous=sample.year;
  }
  // The newest sample may lag the calendar. Some lived years are advanced by
  // a single system (a voyage, a council) without a full world tick, and
  // older saves have no samples at all. The next full year appends one.
  for(const shift of state.shifts){
    if(!shift||!Number.isInteger(shift.year)||shift.year<0||shift.year>year||
      !SPECIES.includes(shift.species)||
      !(EVOLUTION_TRAITS as readonly string[]).includes(shift.trait)||
      !(CLIMATE_BANDS as readonly string[]).includes(shift.band)||
      !finiteTrait(shift.before)||!finiteTrait(shift.after)||
      typeof shift.message!=='string'||shift.message.length<8||
      shift.message.length>180)return false;
  }
  if(state.herds===undefined)return true;
  if(!Array.isArray(state.herds)||state.herds.length>HERD_TRAIT_CAP)return false;
  return state.herds.every(row=>!!row&&typeof row.kind==='string'&&
    row.kind.length>=1&&row.kind.length<=24&&
    typeof row.trait==='string'&&row.trait.length>=1&&row.trait.length<=32&&
    Number.isInteger(row.year)&&row.year>=0&&row.year<=year&&
    Number.isFinite(row.mean)&&row.mean>=-1&&row.mean<=100);
}

function pickWeighted(weights:readonly number[],roll:number):number{
  const total=weights.reduce((sum,weight)=>sum+weight,0);
  let cursor=roll*total;
  for(let i=0;i<weights.length;i++){
    cursor-=weights[i];
    if(cursor<=0)return i;
  }
  return weights.length-1;
}

/** A compressed family line under one constant pressure.
 * Each generation compounds the same yearly health and birth effects. */
export function projectTraitDrift(seed:number,generations:number,
  stress:LocalStress,focus:SurvivalTrait,size=80):{start:number;end:number}{
  let people:Genes[]=Array.from({length:size},(_,index)=>({
    vigor:1,curiosity:1,fertility:1,social:1,
    ...founderSurvivalGenes(seed,index+1),
  }));
  const mean=()=>people.reduce((sum,genes)=>sum+(genes[focus]??1),0)/people.length;
  const start=mean();
  for(let generation=0;generation<generations;generation++){
    const weights=people.map(genes=>{
      const yearly=survivalHealthDelta(genes,stress);
      const births=reproductiveEdge(genes,genes,stress);
      return Math.max(0.2,1+yearly*1.4+births*8);
    });
    const next:Genes[]=[];
    for(let child=0;child<size;child++){
      const mother=people[pickWeighted(weights,
        mix(seed^Math.imul(generation+1,0x9e3779b1)^Math.imul(child+1,0x6c62272e))/4294967296)];
      const father=people[pickWeighted(weights,
        mix(seed^Math.imul(generation+1,0x85ebca6b)^Math.imul(child+1,0x27d4eb2d)^0x45d9f3b)/4294967296)];
      next.push({
        vigor:1,curiosity:1,fertility:1,social:1,
        ...inheritSurvivalGenes(seed,generation*size+child+1,mother,father),
      });
    }
    people=next;
  }
  return {start:round2(start),end:round2(mean())};
}
