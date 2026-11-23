import {adventureDistance,adventureMapFor,adventureRegion,walkAdventure} from './adventureMap';
import type {World} from './engine';
import {cloneCognition} from './mindII';
import {directionBetween} from './motion';
import {mortalTileCapacity,type MortalStep} from './mortalGameplay';
import {realmWater} from './realmWater';
import {seaNeighbors,seaPoint,type MortalShip} from './shipSave';
import {initializeUnderworld,RealmBiome,realmWalkable,underworldMap,underworldVent,
  type RealmLink,type RealmMap,type RealmVisit} from './underworld';
import {ventHasGround,type Volcano} from './volcanicGeography';
import {lavaField,volcanicDay,volcanoPhase} from './volcanism';

const fail=(world:World,reason:string):MortalStep=>({world,moved:false,reason});
const mortal=(world:World)=>world.descent?.mode==='mortal'?
  world.agents.find(agent=>agent.id===world.descent?.agentId):undefined;
const indexOf=(world:Pick<World,'width'>,point:{x:number;y:number})=>point.y*world.width+point.x;
const neighbors=(map:RealmMap,index:number)=>seaNeighbors(index,map.width,map.biomes.length);
const near=(map:RealmMap,a:number,b:number)=>a===b||neighbors(map,a).includes(b);

export function occupiedUnderworld(world:World){
  const visit=world.descent?.realm?.visit,actor=mortal(world);
  if(!visit||!actor||world.descent?.ship?.underway||world.descent?.interior||world.descent?.tidal?.inside)return;
  const floor=underworldMap(world);
  const origin=floor?.links.find(link=>link.surface===visit.origin&&link.kind==='crater');
  if(!floor||!origin||indexOf(world,actor)!==origin.surface)return;
  const water=realmWater(world,floor),map=water?.map??floor;
  const seasonal=map.water?.seasonal.has(visit.at);
  if(!seasonal&&(visit.ship?.underway?map.biomes[visit.at]!==RealmBiome.sea:
      !realmWalkable(map,visit.at,volcanicDay(world))&&!map.fords.has(visit.at)))return;
  return {actor,visit,map,floor,origin,water};
}

function updateVisit(world:World,map:RealmMap,visit:RealmVisit):World{
  const descent=world.descent!,chart=descent.realm?.chart??[];
  const found=map.links.filter(link=>!chart.includes(link.surface)&&
    adventureDistance(seaPoint(map.width,visit.at),seaPoint(map.width,link.cell))<=2)
    .map(link=>link.surface);
  return {...world,descent:{...descent,realm:{visit,chart:found.length?[...chart,...found]:chart}}};
}

export function enterUnderworld(world:World,index:number):MortalStep{
  const actor=mortal(world),descent=world.descent;
  if(!actor||!descent||descent.interior||descent.tidal?.inside||descent.ship?.underway||descent.realm?.visit)
    return fail(world,'Reach the crater on foot to explore.');
  const vent=world.volcanicLayout?.vents.find(site=>site.index===index);
  if(!vent||!ventHasGround(world,vent))return fail(world,'This shaft is blocked.');
  const rim=seaPoint(world.width,vent.rim),map=adventureMapFor(world);
  const region=adventureRegion(world,map,actor);
  if(adventureDistance(actor,rim)>1||!region.area.has(vent.rim)||!map.open[vent.rim])
    return fail(world,'Walk to the marked crater rim.');
  if(volcanoPhase(world,vent)!=='Dormant')return fail(world,'The shaft opens when the magma recedes.');
  const landed=indexOf(world,actor)===vent.rim?{world,moved:true}:
    walkAdventure(world,region,rim.x-actor.x,rim.y-actor.y,false);
  if(!landed.moved)return landed;
  const prepared=initializeUnderworld(landed.world),realm=underworldMap(prepared);
  const link=underworldVent(prepared,vent);
  if(!realm||!link)return fail(world,'This shaft is blocked.');
  return {world:updateVisit(prepared,realm,{origin:link.surface,at:link.cell}),moved:true};
}

export function leaveUnderworld(world:World,link?:RealmLink):MortalStep{
  const descent=world.descent,visit=descent?.realm?.visit,actor=mortal(world);
  if(!descent||!visit||!actor)return fail(world,'You are already on the surface.');
  const seen=occupiedUnderworld(world);
  const exit=link&&seen?.map.links.find(candidate=>candidate.surface===link.surface);
  if(seen&&(!exit||visit.ship?.underway||!near(seen.map,visit.at,exit.cell)))
    return fail(world,'Walk to the base of the passage.');
  const {chart}=descent.realm!;
  if(!seen||exit?.surface===visit.origin){
    return {world:{...world,descent:{...descent,realm:{chart}}},moved:true};
  }
  if(!exit)return fail(world,'Walk to the base of the passage.');
  const surface=adventureMapFor(world);
  const hot=lavaField(world).hot;
  const landing=[exit.surface,...seaNeighbors(exit.surface,world.width,world.tiles.length)].find(i=>{
    if(i<0||!surface.open[i]||world.tiles[i].biome==='water'||hot.has(i)||surface.buildings.has(i))return false;
    const {x,y}=seaPoint(world.width,i);
    return world.agents.filter(a=>a.x===x&&a.y===y).length<mortalTileCapacity(world,x,y);
  });
  if(landing===undefined)return fail(world,'The surface passage is blocked. The original shaft is still open.');
  const point=seaPoint(world.width,landing),cognition=actor.cognition&&cloneCognition(actor.cognition);
  if(cognition){cognition.route=undefined;cognition.trail=[landing];}
  return {world:{...world,agents:world.agents.map(a=>a.id===actor.id?{...a,...point,cognition}:a),
    descent:{...descent,realm:{chart},place:{kind:'wild',...point,expedition:true}}},moved:true};
}

