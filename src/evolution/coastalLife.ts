import {terrainHash,terrainNoise,terrainTemperature} from './biomeGeneration';
import {hydrologyForWorld,type Hydrology} from './hydrology';
import type {Point} from './motion';
import {coastalDepth} from './oceanDepth';
import {oceanBasins} from './regionalGeography';
import type {TerrainSource} from './terrainCells';

export type Fish={x:number;y:number;width:number;height:number;seed:number;color:string};
type FishPose=Point&{lift:number};
type CoastalLife={reefs:Uint8Array;fish:Fish[]};

const palette=['#ffd184','#f49c86','#ffb7cb','#96ebd9','#f5e4a0'];
const cache=new WeakMap<Hydrology,CoastalLife>();

/** Derive shoreline life from the saved map. It has no simulation state. */
export function coastalLife(world:TerrainSource):CoastalLife{
  const drainage=hydrologyForWorld(world),cached=cache.get(drainage);
  if(cached)return cached;
  const {width,height,tiles}=world,{seed}=world.settings;
  const depths=coastalDepth(width,height,i=>tiles[i].biome==='water');
  const sea=oceanBasins(world,drainage),reefs=new Uint8Array(tiles.length);
  const scale=Math.max(6,Math.min(width,height));
  const spacing=5,columns=Math.ceil(width/spacing);
  const anchors=new Map<number,{index:number;score:number}>();
  for(let i=0;i<tiles.length;i++){
    const depth=depths[i];
    if(depth<1||depth>2)continue;
    const x=i%width,y=Math.floor(i/width);
    if(sea.has(drainage.basin[i])&&terrainTemperature(x,y,scale,(y+.5)/height,seed)>.57&&
      terrainNoise(x,y,7,seed+2627)>-.23)reefs[i]=1;
    // One swimmer in each small stretch of shoreline, often near a reef.
    const key=Math.floor(y/spacing)*columns+Math.floor(x/spacing);
    const score=terrainHash(x,y,seed+6361)+reefs[i]*.46+(depth===1?.25:0);
    if(score>(anchors.get(key)?.score??-1))anchors.set(key,{index:i,score});
  }
  const fish:Fish[]=[];
  for(const {index} of anchors.values()){
    const x=index%width,y=Math.floor(index/width);
    const next=[x>0?index-1:-1,x+1<width?index+1:-1,index-width,index+width]
      .filter(i=>depths[i]>=1&&depths[i]<=3);
    const roll=terrainHash(x,y,seed+6367);
    const neighbor=next[Math.min(next.length-1,Math.floor(roll*next.length))]??index;
    const nx=neighbor%width,ny=Math.floor(neighbor/width);
    fish.push({x:Math.min(x,nx),y:Math.min(y,ny),width:Math.abs(nx-x)+1,height:Math.abs(ny-y)+1,
      seed:Math.imul(index+1,668265263)^seed,color:palette[Math.floor(roll*palette.length)%palette.length]});
  }
  const life={reefs,fish};
  cache.set(drainage,life);
  return life;
}

/** A colony is a small contiguous patch of colored squares in the shallows. */
export function coralTone(x:number,y:number,seed:number):number{
  const colony=terrainNoise(x,y,3.7,seed+7213);
  if(colony<.28)return 0;
  if(colony<.48)return 1;
  return terrainNoise(x,y,5.2,seed+7111)>.24?3:2;
}

/** Interpolate between random waypoints inside a rectangle of actual water.
 * The wall clock keeps fish moving even while world time is paused. */
export function fishPose(fish:Fish,now:number):FishPose{
  const random=(step:number,axis:number)=>terrainHash(step,axis,fish.seed);
  const segment=(now+random(0,3)*3000)/(1400+random(0,4)*1500);
  const step=Math.floor(segment),t=segment-step,u=t*t*(3-2*t);
  const wander=(axis:number)=>random(step,axis)*(1-u)+random(step+1,axis)*u;
  const phase=(now+random(0,5)*16000)/16000;
  const jump=((phase%1)*16000-2400-random(Math.floor(phase),6)*11600)/740;
  return {x:fish.x+.27+(fish.width-.54)*wander(1),y:fish.y+.27+(fish.height-.54)*wander(2),
    lift:jump>0&&jump<1?4*jump*(1-jump):0};
}

export function paintFish(ctx:CanvasRenderingContext2D,fish:Fish,p:Point,
  side:number,lift:number,pixel:number):void{
  const snap=(n:number)=>Math.round(n/pixel)*pixel;
  const size=Math.max(pixel,snap(side));
  const x=snap(p.x-size/2),y=snap(p.y-size/2);
  if(lift>0){
    ctx.fillStyle='#c4efee';
    ctx.fillRect(x,y+size,size,pixel);
  }
  ctx.fillStyle=fish.color;
  ctx.fillRect(x,y-snap(lift*size*2.6),size,size);
}
