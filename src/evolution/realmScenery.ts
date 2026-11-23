import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Facing} from './motion';
import {seaNeighbors,seaPoint} from './shipSave';
import {RealmBiome,type RealmLink,type RealmMap} from './underworld';

export type RealmFormationKind='fungus'|'crystal'|'spire'|'vent'|'calcite';
export type RealmFormation={kind:RealmFormationKind;variant:number;size:number;dx:number;dy:number};
export type RealmEffectKind='spore'|'spark'|'foam'|'steam'|'gleam'|'bat';
export type RealmEffect={cell:number;kind:RealmEffectKind;phase:number};
export type RealmScenery={
  formations:Map<number,RealmFormation>;
  landmarks:Set<number>;
  docks:Map<number,Facing>;
  gates:Map<number,RealmLink['kind']>;
  coast:Uint8Array;
  effects:RealmEffect[];
};
const scenes=new WeakMap<RealmMap,RealmScenery>();
const {basalt,ember,lava,steam,glowroot,crystal,chalk,sea}=RealmBiome;

function coastalDepth({width,height,biomes}:RealmMap){
  const coast=new Uint8Array(biomes.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(biomes[i]===sea)coast[i]=Math.min(4,x>0?coast[i-1]+1:4,y>0?coast[i-width]+1:4);
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(coast[i])coast[i]=Math.min(coast[i],x+1<width?coast[i+1]+1:4,y+1<height?coast[i+width]+1:4);
  }
  return coast;
}

/** Decoration is seeded from the saved cave floor. Roads, houses, and
 * passage cells leave room for the same routes in the atlas and on foot. */
export function realmScenery(map:RealmMap):RealmScenery{
  const cached=scenes.get(map);
  if(cached)return cached;
  const {width:w,height:h,biomes,heights,seed}=map;
  const formations=new Map<number,RealmFormation>(),docks=new Map<number,Facing>(),landmarks=new Set<number>();
  const gates=new Map(map.links.map(link=>[link.cell,link.kind]));
  const occupied=new Set([...map.roads,...map.houses.keys(),...gates.keys()]);
  const structures=new Set([...map.houses.keys(),...gates.keys(),...map.towns.map(town=>town.index)]);
  for(const town of map.towns){
    occupied.add(town.index);
    const landmark=[...map.houses].find(([,owner])=>owner.id===town.id)?.[0];
    if(landmark!==undefined)landmarks.add(landmark);
    if(town.berth===undefined)continue;
    occupied.add(town.berth);
    const {x,y}=seaPoint(w,town.berth),land=seaPoint(w,town.index);
    docks.set(town.berth,x<land.x?'east':x>land.x?'west':y<land.y?'south':'north');
  }
  const coast=coastalDepth(map),effects:RealmEffect[]=[];
  const density=Math.max(.58,Math.min(1,Math.sqrt(2800/biomes.length)));
  for(let i=0;i<biomes.length;i++){
    const {x,y}=seaPoint(w,i),kind=biomes[i],roll=terrainHash(x,y,seed+931);
    const phase=terrainHash(i,23,seed);
    if(kind===lava&&!map.bridges.has(i)&&roll>.36)effects.push({cell:i,kind:'spark',phase});
    if(kind===sea&&!docks.has(i)&&coast[i]<=3&&roll>.78)effects.push({cell:i,kind:'foam',phase});
    if(occupied.has(i)||kind===sea||kind===lava)continue;
    const pocket=terrainNoise(x,y,4.2,seed+133);
    const chance=kind===glowroot?(pocket>-.02?.57:.22):kind===crystal?(pocket>-.13?.51:.19):
      kind===steam?.26:kind===chalk?.14:kind===basalt?(pocket>.13?.23:.065):.09;
    if(roll>chance*density)continue;
    const adjacent=seaNeighbors(i,w,biomes.length);
    if((kind===basalt||kind===ember)&&adjacent.some(j=>structures.has(j)))continue;
    const grade=Math.max(0,...adjacent.map(j=>j>=0?Math.abs(heights[j]-heights[i]):0));
    const room=x>=2&&y>=2&&x<w-2&&y<h-2&&grade<5&&adjacent.every(j=>!occupied.has(j));
    const size=room&&phase>.82?2:room&&phase>.35?1:0;
    const form=kind===glowroot?'fungus':kind===crystal?'crystal':kind===steam?'vent':kind===chalk?'calcite':'spire';
    const mineral=terrainNoise(x,y,7,seed+1017);
    const hot=adjacent.some(j=>biomes[j]===ember||biomes[j]===lava);
    const variant=form==='crystal'?(hot&&phase>.35?2:mineral>.03?1:0):Math.floor(terrainHash(i,41,seed)*3);
    const dx=(terrainHash(i,44,seed)-.5)*.32,dy=(terrainHash(i,49,seed)-.5)*.32;
    formations.set(i,{kind:form,variant,size,dx,dy});
    if(form==='vent')effects.push({cell:i,kind:'steam',phase});
    if(form==='fungus'&&phase>.25)effects.push({cell:i,kind:'spore',phase});
    if(form==='crystal'&&phase>.2)effects.push({cell:i,kind:'gleam',phase});
    if(form==='spire'&&kind===basalt&&phase>.6)effects.push({cell:i,kind:'bat',phase});
  }
  const scene={formations,landmarks,docks,gates,coast,effects};
  scenes.set(map,scene);
  return scene;
}

export const realmFormationUnit=(size:number)=>[.40,.57,.79][size];
