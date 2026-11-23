import {terrainHash,terrainHumidity,terrainNoise,terrainTemperature} from './biomeGeneration';
import type {Biome,World} from './engine';
import {validCaldera,type Caldera} from './caldera';
import {seaNeighbors,seaPoint} from './shipSave';
import {tidalApproach} from './tidalCaves';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {worldTreeBlocksBuilding} from './worldTree';

export const VOLCANIC_AGES=['young','weathered','atoll'] as const;
type VolcanicAge=typeof VOLCANIC_AGES[number];
export type VolcanicIsland={index:number;radius:number;age:VolcanicAge};
export type Volcano={index:number;rim:number;radius:number;period:number;offset:number};
export type VolcanicLayout={islands:VolcanicIsland[];vents:Volcano[];caldera?:Caldera};

const directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] as const;
const names=['Cinder','Redwake','Obsidian','Ashmantle','Ironcloud','Emberglass','Smokecrest','Fireglass'];
export function volcanoName(volcano:Volcano,world:Pick<World,'settings'|'volcanicLayout'>){
  const base=(vent:Volcano)=>names[Math.floor(terrainHash(vent.index,world.settings.seed,20311)*names.length)%names.length];
  const label=base(volcano),vents=world.volcanicLayout?.vents??[];
  const before=vents.slice(0,vents.findIndex(vent=>vent.index===volcano.index));
  const number=before.filter(vent=>base(vent)===label).length;
  return 'Mount '+label+(number===1?' II':number===2?' III':'');
}
export const volcanicIslandName=(island:VolcanicIsland,caldera?:Caldera)=>island.index===caldera?.lake[0]?
  'Caldera Lake':island.age==='young'?
  'Young volcano':island.age==='weathered'?'Weathered volcanic island':'Coral atoll';

function oceanRoom(width:number,height:number,biomes:readonly Biome[]){
  const open=new Uint8Array(biomes.length),queue:number[]=[];
  const add=(i:number)=>{
    if(i<0||open[i]||biomes[i]!=='water')return;
    open[i]=1;queue.push(i);
  };
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
  for(let y=1;y<height-1;y++){add(y*width);add(y*width+width-1);}
  for(const i of queue)for(const next of seaNeighbors(i,width,biomes.length))add(next);
  const stride=width+1,prefix=new Uint32Array(stride*(height+1));
  for(let y=0;y<height;y++){
    let count=0;
    for(let x=0;x<width;x++){
      count+=open[y*width+x];
      const i=(y+1)*stride+x+1;
      prefix[i]=prefix[i-stride]+count;
    }
  }
  return (x:number,y:number,r:number)=>{
    const left=x-r,top=y-r,right=x+r+1,bottom=y+r+1;
    return left>=1&&top>=1&&right<width&&bottom<height&&
      prefix[bottom*stride+right]-prefix[bottom*stride+left]-
      prefix[top*stride+right]+prefix[top*stride+left]===(2*r+1)**2;
  };
}

function islandChain(width:number,height:number,seed:number,biomes:readonly Biome[]):VolcanicIsland[]{
  const clear=oceanRoom(width,height,biomes);
  const preferred=Math.min(9,Math.max(5,Math.round(Math.min(width,height)/14)));
  for(let young=preferred;young>=3;young--){
    const older=young+1,atoll=Math.max(3,young-1);
    let best:VolcanicIsland[]=[],score=-Infinity;
    for(let y=young+2;y<height-young-2;y++)for(let x=young+2;x<width-young-2;x++){
      if(!clear(x,y,young+1))continue;
      for(const [dx,dy] of directions){
        const gap=young+older+3,ax=x+dx*gap,ay=y+dy*gap;
        const bend=terrainHash(x,y,seed+9321)<.5?-1:1,span=older+atoll+3;
        const bx=ax+dx*span-dy*bend*2,by=ay+dy*span+dx*bend*2;
        if(!clear(ax,ay,older+1)||!clear(bx,by,atoll+1))continue;
        const warmth=1-Math.abs((y+ay+by)/3/height-.54);
        const next=terrainHash(x+dx*7,y+dy*7,seed+5913)+warmth*.55;
        if(next<=score)continue;
        score=next;
        best=[{index:y*width+x,radius:young,age:'young'},
          {index:ay*width+ax,radius:older,age:'weathered'},
          {index:by*width+bx,radius:atoll,age:'atoll'}];
      }
    }
    if(best.length)return best;
  }
  return [];
}

