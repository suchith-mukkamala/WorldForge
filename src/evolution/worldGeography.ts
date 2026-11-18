import type {Biome,Species} from './engine';
import {biomeHome,seededBiome,terrainHash,terrainNoise} from './biomeGeneration';
import {visibleCoastTile} from './worldOutline';
import type {Point} from './motion';

export const WORLD_LAYOUTS=['varied','continents','archipelago','classic'] as const;
export type WorldLayout=typeof WORLD_LAYOUTS[number];
export const DEFAULT_WORLD_LAYOUT:WorldLayout='varied';
export const WORLD_LAYOUT_NAMES:Record<WorldLayout,string>={
  varied:'Varied worlds',continents:'Twin continents',
  archipelago:'Archipelago',classic:'Classic island',
};
const species:Species[]=['human','elf','dwarf','demon'];
type Geography=Exclude<WorldLayout,'varied'>;
type Bounds={left:number;top:number;right:number;bottom:number};
type Island={bounds:Bounds;cx:number;cy:number;rx:number;ry:number;
  phase:number;tilt:number;seed:number;lake?:{x:number;y:number;size:number}};
type Habitat={species:Species;point:Point;island:number;radius:number};
type SeedTerrain={biomes:Biome[];homes:Record<Species,Point>;layout:Geography};

export function geographyForSeed(seed:number,layout?:WorldLayout):Geography{
  if(layout==='varied')return terrainHash(seed,109,41324)<.48?'continents':'archipelago';
  return layout??'classic';
}
export const isMultiIslandLayout=(layout?:WorldLayout)=>!!layout&&layout!=='classic';

function split(box:Bounds,axis:'x'|'y',ratio:number,gap:number):[Bounds,Bounds]{
  if(axis==='x'){
    const at=box.left+(box.right-box.left)*ratio;
    return [{...box,right:at-gap/2},{...box,left:at+gap/2}];
  }
  const at=box.top+(box.bottom-box.top)*ratio;
  return [{...box,bottom:at-gap/2},{...box,top:at+gap/2}];
}
const area=(box:Bounds)=>(box.right-box.left)*(box.bottom-box.top);

function islandsForSeed(seed:number,layout:'continents'|'archipelago',w:number,h:number){
  let draw=0;
  const random=()=>terrainHash(++draw,513,seed);
  const frame={left:.026,top:.035,right:.974,bottom:.965};
  const axis=random()<.72?'x':'y',across=axis==='x'?'y':'x';
  const divide=(box:Bounds,along:typeof axis,ratio:number,gap:number)=>
    split(box,along,ratio,Math.max(gap,3/(along==='x'?w:h)));
  const halves=divide(frame,axis,.41+random()*.18,
    layout==='continents'?.042+random()*.047:.032+random()*.022);
  let boxes:Bounds[]=halves;
  if(layout==='archipelago'){
    const pattern=random();
    if(pattern<.34){
      // A larger island faces a string of smaller islands across the strait.
      const [main,chain]=random()<.5?halves:[halves[1],halves[0]];
      const [first,rest]=divide(chain,across,.28+random()*.09,.026);
      boxes=[main,first,...divide(rest,across,.43+random()*.14,.026)];
    }else{
      // The two sides can fan out in different directions.
      boxes=halves.flatMap((half,i)=>divide(half,i&&pattern<.60?axis:across,
        .40+random()*.20,.03+random()*.035));
    }
    // Split the largest one or two regions. This leaves room for at least
    // four substantial islands and gives some seeds smaller outlying shores.
    const extras=Math.min(2,Math.floor(random()*3));
    for(let i=0;i<extras;i++){
      const biggest=boxes.reduce((best,box)=>area(box)>area(best)?box:best);
      const along=(biggest.right-biggest.left)*w>(biggest.bottom-biggest.top)*h?'x':'y';
      const ratio=random()<.5?.32+random()*.07:.61+random()*.07;
      boxes=boxes.flatMap(box=>box===biggest?divide(box,along,ratio,.025):[box]);
    }
  }
  return boxes.map((bounds,id):Island=>{
    const sw=bounds.right-bounds.left,sh=bounds.bottom-bounds.top;
    const cx=bounds.left+sw*(.42+random()*.16),cy=bounds.top+sh*(.42+random()*.16);
    const phase=random()*Math.PI*2;
    const slope=(random()-.5)*.50;
    const island:Island={bounds,cx,cy,rx:sw*(.38+random()*.085),
      ry:sh*(.36+random()*.10),phase,tilt:slope,seed:seed+id*307};
    if(Math.min(sw*w,sh*h)>=20&&random()<.45){
      island.lake={x:cx+Math.cos(phase)*island.rx*.56,
        y:cy+Math.sin(phase)*island.ry*.49,size:.12+random()*.13};
    }
    return island;
  });
}

