/** Herds, flocks and fish schools. They follow habitat and the year's rainfall.
 * Placement, movement and inheritance use the climate hash, never the world RNG,
 * so births and histories stay on their previous random sequence.
 *
 * Each herd carries trait means and variance. Once a year those means shift by
 * a small seeded mutation plus selection from climate, nearby flocks, and
 * `harvested` (animals taken by hunters since the previous wildlife step).
 */
import {terrainHash} from './biomeGeneration';
import {annualGrowthFactor,climateField,weatherAnomaly,type ClimateField} from './climate';
import type {Biome,World} from './engine';
import {roadTiles} from './transport';

export const WILDLIFE_KINDS=['grazer','browser','wader','flock','fish'] as const;
export type WildlifeKind=typeof WILDLIFE_KINDS[number];
/** Heritable herd means. All values are 0..1.
 * `coat` is cold tolerance (a heavier coat). `heat` is heat tolerance.
 * `wariness` is how readily the herd avoids hunters and flocks.
 */
export const HERD_TRAITS=['size','speed','coat','heat','fertility','wariness'] as const;
export type HerdTrait=typeof HERD_TRAITS[number];
export type HerdTraits=Record<HerdTrait,number>;
export const HERD_TRAIT_LABELS:Record<HerdTrait,string>={
  size:'Body size',speed:'Speed',coat:'Cold tolerance',heat:'Heat tolerance',
  fertility:'Fertility',wariness:'Wariness',
};
/** Recognized when a herd's means have drifted far from its origin. */
export type HerdVariety={id:string;name:string;year:number};
export type Herd={
  kind:WildlifeKind;
  /** Stable id for charts. Missing on herds saved before evolution. */
  id?:number;
  index:number;
  size:number;
  /**
   * Animals taken by hunters since the last wildlife step. Default 0.
   *
   * Hunting code should add to this on the live herd. `advanceWildlife` reads
   * it once per simulated year (from `stepWorld`, before settlement work),
   * thins the herd, selects for speed and wariness, then sets it back to 0.
   * A count written after that step is applied the following year. Older saves
   * omit the field and load as 0. Values above the herd's size still wipe it;
   * the surplus is not kept.
   */
  harvested?:number;
  /** Years of inheritance already applied. */
  generation?:number;
  /** Population means for the current generation. */
  means?:HerdTraits;
  /** Spread around each mean. Selection narrows it; mutation widens it slightly. */
  variance?:HerdTraits;
  /** Means when the herd was founded. Divergence is measured from here. */
  origin?:HerdTraits;
  /** Set once, when the herd is far enough from `origin` to name. */
  variety?:HerdVariety;
};
export const WILDLIFE_LABELS:Record<WildlifeKind,string>={
  grazer:'Grazing herd',browser:'Browsing herd',wader:'Wading birds',
  flock:'Wandering flock',fish:'Fish school',
};
/** One row of the Evolution chart. Means are copies, not the live records. */
export type HerdTraitSnapshot={
  id:number;kind:WildlifeKind;index:number;size:number;generation:number;
  harvested:number;means:HerdTraits;variance:HerdTraits;origin:HerdTraits;
  variety?:HerdVariety;
};
const HOME:Record<WildlifeKind,readonly Biome[]>={
  grazer:['plains','savanna'],
  browser:['forest','taiga'],
  wader:['wetland'],
  flock:['plains','savanna','forest'],
  fish:['water'],
};
const SALT:Record<WildlifeKind,number>={
  grazer:3,browser:5,wader:7,flock:11,fish:13,
};
const BASELINE:Record<WildlifeKind,HerdTraits>={
  grazer:{size:.64,speed:.4,coat:.42,heat:.6,fertility:.56,wariness:.26},
  browser:{size:.57,speed:.38,coat:.66,heat:.36,fertility:.48,wariness:.34},
  wader:{size:.32,speed:.58,coat:.5,heat:.44,fertility:.52,wariness:.42},
  flock:{size:.3,speed:.74,coat:.46,heat:.48,fertility:.6,wariness:.5},
  fish:{size:.36,speed:.62,coat:.48,heat:.5,fertility:.68,wariness:.2},
};
const DRIFT_WORD:Record<HerdTrait,[string,string]>={
  size:['great','slight'],speed:['swift','heavy-footed'],coat:['woolly','thin-coated'],
  heat:['heat-hardened','cool-blooded'],fertility:['fecund','sparse'],
  wariness:['wary','bold'],
};
const VARIETY_NOUN:Record<WildlifeKind,string>={
  grazer:'grazer',browser:'browser',wader:'wader',flock:'flock',fish:'school',
};
const NEIGHBORS=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[1,1],[-1,1]] as const;
const RESPONSE=.9;
const VARIETY_DISTANCE=.42;
const round=(n:number)=>Math.round(n*100)/100;
const round3=(n:number)=>Math.round(n*1000)/1000;
const clamp01=(n:number)=>Math.max(0,Math.min(1,n));

