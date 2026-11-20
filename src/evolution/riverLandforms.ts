import type {Biome,Species} from './engine';
import {terrainHash,terrainNoise} from './biomeGeneration';
import {generateHydrology} from './hydrology';
import type {Point} from './motion';
import {SEA_LEVEL} from './topography';

export type LandformKind='glacial-lake'|'canyon'|'caldera'|'barrier-islands';
export type LandformSite=Point&{kind:LandformKind};

function inlandDistance(width:number,height:number,biomes:readonly Biome[]):Uint16Array{
  const distances=Uint16Array.from(biomes,b=>b==='water'?0:width+height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(x)distances[i]=Math.min(distances[i],distances[i-1]+1);
    if(y)distances[i]=Math.min(distances[i],distances[i-width]+1);
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(x+1<width)distances[i]=Math.min(distances[i],distances[i+1]+1);
    if(y+1<height)distances[i]=Math.min(distances[i],distances[i+width]+1);
  }
  return distances;
}

/** Sculpt terrain before people settle it. Each profile is part of the same
 * heightfield and land mask used by the preview, drainage and travel. */
export function sculptLandforms(width:number,height:number,seed:number,biomes:Biome[],
  heights:number[],homes:Record<Species,Point>):LandformSite[]{
  const inland=inlandDistance(width,height,biomes),count=width*height;
  const sites:LandformSite[]=[],centers:Point[]=[];
  const point=(i:number):Point=>({x:i%width,y:Math.floor(i/width)});
  const homePoints=Object.values(homes);
  const near=(a:Point,b:Point)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
  const protectedHome=(p:Point,radius=3)=>homePoints.some(home=>near(p,home)<=radius);
  const noise=(i:number,salt:number)=>terrainHash(i%width,Math.floor(i/width),seed+salt);
  const open=(x:number,y:number)=>x>=2&&x<width-2&&y>=2&&y<height-2;
  const inside=(p:Point)=>open(p.x,p.y);
  const pick=(rank:(i:number)=>number,spacing=8)=>{
    let chosen=-1,score=-Infinity;
    for(let i=0;i<count;i++){
      const p=point(i);
      if(!inside(p)||centers.some(c=>near(c,p)<spacing))continue;
      const value=rank(i);
      if(value>score){chosen=i;score=value;}
    }
    return chosen;
  };
  const record=(kind:LandformKind,center:Point,access:Point=center)=>{
    centers.push(center);sites.push({...access,kind});
  };

  const lake=pick(i=>inland[i]>=5&&!protectedHome(point(i),5)&&heights[i]>=94?
    heights[i]+noise(i,8911)*32:-Infinity);
  if(lake>=0){
    const center=point(lake),angle=noise(lake,8919)*Math.PI;
    const cos=Math.cos(angle),sin=Math.sin(angle),radius=Math.min(6,3.1+Math.min(width,height)/65);
    const level=Math.min(144,Math.max(SEA_LEVEL+14,heights[lake]-23));
    let access:Point|undefined,accessScore=Infinity;
    for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++){
      const x=center.x+dx,y=center.y+dy,i=y*width+x;
      if(!open(x,y)||inland[i]<2||protectedHome({x,y})||biomes[i]==='water')continue;
      const u=(dx*cos+dy*sin)/radius,v=(dy*cos-dx*sin)/2.15;
      const ellipse=Math.hypot(u,v);
      if(ellipse<1){biomes[i]='water';heights[i]=level;}
      else if(ellipse<1.6){
        const rim=level+4+(ellipse-1)*18;
        heights[i]=Math.max(level+2,Math.round(heights[i]+(rim-heights[i])*(1.6-ellipse)/.6));
        const rank=ellipse+Math.abs(dx+dy)*.024;
        if(rank<accessScore){accessScore=rank;access={x,y};}
      }
    }
    if(access)record('glacial-lake',center,access);
  }

  const volcano=pick(i=>inland[i]>=3&&(biomes[i]==='volcanic'||biomes[i]==='wasteland')?
    heights[i]*.36+(biomes[i]==='volcanic'?48:0)-near(point(i),homes.demon)*2+
    noise(i,8929)*16:-Infinity);
  if(volcano>=0){
    const center=point(volcano),rim=Math.min(225,Math.max(128,heights[volcano]+20));
    const radius=Math.min(6,3.1+Math.min(width,height)/80);
    let access:Point|undefined,score=Infinity;
    for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
      const x=center.x+dx,y=center.y+dy,i=y*width+x;
      if(!open(x,y)||biomes[i]==='water')continue;
      const r=Math.hypot(dx,dy*1.15)/radius+
        terrainNoise(x,y,4,seed+8971)*.09;
      if(r>=1.5)continue;
      const target=r<.55?rim-51:rim-51+Math.min(1,(r-.55)/.44)*51;
      heights[i]=Math.round(heights[i]+(target-heights[i])*Math.min(1,(1.5-r)*2));
      if(r<.95&&!protectedHome({x,y}))biomes[i]='volcanic';
      const rank=Math.abs(r-1)+Math.abs(dx)*.028;
      if(r>.85&&rank<score){score=rank;access={x,y};}
    }
    if(access)record('caldera',center,access);
  }

  const tiles=()=>biomes.map(biome=>({biome}));
  const drainage=generateHydrology(width,height,heights,tiles(),seed,true),ocean=new Set<number>();
  for(let i=0;i<count;i++){
    const {x,y}=point(i);
    if((x===0||y===0||x===width-1||y===height-1)&&biomes[i]==='water')ocean.add(drainage.basin[i]);
  }
  const bars=(p:Point,u:number,v:number)=>{
    const islands:number[][]=[];
    for(let j=0;j<3;j++){
      const side=(j-1)*7,belt:number[]=[];
      for(let t=-2;t<=2;t++){
        const away=4+(Math.abs(j-1)+Math.abs(t)>=2?1:0);
        const x=p.x+u*away-v*(side+t),y=p.y+v*away+u*(side+t),i=y*width+x;
        if(!open(x,y)||biomes[i]!=='water'||!ocean.has(drainage.basin[i])||
          inland[i-u-v*width]>0||inland[i+u+v*width]>0)return [];
        belt.push(i);
      }
      islands.push(belt);
    }
    return islands;
  };
  let barrier:Point|undefined,chain:number[][]=[],barScore=-Infinity;
  for(let i=0;i<count;i++){
    if(inland[i]!==1||heights[i]>SEA_LEVEL+26)continue;
    const p=point(i);
    if(!inside(p)||centers.some(c=>near(c,p)<7))continue;
    for(const [u,v] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(!ocean.has(drainage.basin[i+u+v*width])||biomes[i+u+v*width]!=='water')continue;
      const score=noise(i,8941)+drainage.channel[i]*.03;
      if(score<=barScore)continue;
      const sandbars=bars(p,u,v);
      if(!sandbars.length)continue;
      barrier=p;chain=sandbars;barScore=score;
    }
  }
  if(barrier){
    for(const island of chain)for(const [offset,i] of island.entries()){
      biomes[i]=offset===2?'wetland':'plains';
      heights[i]=SEA_LEVEL+4+(offset===2?2:0);
    }
    record('barrier-islands',barrier);
  }

  const path=(i:number)=>{
    const ends:number[]=[];
    for(let j=i;ends.length<9&&j>=0&&biomes[j]!=='water'&&inland[j]>=2;j=drainage.flowTo[j]){
      if(ends.length&&heights[j]<SEA_LEVEL+13)break;
      ends.push(j);
    }
    return ends;
  };
  const gorge=pick(i=>{
    if(!drainage.channel[i]||heights[i]<104||protectedHome(point(i)))return -Infinity;
    const route=path(i);
    return route.length>=5?route.length*8+heights[i]*.28+noise(i,8933)*13:-Infinity;
  },7);
  if(gorge>=0){
    const route=path(gorge),center=point(route[Math.floor(route.length/2)]);
    let bed=heights[gorge]-17;
    for(const i of route){
      bed=Math.max(SEA_LEVEL+6,Math.min(bed-1,heights[i]-13));
      heights[i]=bed;
    }
    record('canyon',center);
  }
  return sites;
}
