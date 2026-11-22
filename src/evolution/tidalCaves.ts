import {volcanoApproach} from './volcanicGeography';
import {terrainHash,terrainTemperature} from './biomeGeneration';
import type {World} from './engine';
import {hydrologyForWorld} from './hydrology';
import {directionBetween,type Facing} from './motion';
import {oceanBasins} from './regionalGeography';
import {MAX_LANDING_RISE,seaNeighbors,seaPoint} from './shipSave';
import {topographyForWorld,type Topography} from './topography';
import {worldTreeBlocksBuilding} from './worldTree';

export type CaveStone='basalt'|'limestone'|'reef';
export type CaveFind='mooring'|'fossil'|'lagoon';
export type TidalCave={mouth:number;shore:number;water:number;face:Facing;stone:CaveStone;
  seed:number;name:string;find:CaveFind;farShore?:number};
export type TidalChartEntry={mouth:number;find?:CaveFind};
export type TidalExploration={chart:TidalChartEntry[];inside?:{mouth:number;cell:number}};
export const CAVE_WIDTH=19,CAVE_HEIGHT=15,CHART_LIMIT=96;

type Coast=Pick<World,'width'|'height'|'tiles'|'settings'|'topography'|'worldTree'|'tidalSites'|'volcanicLayout'>;
const caveNames:Record<CaveStone,{starts:readonly string[];ends:readonly string[];find:CaveFind}>={
  basalt:{starts:['Cinder','Ember','Blackglass','Sable','Coal','Obsidian'],
    ends:['Arch','Vault','Cove'],find:'mooring'},
  limestone:{starts:['Saltglass','Pearl','Whitecap','Shell','Drift','Windworn'],
    ends:['Grotto','Hollow','Cavern'],find:'fossil'},
  reef:{starts:['Coral','Turquoise','Sunken','Seaglass','Bluewater','Starfish'],
    ends:['Lagoon','Cove','Grotto'],find:'lagoon'},
};
export const CAVE_FINDS:Record<CaveFind,{name:string;action:string;description:string}>={
  mooring:{name:'Old mooring',action:'Inspect the old mooring',
    description:'Two iron rings and a weathered beam mark a sheltered berth cut into the rock.'},
  fossil:{name:'Fossil bed',action:'Examine the fossil bed',
    description:'Spirals of ancient shells are pressed into the limestone above the tide line.'},
  lagoon:{name:'Hidden lagoon',action:'Survey the lagoon',
    description:'A shaft of daylight reaches a pale beach and a pool protected by the reef.'},
};

const coastCache=new WeakMap<Topography,{seed:number;tree:World['worldTree'];volcanicLayout:World['volcanicLayout'];caves:TidalCave[]}>();

/** Select actual ocean-facing shores. The simulation terrain stays intact.
 * Layout and discoveries reconstruct on older saves from the same coast. */