export function herdBudget(tileCount:number):number{
  return Math.max(12,Math.min(56,Math.round(Math.sqrt(tileCount)*.55)));
}
export function fitsHabitat(kind:WildlifeKind,biome:Biome):boolean{
  return HOME[kind].includes(biome);
}
export function herdAt(herds:readonly Herd[]|undefined,index:number):Herd|undefined{
  return herds?.find(herd=>herd.index===index);
}

function copyMeans(means:HerdTraits):HerdTraits{
  return {size:means.size,speed:means.speed,coat:means.coat,heat:means.heat,
    fertility:means.fertility,wariness:means.wariness};
}
function isBlock(value:unknown,limit:number):value is HerdTraits{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return HERD_TRAITS.every(trait=>{
    const n=row[trait];
    return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=limit;
  });
}
function flatVariance(n:number):HerdTraits{
  return {size:n,speed:n,coat:n,heat:n,fertility:n,wariness:n};
}
function founding(kind:WildlifeKind,index:number,seed:number):{means:HerdTraits;variance:HerdTraits}{
  const base=BASELINE[kind],means={} as HerdTraits,variance={} as HerdTraits;
  HERD_TRAITS.forEach((trait,i)=>{
    const swing=terrainHash(index,SALT[kind]+40+i,seed)-.5;
    means[trait]=round3(clamp01(base[trait]+swing*.1));
    variance[trait]=round3(.036+terrainHash(index,SALT[kind]+90+i,seed)*.012);
  });
  return {means,variance};
}
function validVariety(value:unknown):boolean{
  if(value===undefined)return true;
  if(!value||typeof value!=='object')return false;
  const row=value as Partial<HerdVariety>;
  return typeof row.id==='string'&&row.id.length>0&&row.id.length<=48&&
    typeof row.name==='string'&&row.name.length>0&&row.name.length<=80&&
    Number.isInteger(row.year)&&row.year!>=0&&row.year!<=9999;
}
function fillHerd(herd:Herd,seed:number,alloc:()=>number):Herd{
  if(!herd||typeof herd!=='object'||!WILDLIFE_KINDS.includes(herd.kind))return herd;
  if(herd.means!==undefined&&!isBlock(herd.means,1)||
    herd.variance!==undefined&&!isBlock(herd.variance,.25)||
    herd.origin!==undefined&&!isBlock(herd.origin,1))return herd;
  const meansMissing=herd.means===undefined;
  const varianceMissing=herd.variance===undefined;
  const originMissing=herd.origin===undefined;
  const idMissing=!Number.isInteger(herd.id)||(herd.id??0)<1;
  const harvestedMissing=herd.harvested===undefined;
  const generationMissing=herd.generation===undefined;
  if(!meansMissing&&!varianceMissing&&!originMissing&&!idMissing&&
    !harvestedMissing&&!generationMissing)return herd;
  const founded=founding(herd.kind,herd.index??0,seed);
  const means=meansMissing?founded.means:herd.means!;
  return {...herd,id:idMissing?alloc():herd.id,
    harvested:harvestedMissing?0:herd.harvested,
    generation:generationMissing?0:herd.generation,
    means,variance:varianceMissing?founded.variance:herd.variance,
    origin:originMissing?copyMeans(means):herd.origin};
}
/** Fill trait means, variance, origin, generation and harvested on older herds.
 * Herds that already carry those fields are returned unchanged. Invalid blocks
 * are left untouched so validation can reject them.
 */