function sculptIsland(width:number,height:number,seed:number,biomes:Biome[],heights:number[],
  island:VolcanicIsland){
  const {x,y}=seaPoint(width,island.index),r=island.radius;
  const wind=terrainHash(9,33,seed+6911)*Math.PI*2;
  const inlet=terrainHash(x,y,seed+7851)*Math.PI*2;
  const variation=terrainHash(x,y,seed+7469)*Math.PI*2;
  const elongation=.10+terrainHash(x,y,seed+2879)*.24;
  const headlands=2+Math.floor(terrainHash(x,y,seed+8129)*4);
  const steepness=.85+terrainHash(x,y,seed+4439)*.65;
  const summit=.84+terrainHash(x,y,seed+5041)*.32;
  const lagoon=.38+terrainHash(x,y,seed+3893)*.23;
  for(let dy=-r-1;dy<=r+1;dy++)for(let dx=-r-1;dx<=r+1;dx++){
    const nx=x+dx,ny=y+dy,i=ny*width+nx;
    const angle=Math.atan2(dy,dx),length=Math.hypot(dx,dy);
    const grain=terrainNoise(nx,ny,2.4,seed+3069);
    const outline=1-elongation*Math.sin(angle-variation)**2+
      .13*Math.sin(angle*headlands+variation)+grain*.12;
    const radial=length/(r*outline);
    if(radial>1.09)continue;
    if(island.age==='atoll'){
      // Submerged reef shelves extend through the inlet so boats can pass.
      const opening=dx*Math.cos(inlet)+dy*Math.sin(inlet)>0&&
        Math.abs(dx*Math.sin(inlet)-dy*Math.cos(inlet))<1.3;
      heights[i]=SEA_LEVEL-(radial<lagoon?6:radial<1?2:4);
      if(radial<lagoon||radial>.99||opening)continue;
      heights[i]=SEA_LEVEL+Math.max(2,Math.round((.55+grain)*5));
      biomes[i]=radial>.84||grain<-.25?'wasteland':'plains';
      continue;
    }
    if(radial>1){heights[i]=SEA_LEVEL-2;continue;}
    if(island.age==='young'){
      const channels=(Math.sin(angle*4+variation)+1)*.5;
      const shoulder=Math.max(0,1-radial);
      // The lip rises around the crater. A low spillway gives lava a
      // downhill route, while the other side has a stable approach.
      const downhill=Math.max(0,Math.cos(angle-inlet))**5;
      const peak=shoulder**steepness*(123*summit+grain*16)-
        downhill*Math.max(0,.83-radial)*35-channels*radial*shoulder*20;
      heights[i]=SEA_LEVEL+2+Math.round(Math.max(0,peak-Math.max(0,1-length)*37));
      biomes[i]=radial>.80?'wasteland':'volcanic';
      continue;
    }
    const valley=(.5+.5*Math.sin(angle*3+variation))**5;
    const ridge=Math.max(0,1-radial)**steepness*(87*summit+grain*23)-valley*(1-radial)*37;
    const exposure=(dx*Math.cos(wind)+dy*Math.sin(wind))/Math.max(1,length);
    const rain=exposure*.68+valley*.37+terrainHumidity(nx,ny,r*3,seed)*.43+grain*.26;
    heights[i]=SEA_LEVEL+4+Math.round(Math.max(0,ridge));
    biomes[i]=radial<.19&&grain>.13?'mountain':rain>.18?'forest':
      rain<-.19?'savanna':valley>.63&&radial>.46&&radial<.84?'wetland':'plains';
  }
}

const site=(index:number,rim:number,radius:number,seed:number):Volcano=>{
  const period=82+Math.floor(terrainHash(index,55,seed)*46);
  // Quiet at creation, with the first eruption several days into the year.
  const offset=period-(9+Math.floor(terrainHash(index,89,seed)*19));
  return {index,rim,radius,period,offset};
};

function landVents(width:number,height:number,seed:number,biomes:readonly Biome[],
  heights:readonly number[],existing:Volcano[],protectedTile:(index:number)=>boolean){
  const vents=existing.slice();
  const choices:{index:number;rim:number;score:number}[]=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x,biome=biomes[i];
    if(biome==='water'||heights[i]<SEA_LEVEL+12||protectedTile(i))continue;
    const neighbor=seaNeighbors(i,width,biomes.length);
    const rim=neighbor.filter(j=>j>=0&&biomes[j]!=='water'&&!protectedTile(j))
      .sort((a,b)=>heights[b]-heights[a])[0];
    if(rim===undefined)continue;
    const coastal=neighbor.some(j=>biomes[j]==='water');
    const score=(biome==='volcanic'?4:biome==='mountain'?1:0)+(coastal?.65:0)+
      heights[i]/240+terrainHash(x,y,seed+5391);
    choices.push({index:i,rim,score});
  }
  choices.sort((a,b)=>b.score-a.score||a.index-b.index);
  for(const {index,rim} of choices){
    if(vents.length>=3)break;
    const {x,y}=seaPoint(width,index);
    if(vents.some(vent=>Math.hypot(vent.index%width-x,Math.floor(vent.index/width)-y)<14))continue;
    vents.push(site(index,rim,7,seed));
  }
  return vents;
}

