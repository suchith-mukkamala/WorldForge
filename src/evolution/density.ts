/** Bounded local population density. Wilderness remains single-occupancy;
 * settled land can host households and crowds without a global headcount cap.
 * The capacity is derived from the physical world, not from playback/zoom.
 * Do not lower occupancy when individual houses wear out: a town's communal
 * space still exists, and forced crowding invalidated healthy old saves.
 */
import type {Agent,World} from './engine';

export function tileCapacity(w:Pick<World,'width'|'height'|'tiles'|'settlements'>):Uint8Array{
  const capacity=new Uint8Array(w.width*w.height).fill(1);
  for(const settlement of w.settlements){
    if(!settlement||!Number.isInteger(settlement.x)||
      !Number.isInteger(settlement.y))continue;
    // Space for extended families and shared public areas; an individual
    // household's shelter availability is tracked by construction separately.
    const residential=2;
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
      const x=settlement.x+dx,y=settlement.y+dy;
      if(x<0||y<0||x>=w.width||y>=w.height)continue;
      const index=y*w.width+x;
      if(w.tiles[index].biome==='water')continue;
      const density=Math.max(Math.abs(dx),Math.abs(dy))<=2?
        residential+1:residential;
      capacity[index]=Math.max(capacity[index],density);
    }
  }
  return capacity;
}

export function residentIndex(people:Agent[],width:number):Map<number,number[]>{
  const index=new Map<number,number[]>();
  for(const a of people){
    const position=a.y*width+a.x;
    const residents=index.get(position);
    if(residents)residents.push(a.id);
    else index.set(position,[a.id]);
  }
  return index;
}

/** Update a resident index without discarding co-located inhabitants. */
export function removeResident(index:Map<number,number[]>,tile:number,id:number):void{
  const residents=index.get(tile);
  if(!residents)return;
  const at=residents.indexOf(id);
  if(at>=0)residents.splice(at,1);
  if(!residents.length)index.delete(tile);
}
export function addResident(index:Map<number,number[]>,tile:number,id:number):void{
  const residents=index.get(tile);
  if(residents)residents.push(id);
  else index.set(tile,[id]);
}

/** Natural geography already limits settlement count; do not impose 54. */
export function settlementSafetyLimit(w:Pick<World,'width'|'height'>):number{
  return Math.max(54,Math.ceil(w.width*w.height/100));
}