export function migrateWildlife(herds:readonly Herd[],seed:number):Herd[]{
  if(!Array.isArray(herds))return [];
  const used=new Set<number>();
  for(const herd of herds){
    if(herd&&Number.isInteger(herd.id)&&(herd.id??0)>=1)used.add(herd.id!);
  }
  let nextId=1;
  const alloc=()=>{
    while(used.has(nextId))nextId++;
    const id=nextId++;
    used.add(id);
    return id;
  };
  let changed=false;
  const next=herds.map(herd=>{
    const filled=fillHerd(herd,seed,alloc);
    if(filled!==herd)changed=true;
    return filled;
  });
  return changed?next:(herds as Herd[]);
}

/** A copy of the herd's trait means for charts and read-only UI. */
export function herdTraitMeans(herd:Herd):Readonly<HerdTraits>{
  return copyMeans(isBlock(herd.means,1)?herd.means:BASELINE[herd.kind]);
}
/** One detached snapshot per herd, in herd order. */
export function selectHerdTraits(herds:readonly Herd[]|undefined):HerdTraitSnapshot[]{
  if(!herds?.length)return [];
  return herds.map(herd=>({
    id:herd.id??herd.index,kind:herd.kind,index:herd.index,size:herd.size,
    generation:herd.generation??0,harvested:herd.harvested??0,
    means:herdTraitMeans(herd),
    variance:copyMeans(isBlock(herd.variance,.25)?herd.variance:flatVariance(.04)),
    origin:copyMeans(isBlock(herd.origin,1)?herd.origin:herdTraitMeans(herd)),
    ...(herd.variety?{variety:{...herd.variety}}:{}),
  }));
}

/** Herds approach a carrying capacity set by habitat, rain and the growing season. */
export function herdDelta(kind:WildlifeKind,anomaly:number,atHome:boolean,
  growth:number,size:number):number{
  const capacity=!atHome?4:kind==='fish'?22+anomaly*6:16+anomaly*14+(growth-.8)*18;
  return Math.max(-3,Math.min(3,Math.round((capacity-size)*.4)));
}

export function validWildlife(list:unknown,tileCount:number):boolean{
  if(!Array.isArray(list)||list.length>64)return false;
  const seen=new Set<number>(),ids=new Set<number>();
  return list.every(herd=>{
    const row=herd as Partial<Herd>;
    if(!row||!WILDLIFE_KINDS.includes(row.kind as WildlifeKind)||
      !Number.isInteger(row.index)||row.index!<0||row.index!>=tileCount||
      seen.has(row.index!)||!Number.isInteger(row.size)||row.size!<1||row.size!>80)
      return false;
    seen.add(row.index!);
    if(row.id!==undefined&&(!Number.isInteger(row.id)||row.id<1||ids.has(row.id)))
      return false;
    if(row.id!==undefined)ids.add(row.id);
    if(row.harvested!==undefined&&(!Number.isInteger(row.harvested)||
      row.harvested<0||row.harvested>100000))return false;
    if(row.generation!==undefined&&(!Number.isInteger(row.generation)||
      row.generation<0||row.generation>100000))return false;
    if(row.means!==undefined&&!isBlock(row.means,1))return false;
    if(row.variance!==undefined&&!isBlock(row.variance,.25))return false;
    if(row.origin!==undefined&&!isBlock(row.origin,1))return false;
    return validVariety(row.variety);
  });
}

