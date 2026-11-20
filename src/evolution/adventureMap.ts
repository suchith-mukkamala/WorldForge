import type {Agent,Biome,Settlement,World} from './engine';
import {adventurePlaceKey,type AdventurePlace,type AdventureRoute,type TownStop,
  type WildStop} from './adventurePlaces';
import {isMortalSolidBuilding,mortalTileCapacity,walkMortal,
  walkMortalWithAssist} from './mortalGameplay';
import {RouteFrontier} from './routeFrontier';
import {ferryPassages} from './adventureFerries';
import {isMultiIslandLayout} from './worldGeography';
import {bridgeTiles,roadTiles} from './transport';
import type {Building} from './construction';
import type {Point} from './motion';
import {ancientSiteName} from './knowledge';

export type AdventureLandscape='meadow'|'woodland'|'coast'|'highland'|'ash';
type Bounds={left:number;right:number;top:number;bottom:number};
type Town={place:TownStop;settlement:Settlement;anchor:number;area:Set<number>};
type Route={place:AdventureRoute;path:number[];fromName:string;toName:string;landmark?:true};
type Boundary={a:number;b:number;distance:number;left:number;right:number};

export type AdventureGate={point:Point;destination:AdventurePlace;label:string;direction:Point;
  ferry?:{landing:Point;seaTiles:number};landmark?:true};
export type AdventureRegion={
  place:AdventurePlace;
  name:string;
  landscape:AdventureLandscape;
  focus:Point;
  bounds:Bounds;
  area:ReadonlySet<number>;
  trail:ReadonlySet<number>;
  gates:AdventureGate[];
  settlement?:Settlement;
  ends?:[string,string];
};
export type AdventureMap={
  width:number;height:number;
  open:Uint8Array;
  owners:Int32Array;
  parents:Int32Array;
  roads:ReadonlySet<number>;
  bridges:ReadonlySet<number>;
  buildings:ReadonlyMap<number,{building:Building;settlementId:number}>;
  towns:Town[];
  routes:Map<string,Route>;
  landmarkTrails:Map<string,Route>;
  ferries:Map<number,AdventureGate[]>;
  regions:Map<string,AdventureRegion>;
};

const directions:readonly Point[]=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
const tile=(width:number,p:Point)=>p.y*width+p.x;
const point=(width:number,index:number)=>({x:index%width,y:Math.floor(index/width)});
export const adventureDistance=(a:Point,b:Point)=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const boundsAround=(m:Pick<AdventureMap,'width'|'height'>,p:Point,r:number):Bounds=>({
  left:Math.max(0,p.x-r),right:Math.min(m.width-1,p.x+r),
  top:Math.max(0,p.y-r),bottom:Math.min(m.height-1,p.y+r),
});
const inBounds=(p:Point,b:Bounds)=>p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom;
const worldBounds=(width:number,height:number):Bounds=>({
  left:0,right:width-1,top:0,bottom:height-1,
});

function connectedArea(map:AdventureMap,anchor:number,bounds:Bounds,owner?:number){
  const visited=new Set([anchor]),queue=[anchor];
  for(let head=0;head<queue.length;head++){
    const p=point(map.width,queue[head]);
    for(const d of directions){
      const next={x:p.x+d.x,y:p.y+d.y};
      if(!inBounds(next,bounds))continue;
      const i=tile(map.width,next);
      if(map.open[i]&&!visited.has(i)&&(owner===undefined||map.owners[i]===owner)){
        visited.add(i);
        queue.push(i);
      }
    }
  }
  return visited;
}

function trace(parents:Int32Array,from:number):number[]{
  const path:number[]=[];
  for(let i=from;i>=0;i=parents[i])path.push(i);
  return path;
}

function trimRoute(path:number[],first:ReadonlySet<number>,last:ReadonlySet<number>,
  minimumLength=2){
  let start=0,end=path.length-1;
  while(start+1<end&&first.has(path[start+1]))start++;
  while(end-1>start&&last.has(path[end-1]))end--;
  const minimum=Math.min(path.length,minimumLength);
  const missing=minimum-(end-start+1);
  if(missing>0){
    start=Math.max(0,start-Math.ceil(missing/2));
    end=Math.min(path.length-1,Math.max(end,start+minimum-1));
    start=Math.min(start,end-minimum+1);
  }
  return path.slice(start,end+1);
}

/** Borrow the nearest town's walking paths. Leave longer trips and
 * uninhabited islands to the atlas, and keep room for ordinary signposts. */
