/** v1.9.3 — deterministic, presentation-only drainage foundations.
 *
 * A priority flood connects every land cell to an existing water tile or a
 * world edge, even across a closed depression. Reverse traversal then counts
 * contributing cells and identifies visible streams. No terrain biomes or
 * travel rules are changed; this is derived from the persisted heightfield.
 */
import type {Tile,World} from './engine';
import {topographyForWorld} from './topography';

export type Hydrology={
  /** Index of the next downhill/spill cell, or -1 at an outlet. */
  flowTo:Int32Array;
  /** Number of cells contributing to this cell, including itself. */
  catchment:Uint32Array;
  /** Shared receiving water body or world-edge outlet ID. */
  basin:Int32Array;
  /** 0=none, 1=creek, 2=stream, 3=river (display only). */
  channel:Uint8Array;
  /** Filled minus original height: potential ponding, not actual water. */
  pondDepth:Uint8Array;
};
type Geography=Pick<World,'width'|'height'|'tiles'|'settings'> &
  Partial<Pick<World,'topography'>>;
type Entry={index:number;level:number;tie:number};

/** A small, stable binary heap; height takes precedence over seeded ties. */
class MinHeap{
  private values:Entry[]=[];
  get length(){return this.values.length;}
  private less(a:Entry,b:Entry){
    return a.level<b.level||a.level===b.level&&
      (a.tie<b.tie||a.tie===b.tie&&a.index<b.index);
  }
  push(item:Entry){
    const a=this.values;let i=a.length;a.push(item);
    while(i>0){
      const p=(i-1)>>>1;if(!this.less(item,a[p]))break;
      a[i]=a[p];i=p;
    }
    a[i]=item;
  }
  pop():Entry{
    const a=this.values,first=a[0],last=a.pop()!;
    if(a.length){
      let i=0;
      while(i*2+1<a.length){
        const l=i*2+1,r=l+1;
        const child=r<a.length&&this.less(a[r],a[l])?r:l;
        if(!this.less(a[child],last))break;
        a[i]=a[child];i=child;
      }
      a[i]=last;
    }
    return first;
  }
}

const tieFor=(index:number,seed:number)=>{
  let value=(index^seed^0x9e3779b9)>>>0;
  value=Math.imul(value^(value>>>16),0x7feb352d);
  value=Math.imul(value^(value>>>15),0x846ca68b);
  return (value^(value>>>16))>>>0;
};
const directions=[[-1,0],[0,-1],[1,0],[0,1],
  [-1,-1],[1,-1],[1,1],[-1,1]] as const;

export function generateHydrology(width:number,height:number,
  heights:readonly number[],tiles:readonly Pick<Tile,'biome'>[],seed:number):Hydrology{
  const size=width*height;
  if(width<1||height<1||heights.length!==size||tiles.length!==size)
    throw new Error('Hydrology dimensions do not match the terrain');
  const flowTo=new Int32Array(size).fill(-1);
  const catchment=new Uint32Array(size).fill(1);
  const basin=new Int32Array(size).fill(-1);
  const channel=new Uint8Array(size),pondDepth=new Uint8Array(size);
  const seen=new Uint8Array(size),filled=new Uint16Array(size);
  const heap=new MinHeap(),ordered:number[]=[];
  const index=(x:number,y:number)=>y*width+x;

  // Connected pre-existing water belongs to one receiving body. It remains
  // the authoritative water biome; new visual streams never replace it.
  for(let i=0;i<size;i++)if(tiles[i].biome==='water'&&basin[i]===-1){
    const group=i,queue=[i];basin[i]=group;
    for(let head=0;head<queue.length;head++){
      const cur=queue[head],x=cur%width,y=Math.floor(cur/width);
      for(const [dx,dy] of directions){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const next=index(nx,ny);
        if(tiles[next].biome==='water'&&basin[next]===-1){
          basin[next]=group;queue.push(next);
        }
      }
    }
  }

  // Ocean/lake cells and map boundaries are outlets. Every non-outlet is
  // discovered from an already-visited lower spill level, so cycles cannot
  // form (even on flat maps and in basins with no directly downhill exit).
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=index(x,y);
    if(tiles[i].biome!=='water'&&x>0&&y>0&&x<width-1&&y<height-1)
      continue;
    seen[i]=1;filled[i]=heights[i];
    if(basin[i]===-1)basin[i]=i;
    heap.push({index:i,level:filled[i],tie:tieFor(i,seed)});
  }
  while(heap.length){
    const {index:i,level}=heap.pop();ordered.push(i);
    const x=i%width,y=Math.floor(i/width);
    for(const [dx,dy] of directions){
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=width||ny>=height)continue;
      const next=index(nx,ny);
      if(seen[next])continue;
      seen[next]=1;
      const spill=Math.max(level,heights[next]);
      filled[next]=spill;
      pondDepth[next]=Math.min(255,Math.max(0,spill-heights[next]));
      flowTo[next]=i;
      basin[next]=basin[i];
      heap.push({index:next,level:spill,tie:tieFor(next,seed)});
    }
  }
  // The receiver always precedes the donor in `ordered`.
  for(let j=ordered.length-1;j>=0;j--){
    const i=ordered[j],next=flowTo[i];
    if(next!==-1)catchment[next]+=catchment[i];
  }
  const threshold=Math.max(24,Math.floor(Math.sqrt(size)*.38));
  for(let i=0;i<size;i++){
    if(tiles[i].biome==='water'||flowTo[i]<0||catchment[i]<threshold)
      continue;
    const sizeRatio=catchment[i]/threshold;
    channel[i]=sizeRatio>=8?3:sizeRatio>=3?2:1;
  }
  return {flowTo,catchment,basin,channel,pondDepth};
}

const cache=new WeakMap<object,Hydrology>();
const legacyCache=new Map<string,{biomes:string[];drainage:Hydrology}>();
/** Cached per immutable heightfield. Annual/day ticks reuse the same result;
 * terrain brush edits replace the heightfield and invalidate this naturally.
 * Missing legacy topography is reconstructed without mutating the save.
 */
export function hydrologyForWorld(world:Geography):Hydrology{
  // Pre-v1.9 worlds may recreate their tile array on every tick without ever
  // saving a heightfield. Reuse drainage if the exact biome sequence matches,
  // and bound the small compatibility cache for users switching worlds.
  const legacyKey=!world.topography?
    `${world.settings.seed}:${world.width}:${world.height}`:null;
  if(legacyKey){
    const previous=legacyCache.get(legacyKey);
    if(previous&&previous.biomes.length===world.tiles.length&&
      world.tiles.every((t,i)=>t.biome===previous.biomes[i]))
      return previous.drainage;
  }
  const topography=topographyForWorld(world);
  const saved=cache.get(topography);
  if(saved)return saved;
  const generated=generateHydrology(world.width,world.height,topography.heights,
    world.tiles,world.settings.seed);
  cache.set(topography,generated);
  if(legacyKey){
    legacyCache.delete(legacyKey);
    legacyCache.set(legacyKey,{biomes:world.tiles.map(t=>t.biome),drainage:generated});
    if(legacyCache.size>4)legacyCache.delete(legacyCache.keys().next().value!);
  }
  return generated;
}