/** Run before climate, runoffs, settlements and root placement see the shore. */
export function sculptVolcanicIslands(width:number,height:number,seed:number,biomes:Biome[],heights:number[]){
  const islands=islandChain(width,height,seed,biomes);
  for(const island of islands)sculptIsland(width,height,seed,biomes,heights,island);
  return islands;
}

export function volcanicLayout(width:number,height:number,seed:number,biomes:readonly Biome[],
  heights:readonly number[],islands:VolcanicIsland[],
  blocks:(index:number)=>boolean,caldera?:Caldera):VolcanicLayout{
  const young=islands.find(island=>island.age==='young');
  const collar=young&&seaNeighbors(young.index,width,biomes.length)
    .filter(i=>biomes[i]!=='water'&&!blocks(i)).sort((a,b)=>heights[b]-heights[a])[0];
  const primary=young&&collar!==undefined&&!blocks(young.index)?
    [site(young.index,collar,young.radius+5,seed)]:[];
  const nearChain=(index:number)=>{
    const {x,y}=seaPoint(width,index);
    return islands.some(island=>Math.hypot(island.index%width-x,Math.floor(island.index/width)-y)<island.radius+1);
  };
  return {islands,...(caldera?{caldera}:{}),vents:landVents(width,height,seed,biomes,heights,primary,index=>
    blocks(index)||nearChain(index))};
}

export function enableVolcanicWorld(world:World):World{
  if(world.volcanicLayout?.vents.length)return world;
  const {width,height,tiles}=world,seed=world.settings.seed;
  const blocked=new Set((world.ancientSites??[]).map(site=>site.y*width+site.x));
  for(const town of world.settlements){
    blocked.add(town.y*width+town.x);
    for(const plot of town.infrastructure?.buildings??[])blocked.add(plot.y*width+plot.x);
  }
  const layout=volcanicLayout(width,height,seed,tiles.map(tile=>tile.biome),topographyForWorld(world).heights,[],
    index=>blocked.has(index)||tidalApproach(world,index)||
      worldTreeBlocksBuilding(world.worldTree,index%width,Math.floor(index/width)));
  if(!layout.vents.length)return world;
  return {...world,settings:{...world.settings,volcanicWorld:true},volcanicLayout:layout};
}

export const volcanoApproach=(world:Pick<World,'volcanicLayout'|'underworld'>,index:number)=>
  world.underworld?.outpost===index||!!world.volcanicLayout?.caldera?.outflow.includes(index)||
  !!world.volcanicLayout?.vents.some(vent=>vent.index===index||vent.rim===index);
export const ventHasGround=(world:World,vent:Volcano)=>
  world.tiles[vent.index].biome!=='water'&&world.tiles[vent.rim].biome!=='water';
export function volcanicCoastBiome(width:number,height:number,index:number,seed:number):Biome{
  const {x,y}=seaPoint(width,index);
  const moisture=terrainHumidity(x,y,Math.min(width,height),seed);
  if(moisture>.13)return terrainTemperature(x,y,Math.min(width,height),y/height,seed)<.46?'taiga':'forest';
  return moisture<-.17?'savanna':'plains';
}

export function validVolcanicLayout(value:unknown,width:number,height:number):value is VolcanicLayout{
  if(!value||typeof value!=='object')return false;
  const {islands,vents,caldera}=value as VolcanicLayout,size=width*height;
  const count=(n:number,min:number,max:number)=>Number.isInteger(n)&&n>=min&&n<=max;
  if(!Array.isArray(islands)||islands.length>3||!Array.isArray(vents)||vents.length>3)return false;
  const validIndex=(i:number)=>count(i,0,size-1);
  return islands.every(island=>island&&validIndex(island.index)&&count(island.radius,3,11)&&
    VOLCANIC_AGES.includes(island.age))&&new Set(islands.map(island=>island.index)).size===islands.length&&
    vents.every(vent=>vent&&validIndex(vent.index)&&validIndex(vent.rim)&&
      seaNeighbors(vent.index,width,size).includes(vent.rim)&&count(vent.radius,5,14)&&
      count(vent.period,70,140)&&count(vent.offset,0,vent.period-1))&&
    new Set(vents.map(vent=>vent.index)).size===vents.length&&
    (caldera===undefined||islands.some(island=>island.age==='weathered'&&validCaldera(caldera,width,height,island.index)));
}
