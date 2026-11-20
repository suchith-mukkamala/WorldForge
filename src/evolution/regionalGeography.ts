import type {Biome,Tile,World} from './engine';
import {terrainNoise} from './biomeGeneration';
import {generateHydrology,hydrologyForWorld,riverBanks,type Hydrology} from './hydrology';
import {SEA_LEVEL,TOPOGRAPHY_VERSION,topographyForWorld,type Topography} from './topography';
import {terrainRuggedness} from './terrainPhysics';

const uplift:Record<Biome,number>={
  plains:0,forest:0,mountain:1,cave:.82,wasteland:.22,volcanic:1,water:0,
};

/** Smooth neighboring geology into hills and ridges before cutting valleys. */
export function generateRegionalTopography(width:number,height:number,
  tiles:readonly Pick<Tile,'biome'>[],seed:number):Topography{
  const count=width*height,coast=new Uint16Array(count);
  for(let i=0;i<count;i++)coast[i]=tiles[i].biome==='water'?0:width+height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(x>0)coast[i]=Math.min(coast[i],coast[i-1]+1);
    if(y>0)coast[i]=Math.min(coast[i],coast[i-width]+1);
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(x<width-1)coast[i]=Math.min(coast[i],coast[i+1]+1);
    if(y<height-1)coast[i]=Math.min(coast[i],coast[i+width]+1);
  }
  let highland=Float32Array.from(tiles,t=>uplift[t.biome]);
  for(let pass=0;pass<4;pass++){
    highland=highland.map((value,i)=>{
      const x=i%width,y=Math.floor(i/width);
      let sum=value*2,weight=2;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if((!dx&&!dy)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
        sum+=highland[i+dx+dy*width];
        weight++;
      }
      return sum/weight;
    });
  }
  const scale=Math.max(8,Math.min(width,height));
  const heights=Array.from(coast,(distance,i)=>{
    if(!distance)return SEA_LEVEL-9;
    const x=i%width,y=Math.floor(i/width);
    const rolling=terrainNoise(x+31,y-47,scale*.25,seed+4701)*23+
      terrainNoise(x,y,Math.max(4,scale*.09),seed+4807)*11;
    const ridge=1-Math.abs(terrainNoise(x+23,y+11,scale*.13,seed+5347));
    const inland=1-Math.exp(-distance/Math.max(2.8,scale*.063));
    return Math.round(SEA_LEVEL+3+inland*(33+rolling+highland[i]*(56+65*ridge)));
  });
  const rivers=generateHydrology(width,height,heights,tiles,seed,true);
  const banks=riverBanks(rivers,width,height);
  const channels:number[]=[];
  for(let i=0;i<count;i++){
    if(!coast[i])continue;
    const tier=rivers.channel[i];
    heights[i]=Math.max(SEA_LEVEL,heights[i]-Math.round(banks[i]*5+tier*4));
    if(tier)channels.push(i);
  }
  // Catchment grows along a channel. Cutting from headwaters downstream
  // leaves the receiving bed at or below the segment feeding it.
  channels.sort((a,b)=>rivers.catchment[a]-rivers.catchment[b]);
  for(const i of channels){
    const next=rivers.flowTo[i];
    if(next>=0&&coast[next])heights[next]=Math.min(heights[next],Math.max(SEA_LEVEL,heights[i]-1));
  }
  return {version:TOPOGRAPHY_VERSION,heights};
}

const seaCache=new WeakMap<Hydrology,Set<number>>();
function oceanBasins(w:World,drainage:Hydrology):Set<number>{
  const cached=seaCache.get(drainage);
  if(cached)return cached;
  const {width,height,tiles}=w,basins=new Set<number>();
  for(let i=0;i<tiles.length;i++){
    if(tiles[i].biome!=='water')continue;
    const x=i%width,y=Math.floor(i/width);
    if(x===0||y===0||x===width-1||y===height-1)basins.add(drainage.basin[i]);
  }
  seaCache.set(drainage,basins);
  return basins;
}

function shallowCrossing(w:World,index:number,downstream:number,heights:readonly number[]):boolean{
  const x=index%w.width,y=Math.floor(index/w.width);
  const dx=downstream%w.width-x,dy=Math.floor(downstream/w.width)-y;
  for(const side of [-1,1]){
    const nx=x-dy*side,ny=y+dx*side;
    if(nx<0||ny<0||nx>=w.width||ny>=w.height)return false;
    const bank=ny*w.width+nx;
    if(w.tiles[bank].biome==='water'||Math.abs(heights[bank]-heights[index])>13)return false;
  }
  return true;
}

export function settlementGeography(w:World,index:number):{score:number;landform?:string}{
  const {width,height,tiles}=w;
  const x=index%width,y=Math.floor(index/width);
  const heights=topographyForWorld(w).heights;
  const drainage=hydrologyForWorld(w),banks=riverBanks(drainage,width,height);
  const seas=oceanBasins(w,drainage);
  const rugged=terrainRuggedness(w,index);
  let seaTiles=0,coastal=false,crossing=false,area=0;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const nx=x+dx,ny=y+dy;
    if(nx<0||nx>=width||ny<0||ny>=height||dx*dx+dy*dy>10)continue;
    area++;
    const near=ny*width+nx,adjacent=Math.max(Math.abs(dx),Math.abs(dy))<=1;
    if(tiles[near].biome==='water'&&seas.has(drainage.basin[near])){
      seaTiles++;
      if(adjacent)coastal=true;
    }
    const tier=drainage.channel[near];
    if(!crossing&&adjacent&&tier>0&&tier<3&&rugged<=18&&
      Math.abs(heights[near]-heights[index])<=10&&shallowCrossing(w,near,drainage.flowTo[near],heights))
      crossing=true;
  }
  const sheltered=coastal&&seaTiles>=3&&seaTiles/area<.43&&heights[index]<=SEA_LEVEL+30;
  const valley=banks[index]>.26&&heights[index]<118&&rugged<=17;
  const landform=sheltered?'Sheltered harbor':crossing?'River crossing':valley?'Fertile valley':undefined;
  const score=(sheltered?.54:0)+(crossing?.37:0)+(valley?.26:0)+banks[index]*.29-
    Math.min(.55,rugged*.012)-Math.max(0,heights[index]-130)*.003;
  return {score,landform};
}
