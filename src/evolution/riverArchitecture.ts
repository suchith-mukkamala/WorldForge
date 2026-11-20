import type {Building} from './construction';
import type {World} from './engine';
import {riverCourses} from './riverCourses';
import {floodplains} from './riverSeasons';
import {terrainRuggedness} from './terrainPhysics';
import {topographyForWorld} from './topography';
import type {Point} from './motion';

export type RegionalBuildingStyle='stilts'|'terraces'|'riverside'|'fishery';
export const terrainDistance=(width:number,index:number,p:Point)=>
  Math.max(Math.abs(index%width-p.x),Math.abs(Math.floor(index/width)-p.y));

export function nearbyFord(world:World,point:Point,radius=6):number|undefined{
  if(!world.settings.riverlands)return;
  return riverCourses(world).flatMap(river=>river.stops)
    .filter(stop=>stop.kind==='ford').map(stop=>stop.index)
    .filter(i=>terrainDistance(world.width,i,point)<=radius)
    .sort((a,b)=>terrainDistance(world.width,a,point)-terrainDistance(world.width,b,point))[0];
}

export function nearbyDelta(world:World,point:Point,radius=5):number|undefined{
  if(!world.settings.riverlands)return;
  return riverCourses(world).find(river=>river.delta&&
    terrainDistance(world.width,river.mouth,point)<=radius)?.mouth;
}

export function deltaStart(world:World,home:Point,otherHomes:readonly Point[]):Point|undefined{
  if(!world.settings.riverlands)return;
  const candidate=riverCourses(world).filter(r=>r.delta&&
    otherHomes.every(p=>terrainDistance(world.width,r.mouth,p)>6))
    .sort((a,b)=>terrainDistance(world.width,a.mouth,home)-terrainDistance(world.width,b.mouth,home))[0];
  return candidate&&{x:candidate.mouth%world.width,y:Math.floor(candidate.mouth/world.width)};
}

export function terraceSite(world:World,index:number):boolean{
  if(!world.settings.riverlands)return false;
  const biome=world.tiles[index].biome;
  if(!['plains','forest','mountain','taiga'].includes(biome))return false;
  const height=topographyForWorld(world).heights[index],slope=terrainRuggedness(world,index);
  return height>=93&&height<168&&slope>=7&&slope<=29;
}

export function boardwalkSite(world:World,index:number):boolean{
  return world.tiles[index]?.biome==='wetland'||
    !!world.settings.riverlands&&floodplains(world)[index]===1;
}

export function regionalBuildingStyle(world:World,building:Building):RegionalBuildingStyle|undefined{
  const i=building.y*world.width+building.x;
  if((building.type==='house'||building.type==='shelter')&&boardwalkSite(world,i))return 'stilts';
  if(building.type==='farm'&&terraceSite(world,i))return 'terraces';
  if(building.type==='market'&&nearbyFord(world,building,3)!==undefined)return 'riverside';
  if(building.type==='dock'&&nearbyDelta(world,building,4)!==undefined)return 'fishery';
}