function islandSurface(u:number,v:number,island:Island):boolean{
  const {bounds:b}=island;
  if(u<b.left||u>b.right||v<b.top||v>b.bottom)return false;
  const dx=(u-island.cx)/island.rx,dy=(v-island.cy)/island.ry;
  const x=dx+dy*island.tilt,y=dy-dx*island.tilt;
  const angle=Math.atan2(y,x)+island.phase;
  const coast=1+.14*Math.sin(angle*3)+.088*Math.cos(angle*5+island.phase)+
    .047*Math.sin(angle*11-island.phase)+
    terrainNoise(x*72,y*72,18,island.seed+929)*.105;
  const edge=Math.min((u-b.left)/(b.right-b.left),(b.right-u)/(b.right-b.left),
    (v-b.top)/(b.bottom-b.top),(b.bottom-v)/(b.bottom-b.top));
  if(Math.hypot(x,y)>coast-Math.max(0,.085-edge)*4)return false;
  const lake=island.lake;
  if(!lake)return true;
  const lx=(u-lake.x)/island.rx,ly=(v-lake.y)/island.ry;
  return Math.hypot(lx,ly)>lake.size*(1+terrainNoise(lx*20,ly*20,3,island.seed)*.26);
}

function newWorldTerrain(w:number,h:number,seed:number,
  layout:'continents'|'archipelago'):SeedTerrain{
  const islands=islandsForSeed(seed,layout,w,h);
  const cells=new Uint8Array(w*h);
  const counts=islands.map(()=>0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const id=islands.findIndex(island=>islandSurface((x+.5)/w,(y+.5)/h,island));
    if(id>=0){cells[y*w+x]=id+1;counts[id]++;}
  }

  // Each culture begins in a suitable region on actual land. The homes move
  // between shores by seed, and larger islands can support multiple cultures.
  const order=counts.map((_,i)=>i)
    .sort((a,b)=>counts[b]-counts[a]||a-b);
  const offset=Math.floor(terrainHash(211,15,seed)*species.length)%species.length;
  const habitats:Habitat[]=[];
  const homes={} as Record<Species,Point>;
  for(let n=0;n<species.length;n++){
    const kind=species[(n+offset)%species.length];
    const id=layout==='continents'?order[n%2]:order[n];
    const island=islands[id];
    const side=layout==='continents'?(n<2?-.40:.40):0;
    const x=island.cx*w+Math.cos(island.phase)*island.rx*w*side;
    const y=island.cy*h+Math.sin(island.phase)*island.ry*h*side;
    const clear=(at:number)=>cells[at]===id+1;
    let best=-1,score=Infinity;
    for(let i=0;i<cells.length;i++)if(clear(i)){
      const px=i%w,py=Math.floor(i/w);
      const coastPenalty=clear(i-w)&&clear(i+w)&&clear(i-1)&&clear(i+1)?0:18;
      const occupied=habitats.some(home=>home.island===id&&
        Math.hypot(px-home.point.x,py-home.point.y)<7)?90:0;
      const next=(px-x)**2+(py-y)**2+coastPenalty+occupied;
      if(next<score){best=i;score=next;}
    }
    const point={x:best%w,y:Math.floor(best/w)};
    homes[kind]=point;
    habitats.push({species:kind,point,island:id,
      radius:Math.max(5,Math.min(island.rx*w,island.ry*h)*.52)});
  }

  const scale=Math.min(w,h);
  const biomes=Array.from(cells,(id,i):Biome=>{
    if(!id)return 'water';
    const x=i%w,y=Math.floor(i/w),island=islands[id-1];
    const patches=terrainNoise(x,y,Math.max(4,scale*.09),seed+83);
    const detail=terrainNoise(x,y,Math.max(2,scale*.036),seed+139);
    const wet=terrainNoise(x+31,y-17,scale*.22,seed+241)*.69+patches*.31;
    let home:Habitat|undefined,proximity=Infinity;
    for(const candidate of habitats){
      if(candidate.island!==id-1)continue;
      const d=Math.hypot(x-candidate.point.x,y-candidate.point.y)/candidate.radius;
      if(d<proximity){home=candidate;proximity=d;}
    }
    if(home&&proximity<1+patches*.23){
      if(home.species==='human')return patches>.51?'forest':'plains';
      if(home.species==='elf')return patches<-.71?'plains':'forest';
      if(home.species==='dwarf')return detail>.075?'cave':'mountain';
      return proximity<.68+detail*.14?'volcanic':'wasteland';
    }
    const dx=((x+.5)/w-island.cx)/island.rx,dy=((y+.5)/h-island.cy)/island.ry;
    const spine=Math.cos(island.phase)*dx+Math.sin(island.phase)*dy;
    const rugged=1-Math.abs(spine+patches*.42)-Math.hypot(dx,dy)*.42+
      terrainNoise(x-11,y+31,scale*.18,seed+509)*.55;
    if(rugged>.69&&Math.hypot(dx,dy)<.85)return detail>.4?'cave':'mountain';
    if(wet>.04||detail>.6)return 'forest';
    if(wet<-.49&&patches<-.2)return 'wasteland';
    return 'plains';
  });
  return {biomes,homes,layout};
}

