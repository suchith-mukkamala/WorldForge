import type {World} from './engine';
import {calderaRiver} from './caldera';
import {terrainHash} from './biomeGeneration';
import {hydrologyForWorld,type Hydrology} from './hydrology';
import {oceanBasins,shallowCrossing} from './regionalGeography';
import {SEA_LEVEL,topographyForWorld} from './topography';

export type RiverStopKind='source'|'falls'|'valley'|'ford'|'mouth'|'barrier';
export type RiverStop={kind:RiverStopKind;index:number;label:string};
export type RiverCourse={mouth:number;outlet:number;name:string;path:readonly number[];
  stops:readonly RiverStop[];delta:boolean;discharge?:number};
const names=['Alder','Silverrun','Ember','Mosswater','Cairn','High Reed','Willow','Greybank'];
const cache=new WeakMap<Hydrology,{outflow?:readonly number[];courses:readonly RiverCourse[]}>();

/** The main stem of each listed river is a chain of real downstream
 * neighbors. Its stops are picked from slope, vegetation and bank access. */
export function riverCourses(world:World):readonly RiverCourse[]{
  const drainage=hydrologyForWorld(world),cached=cache.get(drainage),outflow=calderaRiver(world);
  if(cached&&cached.outflow===outflow)return cached.courses;
  const {width,height,tiles}=world,heights=topographyForWorld(world).heights;
  const {flowTo,channel,catchment,basin}=drainage;
  const feeder=new Int32Array(tiles.length).fill(-1),mouths:number[]=[];
  for(let i=0;i<channel.length;i++){
    const target=flowTo[i];
    if(!channel[i]||target<0)continue;
    if(tiles[target].biome==='water'){
      mouths.push(i);
      continue;
    }
    if(feeder[target]<0||catchment[i]>catchment[feeder[target]])feeder[target]=i;
  }
  const seas=oceanBasins(world,drainage),coastal=(i:number)=>seas.has(basin[flowTo[i]]);
  mouths.sort((a,b)=>Number(coastal(b))-Number(coastal(a))||catchment[b]-catchment[a]||a-b);
  const rivers:RiverCourse[]=[];
  if(outflow){
    const path=outflow.slice(1,-1),mouth=path[path.length-1],outlet=outflow[outflow.length-1];
    rivers.push({mouth,outlet,path,name:'Caldera outflow',delta:false,stops:[
      {kind:'source',index:path[0],label:'Caldera outlet'},
      {kind:'mouth',index:mouth,label:'River mouth'},
    ]});
  }
  const phase=Math.floor(terrainHash(width,height,world.settings.seed+812)*names.length);
  for(const mouth of mouths){
    if(rivers.length>=5)break;
    const x=mouth%width,y=Math.floor(mouth/width);
    if(rivers.some(r=>Math.max(Math.abs(r.mouth%width-x),
      Math.abs(Math.floor(r.mouth/width)-y))<6))continue;
    const path:number[]=[];
    for(let at=mouth;at>=0;at=feeder[at])path.push(at);
    if(path.length<5)continue;
    path.reverse();
    const stops:RiverStop[]=[{kind:'source',index:path[0],label:'Headwaters'}];
    let falls=-1,valley=-1,ford=-1,drop=6,trees=0,crossing=Infinity;
    for(let step=1;step<path.length-1;step++){
      const index=path[step],next=path[step+1],z=heights[index],fall=z-heights[next];
      if(fall>drop){drop=fall;falls=index;}
      const x=index%width,y=Math.floor(index/width);
      const bank=[x>0?index-1:index,x+1<width?index+1:index,
        y>0?index-width:index,y+1<height?index+width:index];
      const forest=bank.filter(i=>tiles[i].biome==='forest'||tiles[i].biome==='taiga').length;
      const shelter=bank.reduce((sum,i)=>sum+Math.max(0,heights[i]-z),0);
      const wood=forest*4+Math.min(8,shelter*.15);
      if(forest&&wood>trees){trees=wood;valley=index;}
      if(channel[index]<3&&fall<=7&&shallowCrossing(world,index,next,heights)){
        const score=Math.abs(step/path.length-.68)+Math.abs(fall)*.035;
        if(score<crossing){crossing=score;ford=index;}
      }
    }
    if(falls>=0)stops.push({index:falls,kind:'falls',label:'Waterfall'});
    if(valley>=0)stops.push({index:valley,kind:'valley',label:'Wooded valley'});
    if(ford>=0)stops.push({index:ford,kind:'ford',label:'Shallow ford'});
    const delta=coastal(mouth)&&channel[mouth]>=2&&heights[mouth]<=SEA_LEVEL+18;
    stops.push({index:mouth,kind:'mouth',label:delta?'River delta':coastal(mouth)?'River mouth':'Lakeshore'});
    stops.sort((a,b)=>path.indexOf(a.index)-path.indexOf(b.index));
    rivers.push({mouth,outlet:flowTo[mouth],name:names[(phase+rivers.length)%names.length]+' River',
      path,stops,delta});
  }
  cache.set(drainage,{outflow,courses:rivers});
  return rivers;
}
