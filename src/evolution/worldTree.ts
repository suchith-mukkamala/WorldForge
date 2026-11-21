import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Biome,World} from './engine';
import {MAX_LANDING_RISE} from './shipSave';
import {SEA_LEVEL} from './topography';

export type WorldTree={x:number;y:number;variant:number;trail:number[];pools:number[];approach?:number};
export const WORLD_TREE_BLOCK=2.5;
export const WORLD_TREE_CROWN_RADIUS=39;
export const WORLD_TREE_DESCENT_UNIT=31;
export const WORLD_TREE_ROOT_REACH=58;
const TRUNK_CLEARANCE=15;

type Root={angle:number;bend:number;length:number;width:number;phase:number};
const rootCache=new WeakMap<WorldTree,Root[]>();
export function worldTreeRoots(tree:WorldTree){
  const cached=rootCache.get(tree);
  if(cached)return cached;
  const seed=tree.variant+tree.x*151+tree.y*131;
  const roots=Array.from({length:7},(_,i)=>({
    angle:(i+terrainHash(i,3,seed)*.6)*Math.PI*2/7+seed%628/100,
    bend:(terrainHash(i,5,seed)-.5)*1.32,length:32+terrainHash(i,8,seed)*26,
    width:1.9+terrainHash(i,16,seed)*2.3,phase:terrainHash(i,22,seed)*2,
  }));
  rootCache.set(tree,roots);
  return roots;
}

export function worldTreeRootHeight(roots:readonly Root[],dx:number,dy:number,margin=0){
  const r2=dx*dx+dy*dy;
  if(r2>(WORLD_TREE_ROOT_REACH+margin)**2)return 0;
  const r=Math.sqrt(r2),angle=Math.atan2(dy,dx);
  let height=0;
  for(const root of roots){
    const t=r/root.length;
    if(t>=1)continue;
    const delta=angle-root.angle-root.bend*t;
    if(Math.cos(delta)<=0)continue;
    const width=root.width*(1-t*.89);
    const cross=Math.abs(Math.sin(delta)*r);
    if(cross>=width+margin)continue;
    const crown=Math.sqrt(Math.max(0,1-(Math.max(0,cross-margin)/width)**2));
    const rise=(Math.sin(t*18+root.phase)*.53+.25+Math.exp(-r/9)*.81);
    height=Math.max(height,Math.max(0,rise)*crown*(1-t)*22);
  }
  return height;
}

export function worldTreeBlocksBuilding(tree:WorldTree|undefined,x:number,y:number){
  if(!tree)return false;
  const dx=x-tree.x,dy=y-tree.y;
  return dx*dx+dy*dy<TRUNK_CLEARANCE**2||worldTreeRootHeight(worldTreeRoots(tree),dx,dy,1.5)>0;
}

type TreeStructures=Partial<Pick<World,'settlements'|'ruins'|'ancientSites'>>;
export function worldTreeClearings(world:TreeStructures&Pick<World,'width'|'height'|'worldTree'>){
  const tree=world.worldTree;
  if(!tree)return [];
  const cells=new Set<number>();
  const clear=({x,y}:{x:number;y:number},radius:number)=>{
    if(Math.hypot(x-tree.x,y-tree.y)>WORLD_TREE_ROOT_REACH+radius+2)return;
    for(let v=Math.max(0,y-radius);v<=Math.min(world.height-1,y+radius);v++){
      for(let u=Math.max(0,x-radius);u<=Math.min(world.width-1,x+radius);u++)cells.add(v*world.width+u);
    }
  };
  for(const town of world.settlements??[]){
    clear(town,2);
    for(const building of town.infrastructure?.buildings??[])clear(building,2);
  }
  for(const ruin of world.ruins??[])clear(ruin,2);
  for(const site of world.ancientSites??[])clear(site,2);
  return [...cells].sort((a,b)=>a-b);
}

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
  // Keep the coastal approach on dry land even when the trunk grows in the sea.
  if(terrainHash(seed,51,7884)<.28){
    const shore=trail.at(-1)!;
    const sx=shore%w,sy=Math.floor(shore/w);
    let offshore=-1,score=-Infinity;
    for(const i of water){
      const u=i%w,v=Math.floor(i/w),range=Math.hypot(u-sx,v-sy);
      if(u<5||v<5||u>=w-5||v>=h-5||range<10||range>23)continue;
      if(![i,i-3,i+3,i-3*w,i+3*w].every(j=>ocean[j]))continue;
      const toward=(u-sx)*(x-sx)+(v-sy)*(y-sy);
      if(toward>0)continue;
      const candidate=terrainHash(u,v,seed+491)-Math.abs(range-18)*.06;
      if(candidate>score){score=candidate;offshore=i;}
    }
    if(offshore>=0)return {x:offshore%w,y:Math.floor(offshore/w),variant,trail,pools,approach:site};
  }
  return {x,y,variant,trail,pools};
}

export function validWorldTree(value:unknown,w:number,h:number):boolean{
  if(!value||typeof value!=='object')return false;
  const {x,y,variant,trail,pools,approach}=value as WorldTree;
  const validIndex=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<w*h;
  return Number.isInteger(x)&&x>=0&&x<w&&Number.isInteger(y)&&y>=0&&y<h&&
    Number.isInteger(variant)&&variant>=0&&variant<24&&Array.isArray(trail)&&trail.length<=16&&
    (approach===undefined||validIndex(approach))&&trail.length>0&&trail.every((n,step)=>validIndex(n)&&
      neighbors(step===0?(approach??y*w+x):trail[step-1],w,h).includes(n))&&
    new Set(trail).size===trail.length&&Array.isArray(pools)&&pools.length<=169&&pools.every(validIndex);
}
