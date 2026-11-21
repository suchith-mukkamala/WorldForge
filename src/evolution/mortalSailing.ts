import {adventureMapFor,type AdventureMap} from './adventureMap';
import type {World} from './engine';
import {mortalTileCapacity,walkMortal,type MortalStep} from './mortalGameplay';
import {directionBetween,type Point} from './motion';
import {MAX_LANDING_RISE,seaNeighbors,seaPoint,type MortalShip,type Shipyard} from './shipSave';
import {topographyForWorld} from './topography';
import {cavesInSight,chartCaves} from './mortalTidalCaves';

const at=(w:World,p:Point)=>p.y*w.width+p.x;
const player=(w:World)=>w.descent?.mode==='mortal'&&w.agents.find(a=>a.id===w.descent?.agentId);
const fail=(world:World,reason:string):MortalStep=>({world,moved:false,reason});

export const sailingWater=(world:World,index:number,bridges:ReadonlySet<number>)=>
  world.tiles[index]?.biome==='water'&&!bridges.has(index);

export function shipMooring(world:World,map:AdventureMap):{shore:number;water:number}|undefined{
  const ship=world.descent?.ship;
  if(!ship||ship.underway||!map.open[ship.shore]||world.tiles[ship.shore].biome==='water'||
    !sailingWater(world,ship.at,map.bridges))return;
  return {shore:ship.shore,water:ship.at};
}

export function launchShip(world:World,berth:Pick<Shipyard,'shore'|'water'>):MortalStep{
  const actor=player(world),descent=world.descent;
  if(!actor||!descent||descent.interior||descent.tidal?.inside||descent.ship?.underway)
    return fail(world,'Reach the shipyard on foot to board.');
  if(world.shipments?.some(shipment=>shipment.carrierId===actor.id))
    return fail(world,'Deliver your merchant cargo before taking out a sailboat.');
  const map=adventureMapFor(world),mooring=shipMooring(world,map);
  const matches=(site:Pick<Shipyard,'shore'|'water'>)=>site.shore===berth.shore&&site.water===berth.water;
  if(!(mooring&&matches(mooring))&&![...map.shipyards.values()].some(matches))
    return fail(world,'The berth is unavailable.');
  const shore=seaPoint(world.width,berth.shore),water=seaPoint(world.width,berth.water);
  const dx=shore.x-actor.x,dy=shore.y-actor.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>1)return fail(world,'Walk to the marked berth to board.');
  const approach=dx||dy?walkMortal(world,dx,dy):{world,moved:true};
  if(!approach.moved)return approach;
  const ship:MortalShip={shore:berth.shore,at:berth.water,underway:true,
    heading:directionBetween(shore,water),landfalls:descent.ship?.landfalls??[]};
  return {world:{...approach.world,descent:{...descent,ship}},moved:true};
}

export function steerShip(world:World,dx:number,dy:number,bridges:ReadonlySet<number>):MortalStep{
  const {descent}=world,ship=descent?.ship;
  if(!player(world)||!ship?.underway)return fail(world,'Board a ship before sailing.');
  if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)
    return fail(world,'Choose a direction to sail.');
  const position=seaPoint(world.width,ship.at),next={x:position.x+dx,y:position.y+dy};
  if(next.x<0||next.x>=world.width||next.y<0||next.y>=world.height)
    return fail(world,'You have reached the edge of the chart.');
  const destination=at(world,next);
  if(!sailingWater(world,destination,bridges))return fail(world,
    bridges.has(destination)?'The bridge is too low for your sail.':'Choose Land to go ashore here.');
  return {world:{...world,descent:{...descent!,ship:{...ship,at:destination,
    heading:directionBetween(position,next)}}},moved:true};
}

export function landingSites(world:World,map:AdventureMap):number[]{
  const ship=world.descent?.ship;
  if(!ship?.underway)return [];
  const heights=topographyForWorld(world).heights;
  return seaNeighbors(ship.at,world.width,world.tiles.length).filter(i=>
    i>=0&&world.tiles[i].biome!=='water'&&map.open[i]&&Math.abs(heights[i]-heights[ship.at])<=MAX_LANDING_RISE);
}

export function landShip(world:World,shore:number):MortalStep{
  const actor=player(world),descent=world.descent,ship=descent?.ship;
  if(!actor||!descent||!ship?.underway)return fail(world,'Board a ship before landing.');
  const map=adventureMapFor(world);
  if(!landingSites(world,map).includes(shore))return fail(world,'Sail beside a clear shore to land.');
  const point=seaPoint(world.width,shore);
  const occupied=world.agents.filter(a=>a.id!==actor.id&&a.x===point.x&&a.y===point.y).length;
  if(occupied>=mortalTileCapacity(world,point.x,point.y))return fail(world,'This landing is crowded. Try another spot.');
  const caves=cavesInSight(world,map);
  const town=map.towns[map.owners[shore]-1];
  const place=!caves.some(cave=>cave.shore===shore)&&town?.area.has(shore)?
    town.place:{kind:'wild' as const,...point,expedition:true as const};
  const charted=chartCaves(world,caves);
  const landfalls=ship.landfalls.includes(shore)?ship.landfalls:[...ship.landfalls,shore].slice(-128);
  return {world:{...charted,agents:world.agents.map(a=>a.id===actor.id?{...a,...point,
    cognition:a.cognition&&{...a.cognition,route:undefined,trail:[shore]}}:a),
  descent:{...charted.descent!,place,ship:{...ship,shore,underway:false,landfalls}}},moved:true};
}

/** God-mode terrain edits can dry out a saved passage while the mortal is
 * away from the helm. Recover at the reserved land tile on resume. */
export function recoverShip(world:World):World{
  const descent=world.descent,ship=descent?.ship;
  if(!descent||!ship?.underway||world.tiles[ship.at]?.biome==='water')return world;
  return {...world,descent:{...descent,ship:{...ship,at:seaNeighbors(ship.shore,world.width,
    world.tiles.length).find(i=>world.tiles[i]?.biome==='water')??
    seaNeighbors(ship.shore,world.width,world.tiles.length).find(i=>i>=0)!,underway:false}}};
}