function addLandmarkTrails(world:World,map:AdventureMap){
  const blocked=new Set<number>();
  for(const {path} of map.routes.values()){blocked.add(path[0]);blocked.add(path.at(-1)!);}
  for(const gates of map.ferries.values())for(const sign of gates)
    blocked.add(tile(map.width,sign.point));
  for(const site of world.ancientSites??[])blocked.add(tile(map.width,site));
  const candidates=[];
  for(const site of world.ancientSites??[]){
    const index=tile(map.width,site),town=map.towns[map.owners[index]-1];
    if(!town||town.area.has(index)||!map.open[index]||map.buildings.has(index)||
      world.tiles[index].biome==='water')continue;
    const path=trace(map.parents,index);
    if(path.length<=32)candidates.push({site,town,path,index});
  }
  const posted=new Set<number>();
  for(const {site,town,path,index} of candidates.sort((a,b)=>a.path.length-b.path.length||
    a.site.id-b.site.id)){
    if(posted.has(town.place.id))continue;
    const end=path.findIndex((i,step)=>step>=5&&town.area.has(i)&&!blocked.has(i));
    if(end<0)continue;
    const from:WildStop={kind:'wild',x:site.x,y:site.y};
    const area=connectedArea(map,index,boundsAround(map,from,5));
    // Keep the sign beside the ruin so both remain visible and clickable.
    const route=trimRoute(path.slice(1,end+1),area,new Set([path[end]]),5);
    map.landmarkTrails.set(adventurePlaceKey(from),{place:{kind:'route',from,to:town.place},
      path:route,fromName:ancientSiteName(site),toName:town.settlement.name,landmark:true});
    posted.add(town.place.id);
  }
}

/** Grow one weighted wave from all living towns. Where waves meet, their
 * parent chains give a route on the actual terrain. A shortest-link forest
 * connects every reachable town without filling each gate with destinations. */
