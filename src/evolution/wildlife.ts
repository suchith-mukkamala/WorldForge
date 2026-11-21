/** Herds, flocks and fish schools. They follow habitat and the year's rainfall.
 * Placement and movement use the climate hash, never the world RNG, so births
 * and histories stay on their previous random sequence.
 */
import {terrainHash} from './biomeGeneration';
import {annualGrowthFactor,climateField,weatherAnomaly,type ClimateField} from './climate';
import type {Biome,World} from './engine';
import {roadTiles} from './transport';

export const WILDLIFE_KINDS=['grazer','browser','wader','flock','fish'] as const;
export type WildlifeKind=typeof WILDLIFE_KINDS[number];
export type Herd={kind:WildlifeKind;index:number;size:number};
export const WILDLIFE_LABELS:Record<WildlifeKind,string>={
  grazer:'Grazing herd',browser:'Browsing herd',wader:'Wading birds',
  flock:'Wandering flock',fish:'Fish school',
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
const NEIGHBORS=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[1,1],[-1,1]] as const;
const round=(n:number)=>Math.round(n*100)/100;

export function herdBudget(tileCount:number):number{
  return Math.max(12,Math.min(56,Math.round(Math.sqrt(tileCount)*.55)));
}
export function fitsHabitat(kind:WildlifeKind,biome:Biome):boolean{
  return HOME[kind].includes(biome);
}
export function herdAt(herds:readonly Herd[]|undefined,index:number):Herd|undefined{
  return herds?.find(herd=>herd.index===index);
}

/** Herds approach a carrying capacity set by habitat, rain and the growing season. */
export function herdDelta(kind:WildlifeKind,anomaly:number,atHome:boolean,
  growth:number,size:number):number{
  const capacity=!atHome?4:kind==='fish'?22+anomaly*6:16+anomaly*14+(growth-.8)*18;
  return Math.max(-3,Math.min(3,Math.round((capacity-size)*.4)));
}

export function validWildlife(list:unknown,tileCount:number):boolean{
  if(!Array.isArray(list)||list.length>64)return false;
  const seen=new Set<number>();
  return list.every(herd=>{
    const row=herd as Partial<Herd>;
    return !!row&&WILDLIFE_KINDS.includes(row.kind as WildlifeKind)&&
      Number.isInteger(row.index)&&row.index!>=0&&row.index!<tileCount&&
      !seen.has(row.index!)&&!!seen.add(row.index!)&&
      Number.isInteger(row.size)&&row.size!>=1&&row.size!<=80;
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
      herds.push({kind,index:candidate.index,size});
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

export function advanceWildlife(world:World):void{
  if(!world.wildlife?.length)return;
  const field=climateField(world);
  const blocked=blockedTiles(world);
  const occupied=new Set(world.wildlife.map(herd=>herd.index));
  const next:Herd[]=[];
  for(const herd of world.wildlife){
    if(blocked.has(herd.index))occupied.delete(herd.index);
    const reach=herd.kind==='flock'||blocked.has(herd.index)?2:1;
    const index=stepHerd(world,herd,field,blocked,occupied,reach);
    const biome=world.tiles[index].biome;
    if(blocked.has(index)||!fitsHabitat(herd.kind,biome)){
      occupied.delete(index);
      continue;
    }
    const x=index%world.width,y=Math.floor(index/world.width);
    const anomaly=weatherAnomaly(world.settings.seed,world.year,x,y);
    const growth=annualGrowthFactor(biome,field.temperature[index],field.moisture[index],
      world.settings.seed,world.year,x,y);
    const size=Math.min(80,herd.size+herdDelta(herd.kind,anomaly,true,growth,herd.size));
    if(size<1){occupied.delete(index);continue;}
    next.push({kind:herd.kind,index,size});
    if(herd.kind!=='fish'){
      const tile=world.tiles[index];
      const bite=Math.min(tile.food*.12,size*.018);
      world.tiles[index]={...tile,food:round(Math.max(0,tile.food-bite))};
    }
  }
  world.wildlife=next;
}
