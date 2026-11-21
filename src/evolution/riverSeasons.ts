import type {World} from './engine';
import {hydrologyForWorld,type Hydrology} from './hydrology';
import {visualSeason} from './sceneAtmosphere';
import {SEA_LEVEL,topographyForWorld} from './topography';

export const waterSeason=(world:Pick<World,'dayOfYear'>)=>visualSeason(world.dayOfYear??0);

type WaterwayLand=Pick<World,'width'|'height'|'tiles'|'settings'|'topography'|'dayOfYear'>;
export type RiverLink={dx:number;dy:number;tier:number;other:number};
export const bankSides=[{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0}] as const;
export const DOCK_BANK_DROP=28;
const linkCache=new WeakMap<Hydrology,Map<number,RiverLink[]>>();
export function riverLinks(world:WaterwayLand):ReadonlyMap<number,readonly RiverLink[]>{
  const drainage=hydrologyForWorld(world),cached=linkCache.get(drainage);
  if(cached)return cached;
  const links=new Map<number,RiverLink[]>(),{width}=world;
  const add=(from:number,other:number,tier:number)=>{
    const list=links.get(from)??[];
    list.push({dx:other%width-from%width,
      dy:Math.floor(other/width)-Math.floor(from/width),tier,other});
    links.set(from,list);
  };
  for(let i=0;i<drainage.channel.length;i++){
    const tier=drainage.channel[i],next=drainage.flowTo[i];
    if(!tier||next<0)continue;
    add(i,next,tier);add(next,i,tier);
  }
  linkCache.set(drainage,links);
  return links;
}

export function riverBank(world:WaterwayLand,index:number){
  const {width,height,tiles}=world,x=index%width,y=Math.floor(index/width);
  const links=riverLinks(world),heights=topographyForWorld(world).heights;
  let best=-Infinity,bank:typeof bankSides[number]|undefined;
  for(const side of bankSides){
    const nx=x+side.x,ny=y+side.y,near=ny*width+nx;
    if(nx<0||nx>=width||ny<0||ny>=height||tiles[near].biome==='water')continue;
    for(const link of links.get(near)??[]){
      const score=link.tier*4+Math.max(0,-side.x*link.dx-side.y*link.dy)*2-
        Math.abs(heights[index]-heights[near]);
      if(score>best){best=score;bank=side;}
    }
  }
  return bank;
}

const floodCache=new WeakMap<Hydrology,Uint8Array>();
/** Floodwater reaches low, unobstructed riverbanks. Real coastlines and
 * permanent water bodies are still governed by the world tiles. */
export function floodplains(world:WaterwayLand):Uint8Array{
  const drainage=hydrologyForWorld(world),cached=floodCache.get(drainage);
  if(cached)return cached;
  const {width,height,tiles}=world,heights=topographyForWorld(world).heights;
  const flood=new Uint8Array(tiles.length);
  for(let i=0;i<tiles.length;i++){
    if(drainage.channel[i]<2||heights[i]>SEA_LEVEL+44)continue;
    const x=i%width,y=Math.floor(i/width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx<0||nx>=width||ny<0||ny>=height)continue;
      const n=ny*width+nx,delta=heights[n]-heights[i];
      if(tiles[n].biome!=='water'&&delta>=-4&&delta<=4)flood[n]=1;
    }
  }
  floodCache.set(drainage,flood);
  return flood;
}

export function springFlood(world:WaterwayLand,index:number):boolean{
  return !!world.settings.riverlands&&waterSeason(world)==='Bloom'&&floodplains(world)[index]===1;
}
