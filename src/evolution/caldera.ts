import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Biome,World} from './engine';
import {seaNeighbors,seaPoint} from './shipSave';
import {SEA_LEVEL} from './topography';
import type {VolcanicIsland} from './volcanicGeography';

export type Caldera={lake:number[];outflow:number[];breachDay:number;drainedAt?:number};

/** Cut a lake inside the old volcanic cone and find its weakest saddle.
 * The receiving coast and the whole breach remain within the island. */
export function sculptCaldera(width:number,seed:number,biomes:Biome[],heights:number[],
  island:VolcanicIsland|undefined):Caldera|undefined{
  if(!island)return;
  const center=island.index,{x,y}=seaPoint(width,center),size=biomes.length;
  const radius=Math.max(1.38,island.radius*(.30+terrainHash(x,y,seed+8991)*.09));
  const near=(i:number)=>seaNeighbors(i,width,size).filter(j=>j>=0);
  const surrounding=(i:number)=>{
    const p=seaPoint(width,i),ring:number[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx||dy)ring.push((p.y+dy)*width+p.x+dx);
    }
    return ring;
  };
  const inland=(i:number)=>biomes[i]!=='water'&&surrounding(i).every(j=>biomes[j]!=='water');
  if(!inland(center))return;
  const lake=new Set([center]);
  for(const i of lake){
    for(const next of near(i)){
      if(lake.has(next)||!inland(next))continue;
      const p=seaPoint(width,next);
      if(Math.hypot(p.x-x,p.y-y)<radius+terrainNoise(p.x,p.y,2.8,seed+8129)*.24)lake.add(next);
    }
  }
  if(lake.size<3)return;
  const rim=new Set([...lake].flatMap(surrounding).filter(i=>!lake.has(i)));
  const level=Math.max(SEA_LEVEL+15,Math.min(...[...rim].map(i=>heights[i]))-4);
  let outflow:number[]|undefined,best=Infinity;
  for(const first of near(center)){
    const dx=first%width-x,dy=Math.floor(first/width)-y;
    const route=[center];
    let saddle=-1,excavation=0;
    for(let step=1;step<=island.radius+2;step++){
      const next=(y+dy*step)*width+x+dx*step;
      route.push(next);
      if(biomes[next]==='water'){
        if(saddle<0||heights[next]>SEA_LEVEL||route.length<4||route.length>14)break;
        const cost=heights[saddle]+excavation*.16+terrainHash(next,center,seed+4877)*5;
        if(cost<best){best=cost;outflow=route;}
        break;
      }
      if(lake.has(next))continue;
      if(saddle<0)saddle=next;
      excavation+=heights[next]-SEA_LEVEL;
    }
  }
  if(!outflow)return;
  for(const i of lake){biomes[i]='water';heights[i]=level;}
  for(const i of rim){
    const ridge=terrainNoise(i%width,Math.floor(i/width),3.2,seed+2981);
    heights[i]=Math.max(heights[i],level+13+Math.round(ridge*7));
  }
  // The existing saddle holds the lake until its first spring recharge.
  const saddle=outflow.find(i=>!lake.has(i))!;
  heights[saddle]=level+2;
  return {lake:[...lake],outflow,breachDay:48+Math.floor(terrainHash(x,y,seed+8951)*37)};
}

export function calderaRiver(world:Pick<World,'tiles'|'volcanicLayout'>):readonly number[]|undefined{
  const basin=world.volcanicLayout?.caldera;
  if(basin?.drainedAt===undefined)return;
  const {outflow}=basin,{tiles}=world;
  if(tiles[outflow[0]]?.biome==='water'&&tiles[outflow[outflow.length-1]]?.biome==='water'&&
    outflow.slice(1,-1).every(i=>tiles[i]?.biome!=='water'))return outflow;
}

export function validCaldera(value:unknown,width:number,height:number,center:number):value is Caldera{
  if(!value||typeof value!=='object')return false;
  const {lake,outflow,breachDay,drainedAt}=value as Caldera,size=width*height;
  const integer=(n:number,min:number,max:number)=>Number.isInteger(n)&&n>=min&&n<=max;
  const cells=(list:number[],min:number,max:number)=>Array.isArray(list)&&list[0]===center&&
    integer(list.length,min,max)&&new Set(list).size===list.length&&list.every(i=>integer(i,0,size-1));
  return cells(lake,3,64)&&cells(outflow,4,14)&&!lake.includes(outflow[outflow.length-1])&&
    outflow.every((i,n)=>!n||seaNeighbors(i,width,size).includes(outflow[n-1]))&&
    lake.every((i,n)=>!n||seaNeighbors(i,width,size).some(j=>lake.slice(0,n).includes(j)))&&
    integer(breachDay,1,365)&&(drainedAt===undefined||integer(drainedAt,breachDay,9999*365));
}
