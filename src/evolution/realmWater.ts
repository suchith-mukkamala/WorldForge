import type {World} from './engine';
import {hydrologyForWorld} from './hydrology';
import {RealmBiome} from './realmGeography';
import type {RiverCourse,RiverStop} from './riverCourses';
import {waterSeason,type RiverLink} from './riverSeasons';
import {seaNeighbors,seaPoint} from './shipSave';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {topographyForWorld} from './topography';
import {projectWorldLayer,type RealmMap} from './underworld';
import {lavaField} from './volcanism';

export type RealmInlet={path:number[];cell:number;bank:number};
export type RealmWatershed={main:RealmInlet;spill?:RealmInlet;spillRise:number};
export type LakeLevel=0|1|2;
export type RealmWaterRoute='lake'|'overflow'|'blocked';
export type CavernFlow={plan:RealmWatershed;route:RealmWaterRoute;dam?:number};
export type RealmWaterFloor={seasonal:Set<number>;fall?:{bank:number;outlet:number;flow:1|2}};
export type RealmWaterView=CavernFlow&{map:RealmMap;level:LakeLevel;runoff:LakeLevel;ledges:readonly number[]};

type Mouth=Pick<RealmInlet,'cell'|'bank'>;
const {sea,lava,chalk}=RealmBiome;
const MAX_REACH=12,MAX_SPILL_STEPS=9;
const adjacent=(map:Pick<RealmMap,'width'|'biomes'>,cell:number)=>
  seaNeighbors(cell,map.width,map.biomes.length).filter(i=>i>=0);
const distance=(a:number,b:number,w:number)=>
  Math.hypot(a%w-b%w,Math.floor(a/w)-Math.floor(b/w));
export const inletSurface=(inlet:RealmInlet)=>inlet.path[inlet.path.length-1];

function reservedCells(map:RealmMap){
  return new Set([...map.roads,...map.houses.keys(),...map.links.map(link=>link.cell),
    ...map.towns.flatMap(town=>town.berth===undefined?[town.index]:[town.index,town.berth])]);
}

function lakeCells(map:RealmMap,start:number){
  if(map.biomes[start]!==sea)return new Set<number>();
  const found=new Set([start]);
  for(const i of found)for(const next of adjacent(map,i))if(map.biomes[next]===sea)found.add(next);
  return found;
}

/** Flood only a pocket with a continuous natural rim. A shelf that spills
 * toward a road, cliff, or another lake cannot hold an isolated pool. */
function overflowPocket(map:RealmMap,{cell,bank}:Mouth,reserved:Set<number>){
  const {width,heights,biomes}=map;
  const cap=Math.min(heights[cell]+2,heights[bank]-2);
  fill:for(let waterline=cap;waterline>heights[cell];waterline--){
    const cells=new Set([cell]);
    for(const i of cells)for(const next of adjacent(map,i)){
      if(heights[next]>=waterline||cells.has(next))continue;
      if(reserved.has(next)||biomes[next]===sea||biomes[next]===lava||
        distance(cell,next,width)>2||cells.size>=7||adjacent(map,next).length<4)continue fill;
      cells.add(next);
    }
    return {cells,waterline};
  }
}

/** A small real reach of river feeds a shelf on the lake reachable from the
 * existing wharf. Subsurface routes stay fixed after the topography changes. */