function blockedTiles(world:Pick<World,'width'|'settlements'|'transport'>):Set<number>{
  const blocked=new Set<number>();
  for(const settlement of world.settlements){
    blocked.add(settlement.y*world.width+settlement.x);
    for(const building of settlement.infrastructure?.buildings??[]){
      if(building.stage!=='ruin'&&building.stage!=='abandoned')
        blocked.add(building.y*world.width+building.x);
    }
  }
  for(const index of roadTiles(world as World))blocked.add(index);
  return blocked;
}

function landBeside(world:Pick<World,'width'|'height'|'tiles'>,index:number):number{
  const {width,height,tiles}=world,x=index%width,y=Math.floor(index/width);
  let shores=0;
  for(const [dx,dy] of NEIGHBORS){
    const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=width||ny>=height)continue;
    if(tiles[ny*width+nx].biome!=='water')shores++;
  }
  return shores;
}

function siteScore(kind:WildlifeKind,biome:Biome,field:ClimateField,index:number,
  shores:number):number{
  if(!fitsHabitat(kind,biome))return -1;
  const moisture=field.moisture[index],temperature=field.temperature[index];
  if(kind==='grazer')return 4+(1-Math.abs(moisture-.38))*2+temperature;
  if(kind==='browser')return 4+moisture*2+(1-temperature);
  if(kind==='wader')return 4+moisture*3+(field.banks[index]>.2?1.2:0);
  if(kind==='flock')return 3+temperature+(1-Math.abs(moisture-.45));
  return 1+shores*2+(field.coast[index]<=1?.4:0);
}

function tooClose(index:number,taken:ReadonlySet<number>,width:number,spacing:number):boolean{
  const x=index%width,y=Math.floor(index/width);
  for(const other of taken){
    if(Math.max(Math.abs(other%width-x),Math.abs(Math.floor(other/width)-y))<spacing)
      return true;
  }
  return false;
}

export function seedWildlife(world:World):Herd[]{
  const field=climateField(world);
  const budget=herdBudget(world.tiles.length);
  const shares:Record<WildlifeKind,number>={
    grazer:Math.round(budget*.3),browser:Math.round(budget*.24),
    wader:Math.round(budget*.16),flock:Math.round(budget*.14),fish:Math.round(budget*.16),
  };
  const blocked=blockedTiles(world);
  const herds:Herd[]=[];
  const taken=new Set<number>();
  for(const kind of WILDLIFE_KINDS){
    const ranked:{index:number;score:number}[]=[];
    for(let index=0;index<world.tiles.length;index++){
      if(blocked.has(index))continue;
      const shores=kind==='fish'?landBeside(world,index):0;
      const base=siteScore(kind,world.tiles[index].biome,field,index,shores);
      if(base<0)continue;
      ranked.push({index,score:base+terrainHash(index,SALT[kind],world.settings.seed)*.85});
    }
    ranked.sort((a,b)=>b.score-a.score||a.index-b.index);
    let placed=0;
    for(const candidate of ranked){
      if(placed>=shares[kind])break;
      if(tooClose(candidate.index,taken,world.width,5))continue;
      const size=12+Math.floor(terrainHash(candidate.index,SALT[kind]+20,world.settings.seed)*24);
      const founded=founding(kind,candidate.index,world.settings.seed);
      herds.push({kind,id:herds.length+1,index:candidate.index,size,harvested:0,
        generation:0,means:founded.means,variance:founded.variance,
        origin:{...founded.means}});
      taken.add(candidate.index);
      placed++;
    }
  }
  return herds;
}

function stepHerd(world:World,herd:Herd,field:ClimateField,blocked:ReadonlySet<number>,
  occupied:Set<number>,reach:number):number{
  const {width,height}=world;
  let at=herd.index;
  for(let hop=0;hop<reach;hop++){
    const x=at%width,y=Math.floor(at/width);
    let best=-1,score=-Infinity;
    const consider=(index:number)=>{
      if(blocked.has(index)||index!==at&&occupied.has(index))return;
      const shores=herd.kind==='fish'?landBeside(world,index):0;
      const value=siteScore(herd.kind,world.tiles[index].biome,field,index,shores);
      if(value<0)return;
      if(value>score||value===score&&(best<0||index<best)){score=value;best=index;}
    };
    consider(at);
    for(const [dx,dy] of NEIGHBORS){
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=width||ny>=height)continue;
      consider(ny*width+nx);
    }
    if(best<0||best===at)break;
    occupied.delete(at);
    occupied.add(best);
    at=best;
  }
  return at;
}

