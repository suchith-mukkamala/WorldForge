/** v2.05 — visual space is continuous even though ecological occupancy remains
 * tile-indexed. Each mortal has an individual, deterministic destination
 * inside the tile, with short meanders as their world day advances.
 * Never consume the simulation RNG or persist renderer-only coordinates.
 */
import type {Agent,World} from './engine';
import type {Point} from './motion';

const hash=(id:number,salt:number)=>{
  let n=(Math.imul(id,0x9e3779b1)^Math.imul(salt,0x85ebca6b))>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return ((n^(n>>>16))>>>0)/4294967295;
};
/** The position is within the actual walkable tile, with more spatial freedom
 * than a shared cell center or one of a few preassigned drawing slots. */
export function mortalWorldPoint(a:Pick<Agent,'id'|'x'|'y'>,
  date:Pick<World,'year'|'dayOfYear'>):Point{
  const day=date.year*365+(date.dayOfYear??0);
  const phase=Math.floor(day/4);
  const salt=a.x*8191+a.y*131071;
  return {x:a.x+(hash(a.id,phase*37+salt)-.5)*.72,
    y:a.y+(hash(a.id+179,phase*53+salt)-.5)*.72};
}

/** Relative visual footprints, in compact isometric pixel-art units.
 * Terrain cells are 12×6 pixels, so structures can span several cells on
 * screen without consuming the neighboring simulation cells. */
export const DEPTH_FOOTPRINT={person:1,tree:2,building:4} as const;