/** The preview and world use the same seed, map size, coastlines and biomes.
 * Saves without a layout replay through the original generator. */
export function generateSeedTerrain(w:number,h:number,seed:number,layout?:WorldLayout):SeedTerrain{
  const geography=geographyForSeed(seed,layout);
  if(geography!=='classic')return newWorldTerrain(w,h,seed,geography);
  const homes=Object.fromEntries(species.map(s=>{
    const [x,y]=biomeHome(seed,s);
    return [s,{x:Math.round(x*(w-1)),y:Math.round(y*(h-1))}];
  })) as SeedTerrain['homes'];
  const biomes=Array.from({length:w*h},(_,i)=>{
    const x=i%w,y=Math.floor(i/w);
    return visibleCoastTile(x,y,w,h,'water',seed)?seededBiome(x,y,w,h,seed):'water';
  });
  return {biomes,homes,layout:'classic'};
}

/** Distinct landmasses share an edge. Tiny rocks stay visible on the map
 * without inflating the count shown in the creator. */
export function landmassCount(w:number,h:number,biomes:readonly Biome[]):number{
  const seen=new Uint8Array(biomes.length);
  let landmasses=0;
  for(let i=0;i<biomes.length;i++){
    if(seen[i]||biomes[i]==='water')continue;
    const queue=[i];seen[i]=1;
    for(let head=0;head<queue.length;head++){
      const cell=queue[head],x=cell%w;
      for(const n of [x>0?cell-1:-1,x<w-1?cell+1:-1,cell-w,cell+w]){
        if(n<0||n>=w*h||seen[n]||biomes[n]==='water')continue;
        seen[n]=1;queue.push(n);
      }
    }
    if(queue.length>=Math.max(12,Math.ceil(w*h*.004)))landmasses++;
  }
  return landmasses;
}