type Pressure={cold:number;heat:number;drought:number;bounty:number;
  predation:number;hunting:number};
function unit(n:number):number{
  return Math.max(0,Math.min(1,n));
}
/** Climate selection. Taiga and savanna add the habitat the climate map already chose. */
function climatePressure(biome:Biome,temperature:number,moisture:number,anomaly:number,
  growth:number):Pick<Pressure,'cold'|'heat'|'drought'|'bounty'>{
  let cold=unit((.46-temperature)/.28);
  let heat=unit((temperature-.5)/.28);
  let drought=unit((.4-moisture)/.32+(anomaly<-.64?.4:0));
  let bounty=unit((growth-.72)/.45);
  if(biome==='taiga')cold=unit(cold+.62);
  if(biome==='savanna'||biome==='wasteland')heat=unit(heat+.58);
  if(biome==='wetland'){drought=unit(drought-.45);bounty=unit(bounty+.2);}
  return {cold,heat,drought,bounty};
}
function slopes(pressure:Pressure):HerdTraits{
  return {
    size:.7*pressure.cold-.6*pressure.heat-.3*pressure.drought-.55*pressure.hunting,
    speed:.9*pressure.hunting+.75*pressure.predation+.2*pressure.drought,
    coat:pressure.cold-.55*pressure.heat,
    heat:pressure.heat-.5*pressure.cold+.15*pressure.drought,
    fertility:.6*pressure.bounty-.45*pressure.drought-.25*pressure.hunting,
    wariness:.95*pressure.hunting+.8*pressure.predation,
  };
}
function descend(herd:Herd,pressure:Pressure,generation:number,seed:number,index:number){
  const means={} as HerdTraits,variance={} as HerdTraits,slope=slopes(pressure);
  const current=herd.means??BASELINE[herd.kind];
  const spread=herd.variance??flatVariance(.04);
  const identity=herd.id??index;
  HERD_TRAITS.forEach((trait,traitIndex)=>{
    const roll=terrainHash(identity+generation*17,SALT[herd.kind]+traitIndex*3,seed+1400);
    const mutation=(roll-.5)*.008;
    const gene=spread[trait];
    means[trait]=round3(clamp01(current[trait]+slope[trait]*gene*RESPONSE+mutation));
    const nextVar=gene*(1-Math.min(.05,Math.abs(slope[trait])*.03))+.001;
    variance[trait]=round3(Math.max(.02,Math.min(.09,nextVar)));
  });
  return {means,variance};
}
/** Flocks take young from grazers, browsers and waders within three tiles.
 * Fish are not hunted by land flocks. Speed and wariness blunt the pressure.
 */