export function moveUnderworld(world:World,dx:number,dy:number):MortalStep{
  const seen=occupiedUnderworld(world);
  if(!seen||!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)
    return fail(world,'Choose a direction in the Underworld.');
  const {visit,map}=seen,{width,height}=map,{x,y}=seaPoint(width,visit.at);
  const next={x:x+dx,y:y+dy},at=indexOf(map,next);
  if(next.x<0||next.x>=width||next.y<0||next.y>=height)
    return fail(world,'The cavern wall closes in here.');
  const ship=visit.ship;
  if(ship?.underway){
    if(map.biomes[at]!==RealmBiome.sea)return fail(world,map.water?.seasonal.has(at)?
      'The ledge is exposed. Go ashore here or steer into deeper water.':'Use Land at a dry bank.');
    return {world:updateVisit(world,map,{...visit,at,
      ship:{...ship,at,heading:directionBetween({x,y},next)}}),moved:true};
  }
  if(!realmWalkable(map,at,volcanicDay(world)))
    return fail(world,map.biomes[at]===RealmBiome.lava?'Hot lava covers the ground here. Look for a basalt span.':
      map.biomes[at]===RealmBiome.sea?map.water?.seasonal.has(at)?
        'The ledge is submerged. Use a boat or return at low water.':'Take a boat across the Buried Sea.':
        'The basalt wall blocks your path.');
  return {world:updateVisit(world,map,{...visit,at}),moved:true};
}

export function realmBerth(map:RealmMap,visit:RealmVisit){
  const ship=visit.ship;
  if(ship?.underway)return;
  if(ship&&near(map,visit.at,ship.shore)&&map.biomes[ship.at]===RealmBiome.sea)
    return {shore:ship.shore,water:ship.at};
  const port=map.towns.find(town=>town.berth!==undefined&&near(map,visit.at,town.index));
  return port&&{shore:port.index,water:port.berth!};
}

export function boardRealmBoat(world:World):MortalStep{
  const seen=occupiedUnderworld(world),berth=seen&&realmBerth(seen.map,seen.visit);
  if(!seen||!berth)return fail(world,'Walk beside the boat to board.');
  const {map,visit}=seen,{water,shore}=berth;
  const ship:MortalShip={at:water,shore,underway:true,landfalls:visit.ship?.landfalls??[],
    heading:directionBetween(seaPoint(map.width,shore),seaPoint(map.width,water))};
  return {world:updateVisit(world,map,{...visit,at:water,ship}),moved:true};
}

export function realmLandings(world:World,map:RealmMap,visit:RealmVisit){
  return visit.ship?.underway?neighbors(map,visit.at).filter(i=>
    realmWalkable(map,i,volcanicDay(world))&&map.biomes[i]!==RealmBiome.lava):[];
}

export function landRealmBoat(world:World,shore:number):MortalStep{
  const seen=occupiedUnderworld(world);
  if(!seen||!seen.visit.ship?.underway||!realmLandings(world,seen.map,seen.visit).includes(shore))
    return fail(world,'Sail beside a clear bank to land.');
  const {map,visit}=seen,ship=visit.ship!;
  const landfalls=ship.landfalls.includes(shore)?ship.landfalls:[...ship.landfalls,shore].slice(-128);
  return {world:updateVisit(world,map,{...visit,at:shore,
    ship:{...ship,shore,underway:false,landfalls}}),moved:true};
}

/** A season can change while the player is standing in a pool. Let them
 * wade through just the flooded bed to reach the nearest safe bank. */
export function realmWadingBank(map:RealmMap,visit:RealmVisit,day:number):number|undefined{
  const flooded=map.water?.seasonal;
  if(!flooded?.has(visit.at)||map.biomes[visit.at]!==RealmBiome.sea||visit.ship?.underway)return;
  const seen=new Set([visit.at]);
  for(const i of seen)for(const next of neighbors(map,i)){
    if(next<0||seen.has(next))continue;
    if(map.biomes[next]!==RealmBiome.lava&&realmWalkable(map,next,day))return next;
    if(flooded.has(next)&&map.biomes[next]===RealmBiome.sea)seen.add(next);
  }
}

export function wadeRealmBank(world:World):MortalStep{
  const active=occupiedUnderworld(world);
  const at=active&&realmWadingBank(active.map,active.visit,volcanicDay(world));
  if(!active||at===undefined)return fail(world,'There is no flooded ledge to cross here.');
  return {world:updateVisit(world,active.map,{...active.visit,at}),moved:true};
}

export const volcanoEntryUsable=(world:World,vent:Volcano)=>ventHasGround(world,vent)&&
  !!underworldVent(world,vent);