export function planRealmWater(world:World,map:RealmMap):RealmWatershed|null{
  const dock=map.towns.find(town=>town.berth!==undefined)?.berth;
  if(dock===undefined)return null;
  const {width,height,tiles}=world,{channel,catchment,flowTo}=hydrologyForWorld(world);
  const heights=topographyForWorld(world).heights;
  const lake=lakeCells(map,dock),reserved=reservedCells(map);
  const dry=(i:number)=>i>=0&&!reserved.has(i)&&map.biomes[i]!==lava&&map.biomes[i]!==sea;
  const mouths=new Map<number,Mouth>();
  const surfaceExits=new Set(map.links.map(link=>link.surface));
  for(const cell of lake){
    if(reserved.has(cell)||distance(cell,dock,map.width)<2)continue;
    const bank=adjacent(map,cell).filter(dry).sort((a,b)=>map.heights[b]-map.heights[a])[0];
    if(bank!==undefined)mouths.set(cell,{cell,bank});
  }
  const nearbyMouths:Array<Mouth|undefined>=Array(map.biomes.length);
  // Prefer a mouth on the same square or its nearest shore. Spread this
  // lookup once so scanning river tiles stays linear.
  for(const {cell,bank} of mouths.values()){
    const {x,y}=seaPoint(map.width,cell);
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      if(dx*dx+dy*dy>16||x+dx<0||x+dx>=map.width||y+dy<0||y+dy>=map.height)continue;
      const target=(y+dy)*map.width+x+dx,prior=nearbyMouths[target];
      if(!prior||distance(target,prior.cell,map.width)>Math.hypot(dx,dy))nearbyMouths[target]={cell,bank};
    }
  }
  const feeders=new Int32Array(tiles.length).fill(-1);
  for(let i=0;i<channel.length;i++){
    const next=flowTo[i];
    if(next<0)continue;
    if(feeders[next]<0||catchment[feeders[next]]<catchment[i])feeders[next]=i;
  }
  const vents=world.volcanicLayout?.vents??[];
  const volcanicReach=(i:number)=>Math.max(0,...vents.map(vent=>vent.radius-distance(i,vent.index,width)));
  const choices:{main:RealmInlet;score:number}[]=[];
  for(let surface=0;surface<tiles.length;surface++){
    if(!channel[surface]||surfaceExits.has(surface))continue;
    const below=projectWorldLayer(surface,world,map),mouth=nearbyMouths[below];
    if(!mouth)continue;
    const path=[surface];
    for(let i=feeders[surface];i>=0&&path.length<MAX_REACH;i=feeders[i])path.push(i);
    if(path.length<2)continue;
    path.reverse();
    const exposure=Math.max(...path.slice(1).map(volcanicReach));
    const score=channel[surface]*2+Math.log2(catchment[surface])*.42+exposure*1.4+
      map.heights[mouth.bank]*.08-distance(mouth.cell,below,map.width)*1.8;
    choices.push({main:{...mouth,path},score});
  }
  choices.sort((a,b)=>b.score-a.score);
  const first=choices[0]?.main;
  if(!first)return null;

  // Identify an unused low pocket separate from the permanent lake. Its
  // banks and bed can be exposed without flooding roads or town tiles.
  const overflowMouths:Array<Mouth|undefined>=Array(map.biomes.length);
  for(let cell=0;cell<map.biomes.length;cell++){
    if(!dry(cell))continue;
    const neighbors=adjacent(map,cell);
    if(neighbors.length<4||neighbors.some(i=>map.biomes[i]===sea))continue;
    const banks=neighbors.filter(dry).sort((a,b)=>map.heights[b]-map.heights[a]);
    if(banks.length<2)continue;
    const mouth={cell,bank:banks[0]};
    if(overflowPocket(map,mouth,reserved))overflowMouths[cell]=mouth;
  }
  let best:{plan:RealmWatershed;score:number}|undefined;
  for(const {main,score} of choices.slice(0,18)){
    const occupied=new Set(main.path);
    for(let n=0;n<main.path.length-1;n++){
      const fork=main.path[n],reach=Math.max(...main.path.slice(n+1).map(volcanicReach));
      if(best&&score+reach*.75+4<best.score)continue;
      const parents=new Map([[fork,{previous:fork,steps:0,rise:0}]]);
      const queue=[fork];
      for(const surface of queue){
        const {steps,rise}=parents.get(surface)!;
        if(steps&&!surfaceExits.has(surface)){
          const below=projectWorldLayer(surface,world,map),p=seaPoint(map.width,below);
          for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
            if(dx*dx+dy*dy>5||p.x+dx<0||p.x+dx>=map.width||p.y+dy<0||p.y+dy>=map.height)continue;
            const mouth=overflowMouths[(p.y+dy)*map.width+p.x+dx];
            if(!mouth||distance(main.cell,mouth.cell,map.width)<4)continue;
            const value=score+reach*.75+(map.biomes[mouth.cell]===chalk?1:.15)+
              Math.min(5,map.heights[mouth.bank]-map.heights[mouth.cell])*.3-
              Math.hypot(dx,dy)*1.2-steps*.34-rise*.45;
            if(best&&value<=best.score)continue;
            const path=[surface];
            for(let i=surface;i!==fork;){i=parents.get(i)!.previous;path.push(i);}
            best={score:value,plan:{main,spill:{...mouth,path:path.reverse()},spillRise:rise}};
          }
        }
        if(steps>=MAX_SPILL_STEPS)continue;
        for(const next of seaNeighbors(surface,width,width*height)){
          if(next<0||parents.has(next)||occupied.has(next)||tiles[next].biome==='water')continue;
          const crest=Math.max(rise,heights[next]-heights[fork]);
          if(crest>7)continue;
          parents.set(next,{previous:surface,steps:steps+1,rise:crest});queue.push(next);
        }
      }
    }
  }
  return best?.plan??{main:first,spillRise:0};
}

