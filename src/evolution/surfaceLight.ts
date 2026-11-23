import {SEA_LEVEL,topographyForWorld,type Topography} from './topography';
import type {TerrainSource} from './terrainCells';

export const LEVEL_LIGHT=8;
const cache=new WeakMap<Topography,Uint8Array>();

/** The sun comes from the north-west. Sweep three horizons across the
 * heightfield so ridges can shade valleys and water in linear time. */
export function surfaceLight(world:TerrainSource):Uint8Array{
  const terrain=topographyForWorld(world),cached=cache.get(terrain);
  if(cached)return cached;
  const {width,height,tiles}=world,{heights}=terrain;
  const size=width*height,light=new Uint8Array(size);
  const diagonal=new Int16Array(size),west=new Int16Array(size),north=new Int16Array(size);
  const level=(i:number)=>tiles[i]?.biome==='water'?Math.max(SEA_LEVEL-9,heights[i]):heights[i];
  for(let y=0,i=0;y<height;y++)for(let x=0;x<width;x++,i++){
    const z=level(i),flat=tiles[i].biome==='water';
    const up=y?level(i-width):z,left=x?level(i-1):z;
    const south=y+1<height?level(i+width):z,east=x+1<width?level(i+1):z;
    const nw=x&&y?diagonal[i-width-1]-23:z;
    const w=x?west[i-1]-17:z,n=y?north[i-width]-19:z;
    diagonal[i]=Math.max(nw,z);west[i]=Math.max(w,z);north[i]=Math.max(n,z);
    const shadow=Math.min(6,Math.max(0,nw-z)*.10+Math.max(0,w-z)*.047+Math.max(0,n-z)*.035);
    const slope=flat?0:Math.max(-4.5,Math.min(5,(east-left)*.15+(south-up)*.115));
    const enclosure=flat?0:Math.max(0,Math.min(2,((up+left+south+east)/4-z-2)*.17));
    light[i]=Math.max(0,Math.min(16,Math.round(LEVEL_LIGHT+slope-shadow-enclosure)));
  }
  cache.set(terrain,light);
  return light;
}
