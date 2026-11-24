export const OCEAN_TONES=[
  '#163142','#469b9a','#327f89','#286578','#215064','#193b51',
] as const;

/** Distance to the nearest actual shore, clamped to the deepest water band.
 * It is presentation data derived from the simulation's existing tile grid. */
export function coastalDepth(width:number,height:number,
  isWater:(index:number)=>boolean):Uint8Array{
  const deepest=OCEAN_TONES.length-1,count=width*height;
  const depths=new Uint8Array(count).fill(deepest);
  const queue=new Int32Array(count);
  let tail=0;
  for(let i=0;i<count;i++)if(!isWater(i)){
    depths[i]=0;
    queue[tail++]=i;
  }
  for(let head=0;head<tail;head++){
    const i=queue[head],nextDepth=depths[i]+1,x=i%width;
    if(nextDepth>=deepest)continue;
    for(const next of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width]){
      if(next<0||next>=count||depths[next]!==deepest)continue;
      depths[next]=nextDepth;
      queue[tail++]=next;
    }
  }
  return depths;
}

type Coast={width:number;height:number;tiles:readonly {biome:string}[]};
const surfaceDepths=new WeakMap<Coast['tiles'],{width:number;height:number;depths:Uint8Array}>();

/** Share depth bands between the atlas, its crops and coastal life. */
export function surfaceCoastalDepth({width,height,tiles}:Coast):Uint8Array{
  const saved=surfaceDepths.get(tiles);
  if(saved?.width===width&&saved.height===height)return saved.depths;
  const depths=coastalDepth(width,height,i=>tiles[i].biome==='water');
  surfaceDepths.set(tiles,{width,height,depths});
  return depths;
}
