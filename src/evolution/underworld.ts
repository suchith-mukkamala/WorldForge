import {tidalApproach} from './tidalCaves';
import {terrainHash,terrainNoise} from './biomeGeneration';
import type {World} from './engine';
import {generateRealmGeography,RealmBiome,type RealmLayout} from './realmGeography';
import {planRealmWater,validRealmWatershed,type RealmWaterFloor,type RealmWatershed} from './realmWater';
import {seaNeighbors,seaPoint,validMortalShip,type MortalShip} from './shipSave';
import {skylandMesh} from './skylands';
import {volcanicDay} from './volcanism';
import {type Volcano,volcanoName} from './volcanicGeography';

export {RealmBiome} from './realmGeography';
export type RealmPeople='demon'|'ash-borne';
export type RealmLink={surface:number;cell:number;kind:'crater'|'roots'|'falls'};
type Population={demons:number;ashBorne:number};
export type Underworld={links:RealmLink[];population:Population[];outpost?:number;terraces?:number[];geography?:1;
  watershed?:RealmWatershed|null};
export type RealmVisit={at:number;origin:number;ship?:MortalShip};
export type RealmExploration={chart:number[];visit?:RealmVisit};
export type RealmTown={id:number;index:number;berth?:number;home:RealmPeople;name:string};
export type RealmMap={
  width:number;height:number;seed:number;biomes:Uint8Array;heights:Uint8Array;layout?:RealmLayout;
  towns:RealmTown[];roads:Set<number>;bridges:Set<number>;fords:Set<number>;
  houses:Map<number,RealmTown>;links:RealmLink[];water?:RealmWaterFloor;
};
export type RealmResident={id:number;index:number;people:RealmPeople;name:string;line:string};

const {basalt,ember,lava,steam,glowroot,crystal,chalk,sea}=RealmBiome;
const TOWNS=[
  {name:'Ashgate',home:'ash-borne',demons:18,ashBorne:42,limit:[34,66]},
  {name:'Belowleaf',home:'demon',demons:55,ashBorne:11,limit:[90,28]},
  {name:'Lantern Quay',home:'demon',demons:61,ashBorne:18,limit:[98,36]},
  {name:'Glassbank',home:'ash-borne',demons:24,ashBorne:26,limit:[48,51]},
] as const;
const dimensions=(width:number,height:number)=>({
  width:Math.max(34,Math.min(144,Math.round(width*.62))),
  height:Math.max(25,Math.min(96,Math.round(height*.62))),
});
type GridSize={width:number;height:number};

/** Both atlas layers cover the same world footprint. The floor below uses
 * fewer simulation tiles, so comparisons project through the shared bounds. */
export function projectWorldLayer(index:number,from:GridSize,to:GridSize):number{
  const {x,y}=seaPoint(from.width,index);
  return Math.round(y/(from.height-1)*(to.height-1))*to.width+
    Math.round(x/(from.width-1)*(to.width-1));
}

const distance=(a:number,b:number,w:number)=>
  Math.hypot(a%w-b%w,Math.floor(a/w)-Math.floor(b/w));
const neighbors=(i:number,w:number,n:number)=>seaNeighbors(i,w,n).filter(j=>j>=0);
const faceNames={roots:'World Tree root stair',falls:'Waterfall shaft'};
const maps=new WeakMap<RealmLink[],{terraces:Underworld['terraces'];geography:Underworld['geography'];map:RealmMap}>();
export const realmPeopleName=(people:RealmPeople)=>people==='ash-borne'?'Ash Borne':'Demon';

export function realmLinkName(world:World,link:RealmLink){
  if(link.kind!=='crater')return faceNames[link.kind];
  const vent=world.volcanicLayout?.vents.find(site=>site.rim===link.surface);
  return vent?volcanoName(vent,world):'Crater shaft';
}

function anchors(world:World){
  const links:Omit<RealmLink,'cell'>[]=(world.volcanicLayout?.vents??[])
    .map(vent=>({surface:vent.rim,kind:'crater'}));
  const tree=world.worldTree,fall=world.skylands?.[0]&&skylandMesh(world.skylands[0]).fall.land;
  const flume=world.ancientSites?.find(site=>site.kind==='waterfall-cave');
  const point=fall??flume;
  const add=(surface:number,kind:'roots'|'falls')=>{
    if(world.tiles[surface]?.biome!=='water'&&world.tiles[surface]&&
      links.every(link=>link.surface!==surface))links.push({surface,kind});
  };
  if(tree?.trail.length)add(tree.trail[Math.min(2,tree.trail.length-1)],'roots');
  if(point)add(point.y*world.width+point.x,'falls');
  return links;
}