export function validRealmWatershed(value:unknown,width:number,height:number,columns:number,rows:number):value is RealmWatershed|null{
  if(value===null)return true;
  if(!value||typeof value!=='object')return false;
  const {main,spill,spillRise}=value as RealmWatershed;
  const index=(i:number,size:number)=>Number.isInteger(i)&&i>=0&&i<size;
  const inlet=(site:RealmInlet,max:number)=>site&&index(site.cell,columns*rows)&&index(site.bank,columns*rows)&&
    seaNeighbors(site.cell,columns,columns*rows).includes(site.bank)&&Array.isArray(site.path)&&
    site.path.length>=2&&site.path.length<=max&&new Set(site.path).size===site.path.length&&
    site.path.every((cell,i)=>index(cell,width*height)&&(!i||distance(cell,site.path[i-1],width)<=Math.SQRT2));
  return inlet(main,MAX_REACH)&&index(spillRise,8)&&(spill===undefined||inlet(spill,MAX_SPILL_STEPS+1)&&
    main.path.slice(0,-1).includes(spill.path[0])&&spill.path.slice(1).every(i=>!main.path.includes(i))&&
    spill.cell!==main.cell);
}

type Basin={plan:RealmWatershed;lake:Set<number>;ledges:number[];overflow:ReturnType<typeof overflowPocket>;
  seasonal:Set<number>;frames:Map<string,RealmMap>};
const basins=new WeakMap<RealmMap,Basin>();
function basinFor(map:RealmMap,plan:RealmWatershed):Basin{
  const cached=basins.get(map);
  if(cached?.plan===plan)return cached;
  const lake=lakeCells(map,plan.main.cell),reserved=reservedCells(map);
  const {width,heights,biomes}=map;
  const radius=Math.max(4,Math.min(8,Math.round(width*.055)));
  const ledges=[...lake].filter(i=>!reserved.has(i)&&distance(i,plan.main.cell,width)<=radius&&adjacent(map,i)
    .some(j=>biomes[j]!==sea&&biomes[j]!==lava&&!map.houses.has(j)&&heights[j]<=heights[plan.main.bank]+3))
    .sort((a,b)=>distance(a,plan.main.cell,width)-distance(b,plan.main.cell,width)).slice(0,28);
  const overflow=plan.spill&&overflowPocket(map,plan.spill,reserved);
  const seasonal=new Set([...ledges,...overflow?.cells??[]]);
  const basin={plan,lake,ledges,overflow,seasonal,frames:new Map<string,RealmMap>()};
  basins.set(map,basin);
  return basin;
}

function lakeFrame(map:RealmMap,basin:Basin,recharged:RealmWaterRoute,runoff:LakeLevel){
  const key=runoff&&recharged!=='blocked'?`${recharged}:${runoff}`:'dry';
  const cached=basin.frames.get(key);
  if(cached)return cached;
  const {plan,lake,ledges,overflow,seasonal}=basin;
  const biomes=map.biomes.slice(),heights=map.heights.slice();
  const level=recharged==='lake'?runoff:0;
  if(level){
    for(const i of lake)heights[i]=level===2?3:1;
  }else{
    for(const i of ledges){biomes[i]=chalk;heights[i]=1;}
  }
  if(recharged==='overflow'&&runoff&&plan.spill&&overflow){
    const waterline=Math.min(overflow.waterline,map.heights[plan.spill.cell]+runoff);
    const wet=new Set([plan.spill.cell]);
    for(const i of wet){
      biomes[i]=sea;heights[i]=waterline;
      for(const j of adjacent(map,i))if(overflow.cells.has(j)&&map.heights[j]<waterline)wet.add(j);
    }
  }
  const active=runoff&&(recharged==='lake'?plan.main:recharged==='overflow'&&overflow?plan.spill:undefined);
  const water:RealmWaterFloor={seasonal,fall:active&&runoff?{bank:active.bank,outlet:active.cell,flow:runoff}:undefined};
  const frame={...map,biomes,heights,water};basin.frames.set(key,frame);
  return frame;
}

/** Solve the local split using real molten and solidified patches. Check a
 * span of squares because a lone lava fleck does not block a river. */
