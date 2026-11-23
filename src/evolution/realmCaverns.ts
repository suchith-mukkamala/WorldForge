import {terrainHash,terrainNoise} from './biomeGeneration';
import type {World} from './engine';
import {hydrologyForWorld} from './hydrology';
import {seaNeighbors,seaPoint} from './shipSave';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {projectWorldLayer,RealmBiome,realmWalkable,type RealmMap} from './underworld';

type Chamber={cell:number;entrance:number;name:string;rx:number;ry:number;vault:number};
export type Caverns={clearance:Uint8Array;room:Int8Array;chambers:Chamber[];galleries:number[][]};
export type CaveConnection={kind:'seep'|'fault'|'skylight';surface:number;cell:number};

const {sea,lava,glowroot,crystal,steam,ember}=RealmBiome;
const plans=new WeakMap<RealmMap,Caverns>();
const separation=(map:RealmMap,a:number,b:number)=>
  Math.hypot(a%map.width-b%map.width,Math.floor(a/map.width)-Math.floor(b/map.width));

function passageTree(map:RealmMap,start:number){
  const parents=new Int32Array(map.biomes.length).fill(-1);
  const queue=[start];parents[start]=start;
  for(const cell of queue)for(const next of seaNeighbors(cell,map.width,parents.length)){
    if(next<0||parents[next]>=0||map.fords.has(next)||!realmWalkable(map,next,0))continue;
    parents[next]=cell;queue.push(next);
  }
  return {parents,queue};
}

/** Headroom is measured above the existing floor, including at the lakes.
 * Galleries follow connected ground, so they keep the saved routes intact. */
export function realmCaverns(map:RealmMap):Caverns{
  const cached=plans.get(map);
  if(cached)return cached;
  const {width,height,seed,biomes}=map;
  const clearance=new Uint8Array(biomes.length),room=new Int8Array(biomes.length).fill(-1);
  const chambers:Chamber[]=[],galleries:number[][]=[];
  const quay=map.towns.find(town=>town.berth!==undefined);
  const start=quay?.index??map.links[0]?.cell??biomes.findIndex((_,cell)=>realmWalkable(map,cell,0));
  const radius=Math.max(4,Math.min(14,Math.min(width,height)*.135));
  function chamber(name:string,cell:number,entrance=cell){
    const stretch=terrainHash(cell,17,seed);
    chambers.push({name,cell,entrance,rx:radius*(1.18+stretch*.58),ry:radius*(1.3-stretch*.35),
      vault:72+Math.round(terrainHash(cell,53,seed)*24)});
  }
  if(start>=0){
    const {parents,queue}=passageTree(map,start);
    if(quay?.berth!==undefined){
      const water=[quay.berth],seen=new Set(water);
      let pool=quay.berth,best=-1;
      for(const cell of water){
        const distance=separation(map,quay.berth,cell);
        const neighbors=seaNeighbors(cell,width,biomes.length);
        const score=neighbors.filter(next=>biomes[next]===sea).length+distance/radius*.6+terrainHash(cell,13,seed)*.35;
        if(score>best){best=score;pool=cell;}
        if(distance>=radius*.72)continue;
        for(const next of neighbors)if(biomes[next]===sea&&!seen.has(next)){
          seen.add(next);water.push(next);
        }
      }
      chamber('Buried Sea Vault',pool,quay.index);
    }
    const recipes=[['Glowroot Chamber',[glowroot]],['Crystal Vault',[crystal]],['Thermal Hall',[steam,ember]]] as const;
    const structures=new Set([...map.towns.map(town=>town.index),...map.links.map(link=>link.cell)]);
    for(const [name,habitat] of recipes){
      let cell=-1,best=-Infinity;
      for(const candidate of queue){
        const {x,y}=seaPoint(width,candidate),kind=biomes[candidate];
        if(x<3||y<3||x>width-4||y>height-4||structures.has(candidate)||
          !habitat.some(biome=>biome===kind))continue;
        const gap=Math.min(radius*3,...chambers.map(site=>separation(map,site.cell,candidate)));
        if(gap<radius*1.65)continue;
        const same=seaNeighbors(candidate,width,biomes.length).filter(next=>biomes[next]===kind).length;
        const score=same*.7+gap/radius+terrainHash(x,y,seed+741)*1.2;
        if(score>best){cell=candidate;best=score;}
      }
      if(cell>=0)chamber(name,cell);
    }
    for(const {entrance} of chambers){
      if(entrance===start)continue;
      const path=[entrance];
      for(let cell=entrance;cell!==start;){cell=parents[cell];path.push(cell);}
      galleries.push(path);
    }
  }
  const galleriesByCell=new Set(galleries.flat());
  const centers=chambers.map(site=>seaPoint(width,site.cell));
  for(let cell=0;cell<clearance.length;cell++){
    const {x,y}=seaPoint(width,cell);
    const grain=terrainNoise(x,y,5.6,seed+592);
    let headroom=(galleriesByCell.has(cell)?29:23)+grain*9;
    for(const [id,site] of chambers.entries()){
      const center=centers[id];
      const distance=Math.hypot((x-center.x)/site.rx,(y-center.y)/site.ry)+grain*.24;
      const arch=site.vault*Math.max(0,1-distance**2);
      if(arch<=headroom)continue;
      headroom=arch;room[cell]=id;
    }
    clearance[cell]=Math.max(18,Math.round(headroom/2)*2);
  }
  const plan={clearance,room,chambers,galleries};plans.set(map,plan);
  return plan;
}