function baseRealm(world:World,links:readonly Omit<RealmLink,'cell'>[],geography:Underworld['geography']){
  const {width:w,height:h}=dimensions(world.width,world.height),seed=world.settings.seed+72291;
  const project=(surface:number)=>{
    const {x,y}=seaPoint(w,projectWorldLayer(surface,world,{width:w,height:h}));
    return Math.min(h-2,Math.max(1,y))*w+Math.min(w-2,Math.max(1,x));
  };
  const wet=links.filter(link=>link.kind!=='crater').map(link=>project(link.surface));
  if(geography===1)return {w,h,project,...generateRealmGeography(w,h,seed,wet)};

  // Saves without a geography version use the original floor. Their
  // passages, moored boats and walking positions refer to these cells.
  const flip=terrainHash(14,79,seed)<.5,reverse=terrainHash(311,21,seed)<.5;
  const cells=new Uint8Array(w*h),heights=new Uint8Array(cells.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,u=flip?1-x/(w-1):x/(w-1),v=reverse?1-y/(h-1):y/(h-1);
    const grain=terrainNoise(x,y,6,seed),rock=terrainNoise(x,y,12,seed+9113);
    const pool=Math.hypot((u-.73)/.255,(v-.59)/.30);
    const islet=Math.hypot((u-.79)/.075,(v-.61)/.090);
    const undersea=pool<1+grain*.18;
    const center=.36+Math.sin(v*7+seed%13)*.07+Math.sin(v*19)*.023;
    const river=Math.abs(u-center)*w;
    const tributary=Math.abs(v-(.81+Math.sin(u*11)*.045))*h;
    const heat=Math.max(0,1-river/(w*.19))+Math.max(0,1-tributary/(h*.13))*(u<.38?.85:0);
    const seep=Math.max(0,...wet.map(at=>1-distance(i,at,w)/Math.max(6,w*.12)));
    const humidity=.56*Math.max(0,1-Math.hypot((u-.23)/.30,(v-.51)/.51))+
      .20*Math.max(0,1-Math.abs(pool-1))+.18*rock+seep*.85;
    let type:RealmBiome=basalt;
    if(undersea)type=islet<1+grain*.25?(islet>.75?chalk:crystal):sea;
    else if(pool<1.16+grain*.15)type=chalk;
    else if(river<Math.max(.85,w*.012)||u<.31+grain*.12&&tributary<1.25)type=lava;
    else if(heat>.46&&humidity>.43)type=steam;
    else if(humidity>.36+grain*.11)type=glowroot;
    else if(heat>.22)type=ember;
    else if(rock>.27||grain>.43)type=crystal;
    cells[i]=type;
    heights[i]=type===sea?0:type===lava?2:type===chalk?4:
      Math.max(3,Math.round(7+rock*5+grain*4+(type===ember?2:0)));
  }
  return {w,h,cells,heights,project,layout:undefined};
}

function largestRegion(cells:Uint8Array,width:number,water=false):Set<number>{
  const marked=new Uint8Array(cells.length);
  let largest:number[]=[];
  for(let i=0;i<cells.length;i++){
    if(marked[i]||(cells[i]===sea)!==water)continue;
    const region=[i];marked[i]=1;
    for(const at of region)for(const j of neighbors(at,width,cells.length)){
      if(marked[j]||(cells[j]===sea)!==water)continue;
      marked[j]=1;region.push(j);
    }
    if(region.length>largest.length)largest=region;
  }
  return new Set(largest);
}

function placeLinks(world:World,origins:Omit<RealmLink,'cell'>[],geography:Underworld['geography']):RealmLink[]{
  const {w,h,cells,project}=baseRealm(world,origins,geography);
  const links:RealmLink[]=[],mainland=largestRegion(cells,w);
  for(const origin of origins){
    const target=project(origin.surface);
    let cell=-1,best=Infinity;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x;
      if(!mainland.has(i)||cells[i]===lava||links.some(link=>distance(i,link.cell,w)<3))continue;
      // Shores of the crystalline isle are reached by boat. A surface
      // portal belongs to the mainland cave passages.
      const water=neighbors(i,w,cells.length).filter(j=>cells[j]===sea).length;
      const score=distance(i,target,w)+water*.8;
      if(score<best){best=score;cell=i;}
    }
    if(cell>=0)links.push({...origin,cell});
  }
  return links;
}

