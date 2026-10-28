/** v2.0 — physical geography shared by travel and settlement economics.
 * The legacy default is deliberately neutral: importing an old world must
 * not silently make a previously valid journey impossible.
 */
import type {World} from './engine';
import {hydrologyForWorld} from './hydrology';
import {topographyForWorld} from './topography';

export type TerrainPhysics={version:1};
export const TERRAIN_PHYSICS_VERSION=1;
export const hasPhysicalTerrain=(w:Pick<World,'terrainPhysics'>)=>
  w.terrainPhysics?.version===TERRAIN_PHYSICS_VERSION;

/** Turn on new terrain rules without changing existing agent positions,
 * history, RNG or biomes. Legacy heightfields are materialized exactly once.
 */
export function enablePhysicalTerrain(world:World):World{
  if(hasPhysicalTerrain(world))return world;
  return {...world,topography:topographyForWorld(world),
    terrainPhysics:{version:TERRAIN_PHYSICS_VERSION}};
}

/** Adjacent climb cost; existing flat-rule saves retain a neutral multiplier.
 * Steep ascents become significantly harder, but no historic route is hard-
 * blocked: old infrastructure and populated cliffside tiles remain usable.
 */
export function terrainStepEffort(w:World,from:number,to:number):number{
  if(!hasPhysicalTerrain(w)||from===to||from<0||to<0||
    from>=w.tiles.length||to>=w.tiles.length)return 1;
  const heights=topographyForWorld(w).heights;
  const difference=heights[to]-heights[from];
  const steep=Math.abs(difference);
  return 1+steep/180+Math.max(0,difference)/60;
}

/** Highest surrounding drop/rise: a proxy for construction difficulty. */
export function terrainRuggedness(w:World,index:number):number{
  if(!hasPhysicalTerrain(w)||index<0||index>=w.tiles.length)return 0;
  const h=topographyForWorld(w).heights,from=h[index];
  const x=index%w.width,y=Math.floor(index/w.width);
  let maximum=0;
  if(x>0)maximum=Math.max(maximum,Math.abs(from-h[index-1]));
  if(x<w.width-1)maximum=Math.max(maximum,Math.abs(from-h[index+1]));
  if(y>0)maximum=Math.max(maximum,Math.abs(from-h[index-w.width]));
  if(y<w.height-1)maximum=Math.max(maximum,Math.abs(from-h[index+w.width]));
  return maximum;
}

/** Cultivation reacts to actual slopes, altitude and derived surface runoff.
 * Creeks irrigate land; they never magically become ship-navigable water.
 */
export function terrainFarmFactor(w:World,index:number):number{
  if(!hasPhysicalTerrain(w))return 1;
  const height=topographyForWorld(w).heights[index];
  const rugged=terrainRuggedness(w,index);
  const creek=hydrologyForWorld(w).channel[index];
  const altitudePenalty=Math.max(0,height-125)/350;
  const slopePenalty=Math.min(.38,rugged/180);
  const irrigation=creek>0?.13:0;
  return Math.max(.48,Math.min(1.18,1-altitudePenalty-slopePenalty+irrigation));
}

export function terrainBuildPenalty(w:World,index:number):number{
  if(!hasPhysicalTerrain(w))return 0;
  return Math.min(7,terrainRuggedness(w,index)/12);
}
