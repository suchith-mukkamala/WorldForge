import type {AdventureMap,AdventureRegion} from './adventureMap';
import {occupiedScenery} from './atlasTerrain';
import {terrainHash} from './biomeGeneration';
import type {World} from './engine';
import {fruitTreeAt} from './fruitTrees';
import {directionBetween,type Facing,type Point} from './motion';
import {riverLinks} from './riverSeasons';
import {seaNeighbors,seaPoint} from './shipSave';
import {tidalCaves} from './tidalCaves';
import {topographyForWorld} from './topography';
import {fitsHabitat,seedWildlife,type Herd,type WildlifeKind} from './wildlife';
import {worldTreeBlocksBuilding} from './worldTree';

const obstacles=new WeakMap<World['settlements'],{world:World;blocked:Set<number>}>();
const waterways=new WeakMap<World,ReturnType<typeof riverLinks>>();

function surfaceStreams(world:World){
  let streams=waterways.get(world);
  if(!streams){streams=riverLinks(world);waterways.set(world,streams);}
  return streams;
}

export function surfaceLifeObstacles(world:World){
  const cached=obstacles.get(world.settlements),before=cached?.world;
  if(cached&&before&&before.transport===world.transport&&before.ancientSites===world.ancientSites&&
    before.ruins===world.ruins&&before.volcanicLayout===world.volcanicLayout&&
    before.tidalSites===world.tidalSites&&(world.tidalSites||before.tiles===world.tiles&&before.topography===world.topography)&&
    before.underworld?.outpost===world.underworld?.outpost&&before.worldTree===world.worldTree)
    return cached.blocked;
  const blocked=occupiedScenery(world);
  for(const bridge of world.transport?.bridges??[])if(bridge.condition>25)blocked.add(bridge.index);
  for(const vent of world.volcanicLayout?.vents??[]){blocked.add(vent.index);blocked.add(vent.rim);}
  for(const cave of tidalCaves(world)){blocked.add(cave.mouth);blocked.add(cave.shore);}
  for(const ruin of world.ruins??[])blocked.add(ruin.y*world.width+ruin.x);
  if(world.underworld?.outpost!==undefined)blocked.add(world.underworld.outpost);
  obstacles.set(world.settlements,{world,blocked});
  return blocked;
}

/** Leave a little breathing room beside structures and roads. */
export function surfaceFruitAt(world:World,index:number,blocked=surfaceLifeObstacles(world)){
  const tree=fruitTreeAt(world,index);
  if(!tree||blocked.has(index)||worldTreeBlocksBuilding(world.worldTree,tree.x,tree.y)||surfaceStreams(world).has(index))return;
  if(seaNeighbors(index,world.width,world.tiles.length).some(i=>blocked.has(i)))return;
  return tree;
}

export function adventureFruitAt(world:World,map:AdventureMap,region:AdventureRegion,index:number,
  blocked=surfaceLifeObstacles(world)){
  if(!map.open[index]||region.trail.has(index)||map.roads.has(index)||map.bridges.has(index)||
    region.gates.some(gate=>gate.point.y*world.width+gate.point.x===index))return;
  const tree=surfaceFruitAt(world,index,blocked);
  if(tree)for(const yard of map.shipyards.values())if(yard.shore===index)return;
  return tree;
}

export type LandAnimal=Exclude<WildlifeKind,'fish'>;
export const ANIMAL_NAMES:Record<LandAnimal,string>={
  grazer:'Antelope',browser:'Woodland deer',wader:'Herons',flock:'Wild birds',
};
export type AnimalTrack={kind:LandAnimal;home:number;points:Point[];period:number;
  phase:number;variant:number;young:boolean};
export type AnimalPose=Point&{facing:Facing;stride:0|1|2};

const legacy=new WeakMap<ReturnType<typeof topographyForWorld>,Herd[]>();
export function surfaceHerds(world:World):readonly Herd[]{
  if(world.wildlife)return world.wildlife;
  const key=topographyForWorld(world);
  let found=legacy.get(key);
  if(!found){found=seedWildlife(world);legacy.set(key,found);}
  return found;
}