function buildAdventureMap(world:World):AdventureMap{
  const {width,height}=world,fullBounds=worldBounds(width,height);
  const roads=roadTiles(world),bridges=bridgeTiles(world);
  const buildings=new Map<number,{building:Building;settlementId:number}>();
  const open=Uint8Array.from(world.tiles,(t,i)=>Number(t.biome!=='water'||bridges.has(i)));
  for(const settlement of world.settlements){
    for(const road of settlement.infrastructure?.roads??[])roads.add(road);
    for(const building of settlement.infrastructure?.buildings??[]){
      const i=tile(width,building);
      buildings.set(i,{building,settlementId:settlement.id});
      if(isMortalSolidBuilding(building))open[i]=0;
    }
  }
  const owners=new Int32Array(open.length),parents=new Int32Array(open.length).fill(-1);
  const map:AdventureMap={width,height,open,owners,parents,roads,bridges,buildings,
    towns:[],routes:new Map(),landmarkTrails:new Map(),ferries:new Map(),regions:new Map()};
  if(!world.settlements.length)return map;

  const costs=new Float64Array(open.length).fill(Infinity);
  const settled=new Uint8Array(open.length);
  const frontier=new RouteFrontier();
  for(const settlement of [...world.settlements].sort((a,b)=>a.id-b.id)){
    const bounds=boundsAround(map,settlement,4);
    let anchor=-1,score=Infinity;
    for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++){
      const i=y*width+x;
      const distance=Math.abs(x-settlement.x)+Math.abs(y-settlement.y);
      if(open[i]&&!owners[i]&&distance<score){anchor=i;score=distance;}
    }
    if(anchor<0)continue;
    map.towns.push({settlement,anchor,place:{kind:'town',id:settlement.id},area:new Set()});
    owners[anchor]=map.towns.length;
    costs[anchor]=0;
    frontier.addOrDecrease(anchor,0);
  }

  const boundaries=new Map<string,Boundary>();
  const effort=(i:number)=>roads.has(i)||bridges.has(i)?2:
    world.tiles[i].biome==='plains'?3:world.tiles[i].biome==='forest'?4:5;
  while(frontier.size){
    const here=frontier.pop()!;
    settled[here]=1;
    const p=point(width,here),owner=owners[here];
    for(const d of directions){
      const next={x:p.x+d.x,y:p.y+d.y};
      if(!inBounds(next,fullBounds))continue;
      const i=tile(width,next);
      if(!open[i])continue;
      const cost=(effort(here)+effort(i))/2;
      if(!settled[i]){
        if(costs[here]+cost>=costs[i])continue;
        owners[i]=owner;
        parents[i]=here;
        costs[i]=costs[here]+cost;
        frontier.addOrDecrease(i,costs[i]);
      }else if(owner!==owners[i]){
        const forward=owner<owners[i];
        const a=forward?owner:owners[i],b=forward?owners[i]:owner;
        const key=a+':'+b,distance=costs[here]+cost+costs[i];
        if(distance<(boundaries.get(key)?.distance??Infinity)){
          boundaries.set(key,{a,b,distance,left:forward?here:i,right:forward?i:here});
        }
      }
    }
  }

  for(const [i,town] of map.towns.entries()){
    const radius=Math.max(5,Math.min(12,Math.max(0,
      ...(town.settlement.infrastructure?.buildings??[])
        .map(b=>adventureDistance(b,town.settlement)))+2));
    town.area=connectedArea(map,town.anchor,boundsAround(map,town.settlement,radius),i+1);
  }
  const groups=map.towns.map((_,i)=>i);
  const group=(i:number):number=>{
    while(groups[i]!==i){groups[i]=groups[groups[i]];i=groups[i];}
    return i;
  };
  for(const edge of [...boundaries.values()].sort((a,b)=>
    a.distance-b.distance||a.a-b.a||a.b-b.b)){
    const a=group(edge.a-1),b=group(edge.b-1);
    if(a===b)continue;
    groups[a]=b;
    const from=map.towns[edge.a-1],to=map.towns[edge.b-1];
    const place:AdventureRoute={kind:'route',from:from.place,to:to.place};
    const full=[...trace(parents,edge.left).reverse(),...trace(parents,edge.right)];
    map.routes.set(adventurePlaceKey(place),{place,path:trimRoute(full,from.area,to.area,5),
      fromName:from.settlement.name,toName:to.settlement.name});
  }
  if(isMultiIslandLayout(world.settings.layout)){
    for(const passage of ferryPassages(world,owners,costs,groups.map((_,i)=>group(i)))){
      const a=group(passage.from.town-1),b=group(passage.to.town-1);
      if(a===b)continue;
      groups[a]=b;
      for(const [from,to] of [[passage.from,passage.to],[passage.to,passage.from]]){
        const town=map.towns[from.town-1],other=map.towns[to.town-1];
        // A road from the town to its landing uses the real walking grid.
        for(const i of trace(parents,from.land))town.area.add(i);
        const exits=map.ferries.get(town.place.id)??[];
        exits.push({...gate(width,from.land,from.water,other.place,other.settlement.name),
          ferry:{landing:point(width,to.land),seaTiles:passage.seaTiles}});
        map.ferries.set(town.place.id,exits);
      }
    }
  }
  addLandmarkTrails(world,map);
  return map;
}

// Mortal steps retain these references. Rebuild after terrain, construction,
// or transport changes, never for each sprite frame or player step.
const maps=new WeakMap<World['tiles'],{
  settlements:World['settlements'];transport:World['transport'];
  sites:World['ancientSites'];
  layout:World['settings']['layout'];map:AdventureMap}>();
export function adventureMapFor(world:World):AdventureMap{
  const cached=maps.get(world.tiles);
  if(cached?.settlements===world.settlements&&cached?.transport===world.transport&&
    cached?.layout===world.settings.layout&&cached.sites===world.ancientSites)
    return cached.map;
  const map=buildAdventureMap(world);
  maps.set(world.tiles,{settlements:world.settlements,transport:world.transport,
    layout:world.settings.layout,sites:world.ancientSites,map});
  return map;
}

const biomeLandscape:Record<Biome,AdventureLandscape>={
  plains:'meadow',forest:'woodland',mountain:'highland',cave:'highland',
  wasteland:'ash',volcanic:'ash',water:'coast',
};
export const LANDSCAPE_NAME:Record<AdventureLandscape,string>={
  meadow:'Meadowlands',woodland:'Woodland',highland:'Highlands',
  ash:'Ashlands',coast:'Coast',
};
const ROUTE_NAME:Record<AdventureLandscape,string>={
  meadow:'Meadow Trail',woodland:'Woodland Path',highland:'Highland Pass',
  ash:'Ashland Track',coast:'Coast Road',
};