function coastCaves(world:Coast){
  const {width:w,height:h,tiles}=world,seed=world.settings.seed;
  const topo=topographyForWorld(world),cached=coastCache.get(topo);
  if(cached?.seed===seed&&cached.tree===world.worldTree&&cached.volcanicLayout===world.volcanicLayout)return cached;
  const {heights}=topo,size=tiles.length;
  const drainage=hydrologyForWorld(world),ocean=oceanBasins(world,drainage);
  const sea=(i:number)=>tiles[i]?.biome==='water'&&ocean.has(drainage.basin[i]);
  const dry=(i:number)=>i>=0&&i<size&&tiles[i].biome!=='water';
  const neighbors=(i:number)=>seaNeighbors(i,w,size);
  const position=(x:number,y:number)=>x>=0&&x<w&&y>=0&&y<h?y*w+x:-1;
  const berths=new Int32Array(size).fill(-1);
  for(let i=0;i<size;i++){
    if(!dry(i))continue;
    const water=neighbors(i).find(next=>sea(next)&&Math.abs(heights[i]-heights[next])<=MAX_LANDING_RISE);
    if(water!==undefined)berths[i]=water;
  }
  const candidates:{mouth:number;shore:number;water:number;face:Facing;stone:CaveStone;score:number}[]=[];
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const mouth=y*w+x;
    if(!dry(mouth))continue;
    let best:typeof candidates[number]|undefined;
    for(const water of neighbors(mouth)){
      if(!sea(water))continue;
      const face=directionBetween({x,y},seaPoint(w,water));
      const wx=water%w-x,wy=Math.floor(water/w)-y;
      const back=mouth-wx-wy*w;
      if(!dry(back))continue;
      // The nearby beach must be a real legal landfall with a dry step to
      // the entrance. Prefer beaches beside the arch over the tidal apron.
      const shore=neighbors(mouth).find(i=>dry(i)&&berths[i]>=0)??mouth;
      if(berths[shore]<0||volcanoApproach(world,mouth)||volcanoApproach(world,shore)||worldTreeBlocksBuilding(world.worldTree,x,y)||
        worldTreeBlocksBuilding(world.worldTree,shore%w,Math.floor(shore/w)))continue;
      const near=[mouth,back,...neighbors(back).filter(dry)];
      const relief=Math.max(...near.map(i=>heights[i]))-heights[mouth];
      const volcanic=near.some(i=>tiles[i].biome==='volcanic');
      const darkRock=volcanic||tiles[back].biome==='wasteland';
      const warm=terrainTemperature(x,y,Math.min(w,h),(y+.5)/h,seed)>.55||
        near.some(i=>tiles[i].biome==='savanna'||tiles[i].biome==='wetland');
      const stone=darkRock?'basalt':warm&&relief<55?'reef':'limestone';
      const score=terrainHash(x,y,seed+71063)*3+Math.min(38,relief)*.074+
        (darkRock?1.5:0)+(shore!==mouth?.4:0);
      if(!best||score>best.score)best={mouth,shore,water,face,stone,score};
    }
    if(best)candidates.push(best);
  }
  candidates.sort((a,b)=>b.score-a.score||a.mouth-b.mouth);
  const caves:TidalCave[]=[],entrances=new Set<number>(),names=new Set<string>();
  const farBanks=new Set<number>();
  const desired=Math.min(14,3+Math.floor(Math.sqrt(size)/50));
  for(const site of candidates){
    if(caves.length>=desired)break;
    const {mouth,shore,water,face,stone}=site,{x,y}=seaPoint(w,mouth);
    if(caves.some(cave=>Math.hypot(cave.mouth%w-x,Math.floor(cave.mouth/w)-y)<10)||
      farBanks.has(mouth)||farBanks.has(shore))continue;
    const salt=Math.floor(terrainHash(x,y,seed+9961)*2147483647);
    const {starts,ends,find}=caveNames[stone];
    let name=starts[salt%starts.length]+' '+ends[Math.floor(salt/starts.length)%ends.length];
    if(names.has(name))name=name+' '+(caves.length+1);
    names.add(name);
    let farShore:number|undefined;
    if(terrainHash(x,y,seed+481)<.58){
      const edge=seaPoint(w,water);
      let nearest=10;
      for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
        const distance=Math.abs(dx)+Math.abs(dy),next=position(x+dx,y+dy);
        if(next<0||distance<4||distance>=nearest||berths[next]<0||
          entrances.has(next)||farBanks.has(next)||volcanoApproach(world,next)||worldTreeBlocksBuilding(world.worldTree,x+dx,y+dy)||
          dx*(edge.x-x)+dy*(edge.y-y)>0)continue;
        const otherSea=seaPoint(w,berths[next]);
        if((otherSea.x-x-dx)*(edge.x-x)+(otherSea.y-y-dy)*(edge.y-y)>0)continue;
        let throughLand=true;
        const steps=Math.max(Math.abs(dx),Math.abs(dy));
        for(let n=1;n<steps;n++){
          if(!dry(position(x+Math.round(dx*n/steps),y+Math.round(dy*n/steps)))){
            throughLand=false;break;
          }
        }
        if(throughLand){nearest=distance;farShore=next;}
      }
    }
    entrances.add(mouth);entrances.add(shore);
    if(farShore!==undefined){farBanks.add(farShore);entrances.add(farShore);}
    caves.push({mouth,shore,water,face,stone,seed:salt,name,find,farShore});
  }
  const result={seed,tree:world.worldTree,volcanicLayout:world.volcanicLayout,caves};
  coastCache.set(topo,result);
  return result;
}