export function initializeUnderworld(world:World):World{
  if(world.underworld||!world.volcanicLayout?.vents.length)return world;
  const geography=1,links=placeLinks(world,anchors(world),geography),seed=world.settings.seed;
  const older=world.volcanicLayout.islands.find(island=>island.age==='weathered');
  const outpost=older&&world.tiles.findIndex((tile,i)=>tile.biome!=='water'&&
    distance(i,older.index,world.width)<older.radius+.4&&
    seaNeighbors(i,world.width,world.tiles.length).some(j=>world.tiles[j]?.biome==='water')&&
    !nearSurfaceRoots(world,i)&&!tidalApproach(world,i)&&
    !world.ancientSites?.some(p=>p.y*world.width+p.x===i));
  const population=TOWNS.map(({demons,ashBorne},id)=>({
    demons:demons+Math.floor(terrainHash(id,19,seed)*7),
    ashBorne:ashBorne+Math.floor(terrainHash(id,37,seed)*6),
  }));
  return initializeRealmWater({...world,underworld:{links,population,geography,
    ...(outpost!==undefined&&outpost>=0?{outpost}:{})}});
}

/** Attach the watershed once. Old maps, shaft IDs and saved voyages keep
 * their coordinates when the seasonal shoreline is introduced. */
export function initializeRealmWater(world:World):World{
  const state=world.underworld;
  if(!state||state.watershed!==undefined)return world;
  const map=underworldMap(world)!;
  return {...world,underworld:{...state,watershed:planRealmWater(world,map)}};
}

function nearSurfaceRoots(world:World,i:number){
  const tree=world.worldTree;
  return !!tree&&distance(i,tree.y*world.width+tree.x,world.width)<4;
}

/** The realm floor and town plan are reconstructed from the seed and frozen
 * surface links. Eruptions, brush edits and years never reroll its corridors. */