function landscapeAt(world:World,p:Point):AdventureLandscape{
  const bounds=boundsAround(world,p,2);
  let water=0;
  for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++){
    if(world.tiles[y*world.width+x].biome==='water')water++;
  }
  return water>=5?'coast':biomeLandscape[world.tiles[tile(world.width,p)].biome];
}

function areaBounds(width:number,area:ReadonlySet<number>):Bounds{
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const i of area){
    const {x,y}=point(width,i);
    bounds.left=Math.min(x,bounds.left);bounds.right=Math.max(x,bounds.right);
    bounds.top=Math.min(y,bounds.top);bounds.bottom=Math.max(y,bounds.bottom);
  }
  return bounds;
}

function gate(width:number,at:number,towards:number,destination:AdventurePlace,
  label:string):AdventureGate{
  const position=point(width,at),next=point(width,towards);
  return {point:position,destination,label,direction:{x:next.x-position.x,y:next.y-position.y}};
}

function stopGate(width:number,route:Route,first:boolean):AdventureGate{
  const {path,place,fromName,toName}=route;
  const sign=first?gate(width,path[0],path[1],place,toName):
    gate(width,path.at(-1)!,path.at(-2)!,place,fromName);
  return route.landmark?{...sign,landmark:true}:sign;
}

function wildRoute(map:AdventureMap,place:WildStop,area:ReadonlySet<number>):Route|undefined{
  const anchor=tile(map.width,place),town=map.towns[map.owners[anchor]-1];
  if(!town)return undefined;
  const path=trace(map.parents,anchor);
  // A legacy character just outside a town can begin beside its gate.
  const trimmed=trimRoute(path,area,town.area);
  if(trimmed.length<2)return undefined;
  return {place:{kind:'route',from:place,to:town.place},path:trimmed,
    fromName:'Wilderness',toName:town.settlement.name};
}

function routeRegion(world:World,map:AdventureMap,route:Route):AdventureRegion{
  const {path,place,fromName,toName}=route,{width}=map;
  const area=new Set(path);
  const full=worldBounds(map.width,map.height);
  const counts=new Map<AdventureLandscape,number>();
  for(const i of path){
    const p=point(width,i),landscape=landscapeAt(world,p);
    counts.set(landscape,(counts.get(landscape)??0)+1);
    // Keep one step of shoulder on either side. Off-route land stays visible
    // as scenery, but the trail never turns back into the unrestricted atlas.
    for(const d of directions){
      const q={x:p.x+d.x,y:p.y+d.y},j=tile(width,q);
      if(inBounds(q,full)&&map.open[j])area.add(j);
    }
  }
  const landscape=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
  return {place,name:route.landmark?'Landmark Trail':ROUTE_NAME[landscape],
    landscape,focus:point(width,path[0]),
    bounds:areaBounds(width,area),area,trail:new Set(path),ends:[fromName,toName],
    gates:[gate(width,path[0],path[1],place.from,fromName),
      gate(width,path.at(-1)!,path.at(-2)!,place.to,toName)]};
}

function regionFor(world:World,map:AdventureMap,place:AdventurePlace):AdventureRegion|undefined{
  const key=adventurePlaceKey(place);
  const cached=map.regions.get(key);
  if(cached)return cached;
  const {width}=map;
  let region:AdventureRegion|undefined;
  if(place.kind==='town'){
    const town=map.towns.find(t=>t.place.id===place.id);
    if(!town)return undefined;
    const {settlement,area}=town;
    const gates=[...(map.ferries.get(place.id)??[])];
    for(const route of map.routes.values()){
      if(route.place.from.kind==='town'&&route.place.from.id===place.id)
        gates.push(stopGate(width,route,true));
      else if(route.place.to.id===place.id)gates.push(stopGate(width,route,false));
    }
    for(const route of map.landmarkTrails.values())
      if(route.place.to.id===place.id)gates.push(stopGate(width,route,false));
    const trail=new Set([town.anchor]);
    for(const sign of gates){
      for(let i=tile(width,sign.point);i>=0&&area.has(i);i=map.parents[i])trail.add(i);
    }
    region={place,name:settlement.name,landscape:landscapeAt(world,settlement),
      focus:settlement,bounds:areaBounds(width,area),area,trail,gates,settlement};
  }else if(place.kind==='wild'){
    const area=connectedArea(map,tile(width,place),boundsAround(map,place,5));
    const landmark=map.landmarkTrails.get(key);
    const route=landmark??wildRoute(map,place,area);
    region={place,name:landmark?.fromName??'Wilderness',landscape:landscapeAt(world,place),focus:place,
      bounds:areaBounds(width,area),area,trail:new Set(),
      gates:route?[stopGate(width,route,true)]:[]};
  }else{
    let route=map.routes.get(key);
    if(place.from.kind==='wild'){
      const start=regionFor(world,map,place.from);
      route=start&&(map.landmarkTrails.get(adventurePlaceKey(place.from))??
        wildRoute(map,place.from,start.area));
    }
    if(route&&adventurePlaceKey(route.place)===key)region=routeRegion(world,map,route);
  }
  if(region)map.regions.set(key,region);
  return region;
}