export const tidalCaves=(world:Coast):readonly TidalCave[]=>world.tidalSites??coastCaves(world).caves;
export const tidalCaveAt=(world:Coast,mouth:number)=>tidalCaves(world).find(cave=>cave.mouth===mouth);
export const tidalApproach=(world:Pick<Coast,'tidalSites'>,index:number)=>!!world.tidalSites?.some(cave=>
  cave.mouth===index||cave.shore===index||cave.farShore===index);
export const caveHasCoast=(world:Coast,cave:TidalCave)=>
  !!world.tiles[cave.mouth]&&world.tiles[cave.mouth].biome!=='water'&&
  !!world.tiles[cave.shore]&&world.tiles[cave.shore].biome!=='water'&&
  world.tiles[cave.water]?.biome==='water';

export function chartedTidalCaves(world:World){
  const chart=world.descent?.tidal?.chart;
  if(!chart?.length)return [];
  return tidalCaves(world).flatMap(cave=>{
    const entry=chart.find(entry=>entry.mouth===cave.mouth);
    return entry&&caveHasCoast(world,cave)?[{cave,find:entry.find}]:[];
  });
}

export function validTidalSites(value:unknown,width:number,height:number):value is TidalCave[]{
  if(!Array.isArray(value)||value.length>14)return false;
  const size=width*height,mouths=new Set<number>();
  const index=(i:unknown)=>typeof i==='number'&&Number.isInteger(i)&&i>=0&&i<size;
  for(const cave of value as TidalCave[]){
    if(!cave||!index(cave.mouth)||!index(cave.shore)||!index(cave.water)||mouths.has(cave.mouth)||
      (cave.mouth!==cave.shore&&!seaNeighbors(cave.mouth,width,size).includes(cave.shore))||
      !seaNeighbors(cave.mouth,width,size).includes(cave.water)||
      (cave.farShore!==undefined&&(!index(cave.farShore)||[cave.mouth,cave.shore,cave.water].includes(cave.farShore)))||
      directionBetween(seaPoint(width,cave.mouth),seaPoint(width,cave.water))!==cave.face||
      !Object.hasOwn(caveNames,cave.stone)||caveNames[cave.stone].find!==cave.find||
      !Number.isSafeInteger(cave.seed)||cave.seed<0||cave.seed>2147483647||
      typeof cave.name!=='string'||!cave.name||cave.name.length>64)return false;
    mouths.add(cave.mouth);
  }
  return true;
}

/** Both coasts share the same cycle. Low water stays long enough to walk
 * ashore at the normal clock speed, including on touch controls. */
export function coastTide(world:Pick<World,'year'|'dayOfYear'>){
  const phase=(world.year*365+(world.dayOfYear??0))%12;
  const low=phase<6||world.year>=9999;
  return {low,untilLow:low?0:12-phase};
}

export function validTidalExploration(value:unknown,tileCount:number):value is TidalExploration{
  if(!value||typeof value!=='object')return false;
  const {chart,inside}=value as TidalExploration;
  const index=(n:unknown,size:number)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<size;
  if(!Array.isArray(chart)||chart.length>CHART_LIMIT||
    !chart.every(entry=>entry&&index(entry.mouth,tileCount)&&
      (entry.find===undefined||Object.hasOwn(CAVE_FINDS,entry.find))))return false;
  const observed=new Set(chart.map(entry=>entry.mouth));
  return observed.size===chart.length&&(inside===undefined||!!inside&&
    observed.has(inside.mouth)&&index(inside.cell,CAVE_WIDTH*CAVE_HEIGHT));
}
