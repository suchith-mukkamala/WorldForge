/** v1.9.1 — seeded, persistent land elevation for future physical geography.
 * Elevation is relative (0..255), not yet metres or a movement restriction.
 * Pure noise never consumes the simulation RNG or changes existing biographies.
 * Old saves without topography can display deterministic legacy heights.
 */
import type {Biome,Tile,World} from './engine';

export const TOPOGRAPHY_VERSION=1 as const;
export const SEA_LEVEL=48;
export type Topography={version:typeof TOPOGRAPHY_VERSION;heights:number[]};
type Geography=Pick<World,'width'|'height'|'tiles'|'settings'> &
  Partial<Pick<World,'topography'>>;

const base:Record<Biome,number>={
  water:38,plains:87,forest:99,mountain:174,cave:149,
  wasteland:113,volcanic:185,
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const hash=(x:number,y:number,seed:number)=>{
  let v=(seed^Math.imul(x,374761393)^Math.imul(y,668265263))>>>0;
  v=Math.imul(v^(v>>>13),1274126177);
  return ((v^(v>>>16))>>>0)/4294967295;
};
const smooth=(v:number)=>v*v*(3-2*v);
function noise(x:number,y:number,scale:number,seed:number):number{
  const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy);
  const sx=smooth(fx-ix),sy=smooth(fy-iy);
  const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed);
  const c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);
  return ((a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy)*2-1;
}
export function generateTopography(width:number,height:number,
    tiles:readonly Pick<Tile,'biome'>[],seed:number):Topography{
  const heights=new Array<number>(width*height);
  const at=(x:number,y:number):Biome|undefined=>x<0||y<0||
    x>=width||y>=height?undefined:tiles[y*width+x]?.biome;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const biome=at(x,y)!;
    if(biome==='water'){heights[y*width+x]=SEA_LEVEL-9;continue;}
    const ridge=noise(x,y,32,seed+17)*17+
      noise(x,y,12,seed+59)*11+noise(x,y,5,seed+107)*5;
    let heightValue=base[biome]+ridge;
    // Transition shorelines gently for most biomes. Explicit mountainous
    // shores can still form cliffs; rock walls are future physics content.
    if(biome!=='mountain'&&biome!=='volcanic'&&biome!=='cave'){
      let nearest=4;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        if(at(x+dx,y+dy)==='water')
          nearest=Math.min(nearest,Math.max(Math.abs(dx),Math.abs(dy)));
      }
      if(nearest===1)heightValue=Math.min(heightValue,67);
      else if(nearest===2)heightValue=Math.min(heightValue,80);
    }
    heights[y*width+x]=Math.round(clamp(heightValue,SEA_LEVEL,250));
  }
  return {version:TOPOGRAPHY_VERSION,heights};
}
const legacyCache=new WeakMap<World['tiles'],Topography>();
/** Returns the saved topography if present, or a deterministic, cached
 * reconstruction for pre-v1.9 worlds. It never modifies a loaded world.
 */
export function topographyForWorld(world:Geography):Topography{
  if(world.topography)return world.topography;
  const cached=legacyCache.get(world.tiles);
  if(cached)return cached;
  const generated=generateTopography(world.width,world.height,
    world.tiles,world.settings.seed);
  legacyCache.set(world.tiles,generated);
  return generated;
}
export function elevationAt(world:Geography,x:number,y:number):number|null{
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||
    x>=world.width||y>=world.height)return null;
  return topographyForWorld(world).heights[y*world.width+x];
}
export function validTopography(value:unknown,width:number,height:number):
    value is Topography{
  if(!value||typeof value!=='object')return false;
  const t=value as Partial<Topography>;
  return t.version===TOPOGRAPHY_VERSION&&Array.isArray(t.heights)&&
    t.heights.length===width*height&&
    t.heights.every(h=>Number.isInteger(h)&&h>=0&&h<=255);
}