export function adventureRegion(world:World,map:AdventureMap,actor:Agent):AdventureRegion{
  const index=tile(map.width,actor),saved=world.descent?.place;
  const previous=saved&&regionFor(world,map,saved);
  if(previous?.area.has(index))return previous;
  const local=map.towns[map.owners[index]-1];
  if(local?.area.has(index))return regionFor(world,map,local.place)!;
  return regionFor(world,map,{kind:'wild',x:actor.x,y:actor.y})!;
}

export function adventureArrival(world:World,species:Agent['species'],
  available:(index:number)=>boolean):{point:Point;place:TownStop}|undefined{
  if(!world.settlements.length)return undefined;
  const map=adventureMapFor(world);
  const candidates=map.towns.map(town=>({town,
    gates:regionFor(world,map,town.place)!.gates.filter(g=>!g.landmark)}))
    .sort((a,b)=>Number(!!b.gates.length)-Number(!!a.gates.length)||
      Number(b.town.settlement.species===species)-Number(a.town.settlement.species===species));
  for(const {town,gates} of candidates){
    const starts=[...gates.map(exit=>tile(world.width,exit.point)),town.anchor,
      ...town.area];
    const i=starts.find(available);
    if(i!==undefined)return {point:point(world.width,i),place:town.place};
  }
}

const within=(world:World,region:AdventureRegion)=>(x:number,y:number)=>
  x>=0&&y>=0&&x<world.width&&y<world.height&&region.area.has(y*world.width+x);
const setPlace=(world:World,place:AdventurePlace):World=>{
  const current=world.descent;
  if(!current||current.place&&adventurePlaceKey(current.place)===adventurePlaceKey(place))
    return world;
  return {...world,descent:{...current,place}};
};

export function walkAdventure(world:World,region:AdventureRegion,dx:number,dy:number,assist=true){
  const walk=assist?walkMortalWithAssist:walkMortal;
  const result=walk(world,dx,dy,within(world,region));
  return result.moved?{...result,world:setPlace(result.world,region.place)}:result;
}

export function useAdventureGate(world:World,region:AdventureRegion,actor:Agent,
  exit:AdventureGate){
  const before=world;
  if(world.descent?.mode!=='mortal'||world.descent.agentId!==actor.id)
    return {world,moved:false,reason:'Resume your mortal to travel.'};
  if(world.descent.interior)return {world,moved:false,reason:'Leave the room before traveling.'};
  if(!region.gates.includes(exit)||adventureDistance(actor,exit.point)>1)
    return {world,moved:false,reason:exit.ferry?'Walk to the ferry landing to sail.':
      'Walk to the signpost to travel.'};
  const dx=exit.point.x-actor.x,dy=exit.point.y-actor.y;
  if(dx||dy){
    const walk=walkMortal(world,dx,dy,within(world,region));
    if(!walk.moved)return walk;
    world=walk.world;
  }
  if(exit.ferry){
    const arrival=regionFor(world,adventureMapFor(world),exit.destination);
    const landing=exit.ferry.landing;
    const spots=[landing,...directions.map(d=>({x:landing.x+d.x,y:landing.y+d.y}))];
    const dock=arrival&&spots.find(p=>inBounds(p,worldBounds(world.width,world.height))&&
      arrival.area.has(tile(world.width,p))&&world.tiles[tile(world.width,p)].biome!=='water'&&
      world.agents.filter(a=>a.x===p.x&&a.y===p.y).length<mortalTileCapacity(world,p.x,p.y));
    if(!dock)return {world:before,moved:false,reason:'The landing is crowded. Try again shortly.'};
    world={...world,agents:world.agents.map(a=>a.id===actor.id?
      {...a,...dock,cognition:a.cognition&&{...a.cognition,
        trail:[tile(world.width,dock)],route:undefined}}:a)};
  }
  return {world:setPlace(world,exit.destination),moved:true};
}