export function cavernFlow(world:Pick<World,'underworld'|'volcanism'|'width'>):CavernFlow|undefined{
  const plan=world.underworld?.watershed;
  if(!plan)return;
  const rock=lavaField(world).byTile;
  const crest=Math.max(2,Math.ceil(plan.spillRise*.5))*TERRAIN_ELEVATION_UNITS;
  const blocked=(i:number)=>{
    const patches=rock.get(i);
    return !!patches&&patches.filter(cell=>cell[2]+cell[3]>=crest).length>=3;
  };
  const dam=plan.main.path.find(blocked);
  let route:RealmWaterRoute='lake';
  if(dam!==undefined){
    const {main,spill}=plan;
    route=spill&&main.path.indexOf(dam)>main.path.indexOf(spill.path[0])&&
      !spill.path.some(blocked)?'overflow':'blocked';
  }
  return {plan,route,dam};
}

export function realmWater(world:World,map:RealmMap):RealmWaterView|undefined{
  const flow=cavernFlow(world);
  if(!flow)return;
  const {plan,route}=flow,basin=basinFor(map,plan),season=waterSeason(world);
  const runoff:LakeLevel=season==='Bloom'?2:season==='Highsun'?0:1;
  return {...flow,map:lakeFrame(map,basin,route,runoff),level:route==='lake'?runoff:0,
    runoff,ledges:basin.ledges};
}

export const cavernFlowKey=(flow:CavernFlow|undefined)=>flow?.dam===undefined?'':`${flow.route}:${flow.dam}`;

/** Replace only the affected reach on the rendered Surface. The existing
 * seasonal river painter uses these links for channel depth and width. */
export function divertedRiverLinks(base:ReadonlyMap<number,readonly RiverLink[]>,width:number,flow?:CavernFlow){
  if(!flow||flow.dam===undefined)return base;
  const {plan,route,dam}=flow;
  const alternate=route==='overflow'?plan.spill?.path:undefined;
  const primary=plan.main.path;
  const from=alternate?primary.indexOf(alternate[0]):Math.max(0,primary.indexOf(dam)-1);
  const links=new Map(base);
  const cut=(a:number,b:number)=>links.set(a,(links.get(a)??[]).filter(link=>link.other!==b));
  for(let i=from;i<primary.length-1;i++){
    cut(primary[i],primary[i+1]);cut(primary[i+1],primary[i]);
  }
  if(alternate){
    const tier=base.get(primary[from])?.find(link=>link.other===primary[from+1])?.tier??2;
    const add=(a:number,b:number)=>links.set(a,[...(links.get(a)??[]).filter(link=>link.other!==b),{
      dx:b%width-a%width,dy:Math.floor(b/width)-Math.floor(a/width),tier,other:b,
    }]);
    for(let i=1;i<alternate.length;i++){
      add(alternate[i-1],alternate[i]);add(alternate[i],alternate[i-1]);
    }
  }
  return links;
}

export function realmWaterStatus(water:RealmWaterView):string{
  if(water.route==='overflow')return water.runoff?
    'Lava diverted the river into the overflow pool. The lake ledge is exposed.':
    'Lava diverted the river. Low runoff has exposed the lake ledge.';
  if(water.route==='blocked')return 'Lava blocked the feeder. The lake ledge is exposed.';
  if(water.level===0)return 'Low water. The lake ledge is open on foot.';
  return water.level===2?'High water. Sail across the flooded ledge.':'The river is feeding the lake. The ledge is underwater.';
}

/** Draw the receiving reach on the Surface atlas using the same branch that
 * changes the cave waterline. The normal stem follows the drainage graph. */
export function cavernFeederCourse({plan,route,runoff,dam}:RealmWaterView):RiverCourse{
  const split=plan.spill&&plan.main.path.indexOf(plan.spill.path[0]);
  const path=route==='overflow'&&plan.spill&&split!==undefined?
    [...plan.main.path.slice(0,split),...plan.spill.path]:route==='blocked'&&dam!==undefined?
    plan.main.path.slice(0,Math.max(1,plan.main.path.indexOf(dam))):plan.main.path;
  const outlet=path[path.length-1];
  const stops:RiverStop[]=[{kind:'source',index:path[0],label:'Feeder upstream'}];
  if(dam!==undefined)stops.push({kind:'barrier',index:dam,label:'Lava dam'});
  if(route!=='blocked')stops.push({kind:'mouth',index:outlet,label:route==='overflow'?'Overflow seep':'Water seep'});
  return {mouth:-1,outlet,name:'Cavern feeder',path:path.slice(0,-1),stops,delta:false,
    discharge:runoff===2?1.65:runoff===1?1:.52};
}
