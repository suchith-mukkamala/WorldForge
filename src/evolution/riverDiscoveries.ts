import {worldTreeBlocksBuilding} from './worldTree';
import type {World} from './engine';
import type {AncientSite,Topic} from './knowledge';
import type {LandformKind,LandformSite} from './riverLandforms';
import {riverCourses,type RiverStopKind} from './riverCourses';

export const RIVER_DISCOVERIES=['hidden-spring','broken-bridge','waterfall-cave'] as const;
export type RiverDiscovery=typeof RIVER_DISCOVERIES[number];
export const isRiverDiscovery=(kind:string):kind is RiverDiscovery=>
  (RIVER_DISCOVERIES as readonly string[]).includes(kind);
export const NATURAL_LANDMARKS=['glacial-lake','canyon','caldera','barrier-islands'] as const satisfies readonly LandformKind[];
export const visibleAtlasSite=(world:Pick<World,'descent'>,site:AncientSite):boolean=>
  !isRiverDiscovery(site.kind)||!!world.descent?.surveys?.some(entry=>entry.siteId===site.id);

const entries:Record<LandformKind|RiverDiscovery,{name:string;topic:Topic;danger:number}>={
  'glacial-lake':{name:'Glacial lake overlook',topic:'navigation',danger:9},
  canyon:{name:'River canyon',topic:'stonecraft',danger:14},
  caldera:{name:'Volcanic caldera',topic:'metallurgy',danger:16},
  'barrier-islands':{name:'Barrier island shore',topic:'navigation',danger:8},
  'hidden-spring':{name:'Hidden spring',topic:'herbalism',danger:7},
  'broken-bridge':{name:'Ruined river bridge',topic:'engineering',danger:13},
  'waterfall-cave':{name:'Cave behind the waterfall',topic:'stonecraft',danger:21},
};

/** Put survey sites on dry approaches. The underlying cave, river and lake
 * are drawn by the world instead of being replaced by a marker icon. */
export function addRiverLandmarks(world:World,landforms:readonly LandformSite[]):void{
  const sites=world.ancientSites??=[];
  const occupied=new Set(sites.map(s=>s.y*world.width+s.x));
  const add=(kind:LandformKind|RiverDiscovery,anchor:number,bank=false)=>{
    const x=anchor%world.width,y=Math.floor(anchor/world.width);
    const corners=bank?[[1,0],[0,1],[-1,0],[0,-1],[0,0]]:[[0,0],[1,0],[0,1],[-1,0],[0,-1]];
    for(const [dx,dy] of corners){
      const nx=x+dx,ny=y+dy,i=ny*world.width+nx;
      if(nx<0||ny<0||nx>=world.width||ny>=world.height||
        occupied.has(i)||worldTreeBlocksBuilding(world.worldTree,nx,ny)||world.tiles[i].biome==='water')continue;
      sites.push({kind,id:sites.length+1,x:nx,y:ny,...entries[kind],
        origin:'ancient',visitors:[],visits:0,recovered:0});
      occupied.add(i);return;
    }
  };
  for(const feature of landforms)add(feature.kind,feature.y*world.width+feature.x);
  const courses=riverCourses(world);
  const point=(kind:RiverStopKind)=>courses.flatMap(course=>course.stops)
    .find(stop=>stop.kind===kind)?.index;
  const spring=point('source'),bridge=point('ford'),cave=point('falls');
  if(spring!==undefined)add('hidden-spring',spring,true);
  if(bridge!==undefined)add('broken-bridge',bridge,true);
  if(cave!==undefined)add('waterfall-cave',cave,true);
}
