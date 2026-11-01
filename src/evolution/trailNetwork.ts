/** Footprints are evidence of travel, not instant roads. Only sustained,
 * connected traffic draws a trail. Dense crowds are reduced to a thin route
 * rather than turning every settlement tile into pavement. Shared by the
 * simulation and renderer; no map zoom or UI state can change road outcomes. */
export const VISIBLE_TRAIL_WEAR=12;
export type WornTile={index:number;wear:number};

const RING=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]] as const;

export function wornPathTiles(trails:readonly WornTile[],width:number,
  height:number):Set<number>{
  const active=new Set<number>();
  for(const trail of trails)if(trail.wear>=VISIBLE_TRAIL_WEAR&&
    Number.isInteger(trail.index)&&trail.index>=0&&trail.index<width*height)
    active.add(trail.index);
  if(active.size<3)return new Set();
  const neighbors=(index:number)=>{
    const x=index%width,y=Math.floor(index/width);
    return RING.map(([dx,dy])=>x+dx>=0&&x+dx<width&&
      y+dy>=0&&y+dy<height?(y+dy)*width+x+dx:-1);
  };
  // Zhang-Suen-style thinning retains connected corridors but trims broad
  // eight-way footprints caused by many inhabitants sharing the same block.
  for(let iteration=0;iteration<32;iteration++){
    let changed=false;
    for(let pass=0;pass<2;pass++){
      const remove:number[]=[];
      for(const index of active){
        const ring=neighbors(index).map(n=>active.has(n)?1:0);
        const count=ring.reduce<number>((sum,n)=>sum+n,0);
        if(count<2||count>6)continue;
        let transitions=0;
        for(let n=0;n<8;n++)if(ring[n]===0&&ring[(n+1)%8]===1)
          transitions++;
        if(transitions!==1)continue;
        const [north,,east,,south,,west]=ring;
        if(pass===0){
          if(north&&east&&south||east&&south&&west)continue;
        }else if(north&&east&&west||north&&south&&west)continue;
        remove.push(index);
      }
      for(const index of remove)active.delete(index);
      changed ||=remove.length>0;
    }
    if(!changed)break;
  }
  // Discard isolated scuffs and one-off pairs. This also removes the single
  // surviving dot left when a dense town square shrinks to its center.
  const visited=new Set<number>(),result=new Set<number>();
  for(const start of active){
    if(visited.has(start))continue;
    const connected=[start];visited.add(start);
    for(let i=0;i<connected.length;i++)for(const next of neighbors(connected[i])){
      if(!active.has(next)||visited.has(next))continue;
      visited.add(next);connected.push(next);
    }
    if(connected.length>=3)for(const index of connected)result.add(index);
  }
  return result;
}
