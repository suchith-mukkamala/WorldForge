/** v2.1.5.2 — simulation-only spatial indexes.
 * Replace repeated scans of every mortal × every settlement / well with
 * fixed-radius lookups on the authoritative tile grid. Exact Chebyshev
 * neighborhoods, no changes to RNG, capacities, or gameplay distance.
 */
export type GridPoint={x:number;y:number};

export function occupancyCounts(width:number,height:number,
  people:readonly GridPoint[]):Uint32Array{
  const counts=new Uint32Array(width*height);
  for(const person of people){
    if(person.x>=0&&person.y>=0&&person.x<width&&person.y<height)
      counts[person.y*width+person.x]++;
  }
  return counts;
}
export function residentsNear(counts:Uint32Array,width:number,
  height:number,at:GridPoint,radius:number):number{
  let total=0;
  for(let y=Math.max(0,at.y-radius);y<=Math.min(height-1,at.y+radius);y++)
    for(let x=Math.max(0,at.x-radius);x<=Math.min(width-1,at.x+radius);x++)
      total+=counts[y*width+x];
  return total;
}
export function markNeighborhood(mask:Uint8Array,width:number,
  height:number,at:GridPoint,radius:number):void{
  for(let y=Math.max(0,at.y-radius);y<=Math.min(height-1,at.y+radius);y++)
    mask.fill(1,y*width+Math.max(0,at.x-radius),
      y*width+Math.min(width-1,at.x+radius)+1);
}
export function neighborhoodMask(width:number,height:number,
  positions:readonly GridPoint[],radius:number):Uint8Array{
  const mask=new Uint8Array(width*height);
  for(const position of positions)
    markNeighborhood(mask,width,height,position,radius);
  return mask;
}
