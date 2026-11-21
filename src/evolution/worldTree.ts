import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Biome} from './engine';
import {MAX_LANDING_RISE} from './shipSave';
import {SEA_LEVEL} from './topography';

export type WorldTree={x:number;y:number;variant:number;trail:number[];pools:number[]};
const grove=new Set<Biome>(['forest','plains','wetland','taiga','savanna']);
const neighbors=(i:number,w:number,h:number)=>[
  ...(i%w>0?[i-1]:[]),...(i%w<w-1?[i+1]:[]),...(i>=w?[i-w]:[]),
  ...(i<w*(h-1)?[i+w]:[]),
];

/** Find a wooded coastal site with a continuous dry route to a landing. */
export function plantWorldTree(w:number,h:number,seed:number,biomes:Biome[],
  heights:number[],reserved:readonly {x:number;y:number}[]):WorldTree|undefined{
  const distance=new Uint8Array(w*h).fill(255);
  const towardShore=new Int32Array(w*h).fill(-1),queue:number[]=[];
  const safe=(i:number)=>grove.has(biomes[i]);
  const ocean=new Uint8Array(w*h),water:number[]=[];
  for(let i=0;i<biomes.length;i++){
    const x=i%w,y=Math.floor(i/w);
    if(biomes[i]==='water'&&(x===0||y===0||x===w-1||y===h-1)){ocean[i]=1;water.push(i);}
  }
  for(let head=0;head<water.length;head++)for(const n of neighbors(water[head],w,h)){
    if(!ocean[n]&&biomes[n]==='water'){ocean[n]=1;water.push(n);}
  }
  for(let i=0;i<biomes.length;i++){
    if(!safe(i)||!neighbors(i,w,h).some(n=>ocean[n]&&
      Math.abs(heights[i]-heights[n])<=MAX_LANDING_RISE))continue;
    distance[i]=0;queue.push(i);
  }
  for(let head=0;head<queue.length;head++){
    const i=queue[head];
    if(distance[i]===16)continue;
    for(const next of neighbors(i,w,h)){
      if(!safe(next)||distance[next]!==255)continue;
      distance[next]=distance[i]+1;towardShore[next]=i;queue.push(next);
    }
  }
  let site=-1,best=-Infinity;
  for(const i of queue){
    const x=i%w,y=Math.floor(i/w),d=distance[i];
    if(x<6||y<6||x>=w-6||y>=h-6||d<2)continue;
    const score=(biomes[i]==='forest'?1:0)+terrainHash(x,y,seed)*3-
      Math.abs(d-9)*.32-Math.abs(heights[i]-88)*.022-
      (reserved.some(({x:u,y:v})=>Math.hypot(x-u,y-v)<6)?4:0);
    if(score>best){best=score;site=i;}
  }
  if(site<0)return;
  const x=site%w,y=Math.floor(site/w);
  const edges=neighbors(site,w,h).map(n=>biomes[n]);
  const tone=edges.includes('taiga')||biomes[site]==='taiga'?0:
    edges.includes('savanna')||biomes[site]==='savanna'?1:2;
  const variant=3*(Math.floor(terrainHash(x,y,seed+7301)*8)%8)+tone;
  const trail:number[]=[],pools:number[]=[];
  for(let n=towardShore[site];n>=0;n=towardShore[n])trail.push(n);
  const path=new Set(trail);
  const nearby=biomes.slice();
  for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
    const i=(y+dy)*w+x+dx,r=Math.hypot(dx,dy);
    if(r>6||!safe(i)||path.has(i))continue;
    const angle=Math.atan2(dy,dx)+variant*.29;
    const root=Math.max(0,Math.cos(angle*5+r*.36))**4;
    const influence=1-r/6,noise=terrainNoise(x+dx,y+dy,3,seed+973);
    const wet=nearby[i]==='wetland'||neighbors(i,w,h).some(n=>nearby[n]==='wetland');
    const bank=r>1&&r<5&&root<.12&&
      (wet?noise>-.22:noise>.26)&&heights[i]<94;
    if(bank)pools.push(i);
    const change=bank?-5:root*16*influence;
    heights[i]=Math.round(Math.max(SEA_LEVEL,Math.min(255,heights[i]+change)));
    // Preserve the local wetland and cold forest. Plains gradually become
    // woodland toward the trunk, with a jagged edge set by the local seed.
    if(nearby[i]==='plains'&&influence+noise*.45>.49){
      biomes[i]=neighbors(i,w,h).some(n=>nearby[n]==='taiga')?'taiga':'forest';
    }
  }
  return {x,y,variant,trail,pools};
}

export function validWorldTree(value:unknown,w:number,h:number):boolean{
  if(!value||typeof value!=='object')return false;
  const {x,y,variant,trail,pools}=value as WorldTree;
  const validIndex=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<w*h;
  return Number.isInteger(x)&&x>=0&&x<w&&Number.isInteger(y)&&y>=0&&y<h&&
    Number.isInteger(variant)&&variant>=0&&variant<24&&Array.isArray(trail)&&trail.length<=16&&
    trail.length>0&&trail.every((n,step)=>validIndex(n)&&
      neighbors(step===0?y*w+x:trail[step-1],w,h).includes(n))&&
    new Set(trail).size===trail.length&&Array.isArray(pools)&&pools.length<=169&&pools.every(validIndex);
}