type RangeCache={tiles:World['tiles'];blocked:ReadonlySet<number>;streams:ReturnType<typeof riverLinks>;
  tree:World['worldTree'];seed:number;tracks:AnimalTrack[]};
const ranges=new WeakMap<readonly Herd[],RangeCache>();

/** A handful of sprites represent a herd. Walking segments join neighboring
 * pieces of suitable ground, so the animation cannot cross a channel or house. */
export function surfaceAnimals(world:World):AnimalTrack[]{
  const herds=surfaceHerds(world),cached=ranges.get(herds);
  const blocked=surfaceLifeObstacles(world),streams=surfaceStreams(world);
  const {width,height,tiles,worldTree,settings:{seed}}=world;
  if(cached?.tiles===tiles&&cached.blocked===blocked&&cached.streams===streams&&
    cached.tree===worldTree&&cached.seed===seed)return cached.tracks;
  const tracks:AnimalTrack[]=[];
  for(const herd of herds){
    const {kind,index,size}=herd;
    if(kind==='fish'||size<1)continue;
    const home=seaPoint(width,index);
    const valid=(i:number)=>{
      if(i<0||blocked.has(i)||streams.has(i)||!fitsHabitat(kind,tiles[i].biome))return false;
      const p=seaPoint(width,i);
      return Math.max(Math.abs(p.x-home.x),Math.abs(p.y-home.y))<=2&&
        !worldTreeBlocksBuilding(worldTree,p.x,p.y);
    };
    const sites:number[]=[];
    for(let y=Math.max(0,home.y-1);y<=Math.min(height-1,home.y+1);y++)
      for(let x=Math.max(0,home.x-1);x<=Math.min(width-1,home.x+1);x++){
        const i=y*width+x;
        if(valid(i))sites.push(i);
      }
    if(!sites.length)continue;
    const herdSeed=seed+Math.imul(herd.id??index,919);
    for(let member=0,count=Math.min(4,Math.ceil(size/9));member<count;member++){
      const roll=(salt:number)=>terrainHash(member,salt,herdSeed);
      let at=member===0&&valid(index)?index:sites[Math.floor(roll(1)*sites.length)%sites.length];
      const path=[at];
      for(let step=0;step<4;step++){
        const neighbors=seaNeighbors(at,width,tiles.length).filter(i=>i!==path.at(-2)&&valid(i));
        if(!neighbors.length)break;
        at=neighbors[Math.floor(roll(40+step)*neighbors.length)%neighbors.length];
        path.push(at);
      }
      const points=[...path,...path.slice(1,-1).reverse()].map(i=>{
        const {x,y}=seaPoint(width,i);
        return {x:x+(roll(14)-.5)*.44,y:y+(roll(19)-.5)*.44};
      });
      tracks.push({kind,home:index,points,period:5000+(1-(herd.means?.speed??.5))*3200+roll(27)*2100,
        phase:roll(71)*155000,variant:Math.floor(roll(41)*4)&3,young:member>0&&roll(62)>.67});
    }
  }
  ranges.set(herds,{tiles,blocked,streams,tree:worldTree,seed,tracks});
  return tracks;
}

export function animalPose(track:AnimalTrack,time:number,animate=true):AnimalPose{
  const clock=(time+track.phase)/track.period,leg=Math.floor(clock);
  const a=track.points[leg%track.points.length],b=track.points[(leg+1)%track.points.length];
  const progress=clock-leg,facing=directionBetween(a,b);
  const step=Math.max(0,Math.min(1,(progress-.15)/.7));
  const moving=animate&&track.points.length>1&&step>0&&step<1;
  return {x:a.x+(b.x-a.x)*step,y:a.y+(b.y-a.y)*step,facing,
    stride:moving?(Math.floor(time/320+track.phase)%2===0?1:2):0};
}

export const animalCalendarTime=(world:Pick<World,'year'|'dayOfYear'>)=>
  (world.year*365+(world.dayOfYear??0))*930;