export function underworldMap(world:World):RealmMap|undefined{
  const state=world.underworld;
  if(!state)return;
  const previous=maps.get(state.links);
  if(previous&&previous.terraces===state.terraces&&previous.geography===state.geography)return previous.map;
  const {w,h,cells,heights,layout}=baseRealm(world,state.links,state.geography),seed=world.settings.seed+72291;
  for(const link of state.links){
    if(link.kind!=='crater'||cells[link.cell]!==chalk)continue;
    cells[link.cell]=basalt;
    for(const i of neighbors(link.cell,w,cells.length))if(cells[i]===chalk)cells[i]=basalt;
  }
  const size=cells.length,mainland=largestRegion(cells,w),queue:number[]=[];
  const harbor=layout?largestRegion(cells,w,true):undefined;
  const preference:number[][]=[[ember,steam,basalt],[glowroot,steam,basalt],[chalk],[crystal,steam,ember]];
  const positions:number[]=state.links.map(link=>link.cell),towns:RealmTown[]=[];
  for(const [id,town] of TOWNS.entries()){
    let best=-Infinity,site=-1,berth:number|undefined;
    for(const i of mainland){
      const x=i%w,y=Math.floor(i/w),kind=preference[id].indexOf(cells[i]);
      if(cells[i]===lava||x<2||y<2||x>=w-2||y>=h-2)continue;
      const bank=id===2?neighbors(i,w,size).find(j=>cells[j]===sea&&(!harbor||harbor.has(j))):undefined;
      if(id===2&&bank===undefined)continue;
      const gap=Math.min(w,...positions.map(at=>distance(i,at,w)));
      if(gap<3)continue;
      const open=neighbors(i,w,size).filter(j=>cells[j]!==sea&&cells[j]!==lava).length;
      const landing=layout&&bank!==undefined?Math.max(0,12-heights[i])*.16:0;
      const score=(kind<0?0:3.4-kind*.8)+Math.min(12,gap)*.28+open*.28+landing+terrainHash(x,y,seed+id*197);
      if(score>best){site=i;best=score;berth=bank;}
    }
    if(site>=0){towns.push({id,name:town.name,home:town.home,index:site,berth});positions.push(site);}
  }
  if(layout){
    const quay=towns.find(town=>town.berth!==undefined);
    if(quay)heights[quay.index]=Math.min(heights[quay.index],3);
  }
  const roads=new Set<number>(),bridges=new Set<number>();
  const route=(from:number,to:number)=>{
    if(from===to)return;
    const came=new Int32Array(size).fill(-1);
    const search=(wet:boolean)=>{
      queue.length=0;queue.push(from);came.fill(-1);came[from]=from;
      for(const i of queue){
        if(i===to)return true;
        for(const j of neighbors(i,w,size)){
          if(came[j]>=0||cells[j]===sea||!wet&&cells[j]===lava)continue;
          came[j]=i;queue.push(j);
        }
      }
      return false;
    };
    if(!search(false)&&!search(true))return;
    for(let i=to;i!==from;i=came[i]){
      roads.add(i);
      if(cells[i]===lava)bridges.add(i);
    }
    roads.add(from);
  };
  for(const [n,at] of positions.entries()){
    if(!n)continue;
    const previous=positions.slice(0,n).filter(i=>mainland.has(i));
    if(previous.length)route(at,previous.reduce((a,b)=>distance(at,a,w)<distance(at,b,w)?a:b));
  }
  const houses=new Map<number,RealmTown>();
  for(const town of towns){
    const {x,y}=seaPoint(w,town.index);
    for(const [dx,dy] of [[-2,-1],[1,-2],[2,1],[-2,2],[0,-2],[2,-2]]){
      const i=(y+dy)*w+x+dx;
      if(!mainland.has(i)||positions.includes(i)||houses.has(i)||roads.has(i)||cells[i]===lava)continue;
      const open=neighbors(i,w,size).filter(j=>cells[j]!==lava&&cells[j]!==sea&&!houses.has(j));
      if(open.length<3||open.some(j=>neighbors(j,w,size)
        .filter(k=>k!==i&&cells[k]!==sea&&cells[k]!==lava&&!houses.has(k)).length<2))continue;
      houses.set(i,town);
    }
  }
  const fords=new Set<number>();
  for(const i of mainland){
    if(bridges.has(i)||cells[i]!==lava||terrainHash(i,122,seed)>.29)continue;
    const [n,e,s,west]=seaNeighbors(i,w,size);
    const dry=(j:number)=>j>=0&&cells[j]!==lava&&cells[j]!==sea;
    if((dry(n)&&dry(s)||dry(e)&&dry(west)))fords.add(i);
  }
  for(const i of state.terraces??[])if(fords.delete(i)){bridges.add(i);roads.add(i);}
  const map={width:w,height:h,seed,biomes:cells,heights,towns,roads,bridges,fords,houses,links:state.links,
    ...(layout?{layout}:{})};
  maps.set(state.links,{terraces:state.terraces,geography:state.geography,map});
  return map;
}

export const realmFordOpen=(map:RealmMap,i:number,day:number)=>
  map.fords.has(i)&&(day+Math.floor(terrainHash(i,7,map.seed)*18))%24>=13;
export const realmWalkable=(map:RealmMap,i:number,day:number)=>
  i>=0&&i<map.biomes.length&&!map.houses.has(i)&&map.biomes[i]!==sea&&
  (map.biomes[i]!==lava||map.bridges.has(i)||realmFordOpen(map,i,day));

export function advanceUnderworldPopulation(world:World):void{
  const state=world.underworld;
  if(!state)return;
  const population=state.population.map((group,id)=>{
    const born=(n:number,limit:number,salt:number)=>{
      const roll=terrainHash(world.year,id*2+salt,world.settings.seed+2031);
      const gain=n<limit?(roll<.26?-1:roll>.73?3:1):(roll>.46?-2:0);
      return Math.max(3,Math.min(limit+6,n+gain));
    };
    const [demons,ashBorne]=TOWNS[id].limit;
    return {demons:born(group.demons,demons,1),ashBorne:born(group.ashBorne,ashBorne,2)};
  });
  let terraces=state.terraces;
  // Ashgate expands its causeways as its stoneworkers gain residents.
  // Each project is permanent and goes at an existing seasonal ford.
  if(world.year%6===0&&(terraces?.length??0)<4&&population[0].ashBorne>=42){
    const map=underworldMap(world)!;
    const source=map.towns.find(town=>town.id===0);
    if(source){
      const nearby=[...map.fords].filter(i=>distance(i,source.index,map.width)<map.width*.42)
        .sort((a,b)=>distance(a,source.index,map.width)-distance(b,source.index,map.width));
      if(nearby.length)terraces=[...(terraces??[]),nearby[0]];
    }
  }
  world.underworld={...state,population,terraces};
}