export const caveRoomName=(plan:Caverns,cell:number)=>
  plan.chambers[plan.room[cell]]?.name??'Low galleries';

/** Only put an opening over compatible geology. Neither inspection nor
 * rendering creates portals or changes the simulation's drainage. */
export function caveConnections(world:World,map:RealmMap,plan:Caverns):CaveConnection[]{
  const {heights}=topographyForWorld(world),{channel,pondDepth}=hydrologyForWorld(world);
  const connections:CaveConnection[]=[];
  for(const link of map.links.filter(link=>link.kind==='crater').slice(0,2)){
    let cell=-1,best=Infinity;
    for(let i=0;i<map.biomes.length;i++){
      if(map.biomes[i]!==lava)continue;
      const distance=separation(map,link.cell,i);
      if(distance<best){cell=i;best=distance;}
    }
    connections.push({kind:'fault',surface:link.surface,cell:best<7?cell:link.cell});
  }
  let seep:CaveConnection|undefined,skylight:CaveConnection|undefined,wetScore=-Infinity,lightScore=-Infinity;
  const occupied=new Set([...map.roads,...map.houses.keys(),...map.links.map(link=>link.cell),
    ...map.towns.flatMap(town=>town.berth===undefined?[town.index]:[town.index,town.berth])]);
  const settlements=new Set(world.settlements.map(site=>site.y*world.width+site.x));
  const falls=new Set(map.links.filter(link=>link.kind==='falls').map(link=>link.surface));
  const pool=(cell:number)=>map.biomes[cell]===sea&&!occupied.has(cell);
  for(let surface=0;surface<world.tiles.length;surface++){
    const {biome}=world.tiles[surface];
    if(biome==='water'||biome==='volcanic')continue;
    const cell=projectWorldLayer(surface,world,map),kind=map.biomes[cell];
    const roll=terrainHash(surface,142,map.seed),headroom=plan.clearance[cell];
    if(channel[surface]>0||falls.has(surface)){
      const outlet=pool(cell)?cell:seaNeighbors(cell,map.width,map.biomes.length).find(pool);
      if(outlet!==undefined&&connections.every(site=>separation(map,site.cell,outlet)>=3)){
        const score=channel[surface]*2+plan.clearance[outlet]*.05+roll+(outlet===cell?2:0);
        if(score>wetScore){wetScore=score;seep={kind:'seep',surface,cell:outlet};}
      }
    }
    if(occupied.has(cell)||connections.some(site=>separation(map,site.cell,cell)<3))continue;
    if(headroom<42||kind!==crystal&&kind!==glowroot||channel[surface]>0||
      biome==='forest'||biome==='taiga'||biome==='wetland'||settlements.has(surface)||falls.has(surface))continue;
    const dip=seaNeighbors(surface,world.width,heights.length).filter(next=>next>=0)
      .reduce((sum,next)=>sum+Math.max(0,heights[next]-heights[surface]),0);
    const score=dip*.7+pondDepth[surface]*.5-Math.abs(heights[surface]-(SEA_LEVEL+9))*.055+roll;
    if(score>lightScore){lightScore=score;skylight={kind:'skylight',surface,cell};}
  }
  if(seep)connections.push(seep);
  if(skylight)connections.push(skylight);
  return connections;
}