function predationPressure(kind:WildlifeKind,index:number,means:HerdTraits,
  neighbors:readonly {kind:WildlifeKind;index:number;size:number}[],width:number):number{
  if(kind==='flock'||kind==='fish')return 0;
  const x=index%width,y=Math.floor(index/width);
  let pressure=0;
  for(const other of neighbors){
    if(other.kind!=='flock'||other.index===index)continue;
    const dist=Math.max(Math.abs(other.index%width-x),
      Math.abs(Math.floor(other.index/width)-y));
    if(dist>3)continue;
    const dodge=(means.speed+means.wariness)*.22;
    const threat=Math.min(1,other.size/36)*(1-dist*.22);
    pressure+=Math.max(0,threat-dodge);
  }
  return Math.min(1,pressure);
}
function separation(a:HerdTraits,b:HerdTraits):number{
  let sum=0;
  for(const trait of HERD_TRAITS){
    const d=a[trait]-b[trait];
    sum+=d*d;
  }
  return Math.sqrt(sum);
}
function nameVariety(herd:Herd,means:HerdTraits,year:number):HerdVariety|undefined{
  const origin=herd.origin??means;
  if(separation(means,origin)<VARIETY_DISTANCE)return undefined;
  let best:HerdTrait=HERD_TRAITS[0],gap=-1;
  for(const trait of HERD_TRAITS){
    const d=Math.abs(means[trait]-origin[trait]);
    if(d>gap){gap=d;best=trait;}
  }
  const word=DRIFT_WORD[best][means[best]>=origin[best]?0:1];
  const id=herd.id??herd.index;
  return {id:`${herd.kind}-${id}-y${year}`,name:`${word} ${VARIETY_NOUN[herd.kind]}`,year};
}
function recordVariety(world:World,name:string){
  if(!Array.isArray(world.events)||!Number.isInteger(world.nextEventId))return;
  world.events.push({id:world.nextEventId++,year:world.year,type:'milestone',
    message:'A '+name+' is now distinct from its parent herd.'});
  if(world.events.length>90)world.events=world.events.slice(-90);
}

export function advanceWildlife(world:World):void{
  if(!world.wildlife?.length)return;
  const prepared=migrateWildlife(world.wildlife,world.settings.seed);
  const field=climateField(world);
  const blocked=blockedTiles(world);
  const occupied=new Set(prepared.map(herd=>herd.index));
  const parked:{herd:Herd;index:number}[]=[];
  for(const herd of prepared){
    if(blocked.has(herd.index))occupied.delete(herd.index);
    const reach=herd.kind==='flock'||blocked.has(herd.index)?2:1;
    const index=stepHerd(world,herd,field,blocked,occupied,reach);
    if(blocked.has(index)||!fitsHabitat(herd.kind,world.tiles[index].biome)){
      occupied.delete(index);
      continue;
    }
    parked.push({herd,index});
  }
  const neighbors=parked.map(spot=>({kind:spot.herd.kind,index:spot.index,size:spot.herd.size}));
  const next:Herd[]=[];
  for(const spot of parked){
    const herd=spot.herd,index=spot.index,biome=world.tiles[index].biome;
    const x=index%world.width,y=Math.floor(index/world.width);
    const anomaly=weatherAnomaly(world.settings.seed,world.year,x,y);
    const growth=annualGrowthFactor(biome,field.temperature[index],field.moisture[index],
      world.settings.seed,world.year,x,y);
    let size=Math.min(80,herd.size+herdDelta(herd.kind,anomaly,true,growth,herd.size));
    const meansNow=herd.means??BASELINE[herd.kind];
    const predation=predationPressure(herd.kind,index,meansNow,neighbors,world.width);
    if(predation>=.45)size-=1;
    const harvested=Number.isFinite(herd.harvested)?Math.max(0,herd.harvested!):0;
    size-=Math.min(Math.max(0,size),Math.floor(harvested));
    if(size<1)continue;
    const generation=(herd.generation??0)+1;
    const descended=descend(herd,{
      ...climatePressure(biome,field.temperature[index],field.moisture[index],anomaly,growth),
      predation,hunting:Math.min(1,harvested/Math.max(1,herd.size)),
    },generation,world.settings.seed,index);
    const variety=herd.variety??nameVariety(herd,descended.means,world.year);
    if(variety&&!herd.variety)recordVariety(world,variety.name);
    next.push({...herd,index,size,harvested:0,generation,means:descended.means,
      variance:descended.variance,origin:copyMeans(herd.origin??meansNow),
      ...(variety?{variety:{...variety}}:{}),
    });
    if(herd.kind!=='fish'){
      const tile=world.tiles[index];
      const bite=Math.min(tile.food*.12,size*.018);
      world.tiles[index]={...tile,food:round(Math.max(0,tile.food-bite))};
    }
  }
  world.wildlife=next;
}