const demonNames=['Veyr','Orith','Neris','Sael','Morrin','Istra','Tareth','Nox'];
const ashNames=['Ironsilt','Keshi','Mora Flint','Ashbell','Tern Coal','Vela Glass','Flint Reed','Sava Cinder'];
export function realmResidents(world:World,map:RealmMap):RealmResident[]{
  const day=volcanicDay(world),size=map.biomes.length;
  return map.towns.flatMap(town=>{
    const population=world.underworld!.population[town.id];
    const near=neighbors(town.index,map.width,size).filter(i=>realmWalkable(map,i,day)&&map.biomes[i]!==lava);
    if(!near.length)return [];
    return (['demon','ash-borne'] as const).map((people,order)=>{
      const names=people==='demon'?demonNames:ashNames;
      const quota=people==='demon'?population.demons:population.ashBorne;
      const name=names[(town.id*2+Math.floor(terrainHash(town.id,11,map.seed)*2))%names.length];
      const i=near[(Math.floor(day/3)+town.id+order)%near.length];
      const line=people==='ash-borne'?[
        'We raised the terraces from cooled flows. When the magma rises, the spillway keeps it clear of the road.',
        'The forest feeds on water from above. Look for pale roots where the stone stays damp.',
        'Our basalt boats ride low. Take the one at the quay if you want to reach the crystal isle.',
        'My grandparents cut steps out of a flow that buried the old bridge.',
      ][town.id]:[
        'Follow the raised road through the Ember Rivers. The lower stepping stones go under when the magma rises.',
        'The roots drink from the surface. Follow a great root to find the stair above.',
        'There are pale beaches beyond the quay. Sail across the Buried Sea and look for crystal light.',
        'Water and fire meet here. The white stone grows around the steam vents.',
      ][town.id];
      return {id:town.id*2+order,name,people,index:i,line:quota>0?line:'The houses here are quiet.'};
    });
  });
}

export function validUnderworld(value:unknown,width:number,height:number):value is Underworld{
  if(!value||typeof value!=='object')return false;
  const {links,population,outpost,terraces,geography,watershed}=value as Underworld,realm=dimensions(width,height);
  const index=(i:number,n:number)=>Number.isInteger(i)&&i>=0&&i<n;
  return (geography===undefined||geography===1)&&Array.isArray(links)&&links.length>0&&links.length<=5&&
    links.some(link=>link?.kind==='crater')&&links.every(link=>link&&index(link.surface,width*height)&&
      index(link.cell,realm.width*realm.height)&&['crater','roots','falls'].includes(link.kind))&&
    new Set(links.map(link=>link.surface)).size===links.length&&
    new Set(links.map(link=>link.cell)).size===links.length&&
    Array.isArray(population)&&population.length===TOWNS.length&&population.every(group=>group&&
      index(group.demons,1000)&&index(group.ashBorne,1000))&&
    (outpost===undefined||index(outpost,width*height))&&
    (watershed===undefined||validRealmWatershed(watershed,width,height,realm.width,realm.height))&&
    (terraces===undefined||Array.isArray(terraces)&&terraces.length<=4&&
      terraces.every(i=>index(i,realm.width*realm.height))&&new Set(terraces).size===terraces.length);
}

export function validRealmExploration(value:unknown,realm:Underworld|undefined,width:number,height:number):
  value is RealmExploration{
  if(!value||typeof value!=='object'||!realm)return false;
  const {chart,visit}=value as RealmExploration,size=dimensions(width,height);
  const known=(i:number)=>realm.links.some(link=>link.surface===i);
  if(!Array.isArray(chart)||chart.length>realm.links.length||!chart.every(known)||
    new Set(chart).size!==chart.length)return false;
  if(visit===undefined)return true;
  if(!visit||!chart.includes(visit.origin)||!Number.isInteger(visit.at)||
    visit.at<0||visit.at>=size.width*size.height)return false;
  return visit.ship===undefined||validMortalShip(visit.ship,size.width,size.height)&&
    (!visit.ship.underway||visit.at===visit.ship.at);
}

export const underworldVent=(world:World,vent:Volcano)=>
  world.underworld?.links.find(link=>link.kind==='crater'&&link.surface===vent.rim);
