import {adventureDistance,adventureMapFor,adventureRegion,walkAdventure,type AdventureMap} from './adventureMap';
import {advanceWorldDays} from './calendar';
import type {World} from './engine';
import {mortalTileCapacity,type MortalStep} from './mortalGameplay';
import {seaPoint} from './shipSave';
import {CAVE_FINDS,CAVE_HEIGHT,CAVE_WIDTH,CHART_LIMIT,caveHasCoast,coastTide,tidalCaveAt,tidalCaves,
  type TidalCave} from './tidalCaves';
import {cavePoint,caveWalkable,tidalCaveRoom} from './tidalCaveRoom';
import {cloneCognition} from './mindII';

const fail=(world:World,reason:string):MortalStep=>({world,moved:false,reason});
const player=(world:World)=>world.descent?.mode==='mortal'?
  world.agents.find(agent=>agent.id===world.descent?.agentId):undefined;

/** Older worlds can have structures or landmarks on a prospective ledge. */
export const usableTidalCave=(world:World,map:AdventureMap,cave:TidalCave)=>
  caveHasCoast(world,cave)&&!!map.open[cave.mouth]&&!!map.open[cave.shore]&&!map.buildings.has(cave.mouth)&&
  !map.buildings.has(cave.shore)&&!map.bridges.has(cave.water)&&
  !world.ancientSites?.some(site=>site.y*world.width+site.x===cave.mouth)&&
  !world.settlements.some(town=>town.y*world.width+town.x===cave.mouth);

export function cavesInSight(world:World,map:AdventureMap){
  const ship=world.descent?.ship;
  if(!ship?.underway)return [];
  const {width,height,tiles}=world,here=seaPoint(width,ship.at);
  const lineOfSight=(target:number)=>{
    const p=seaPoint(width,target),dx=p.x-here.x,dy=p.y-here.y;
    const steps=Math.max(Math.abs(dx),Math.abs(dy));
    if(steps>5)return false;
    for(let i=1;i<steps;i++){
      const x=here.x+Math.round(dx*i/steps),y=here.y+Math.round(dy*i/steps);
      if(x<0||y<0||x>=width||y>=height||tiles[y*width+x].biome!=='water')return false;
    }
    return true;
  };
  return tidalCaves(world).filter(cave=>usableTidalCave(world,map,cave)&&
    (lineOfSight(cave.water)||adventureDistance(here,seaPoint(width,cave.shore))<=1));
}

export function chartCaves(world:World,caves:readonly TidalCave[]):World{
  const descent=world.descent,tidal=descent?.tidal;
  if(!descent||!caves.length)return world;
  const chart=tidal?.chart??[],known=new Set(chart.map(entry=>entry.mouth));
  const added=caves.filter(cave=>!known.has(cave.mouth));
  if(!added.length)return world;
  return {...world,tidalSites:world.tidalSites??[...tidalCaves(world)],descent:{...descent,tidal:{...tidal,
    chart:[...chart,...added.map(cave=>({mouth:cave.mouth}))].slice(-CHART_LIMIT)}}};
}

export function occupiedTidalCave(world:World){
  const inside=world.descent?.tidal?.inside,actor=player(world);
  if(!inside||!actor||world.descent?.ship?.underway||world.descent?.interior)return;
  const cave=tidalCaveAt(world,inside.mouth);
  if(!cave||!caveHasCoast(world,cave)||actor.y*world.width+actor.x!==inside.mouth)return;
  const room=tidalCaveRoom(cave);
  if(caveWalkable(room,inside.cell))return {inside,actor,cave,room};
}

export function enterTideCave(world:World,mouth:number):MortalStep{
  const actor=player(world);
  if(!actor||!world.descent||world.descent.ship?.underway||world.descent.interior||
    world.descent.tidal?.inside)return fail(world,'Reach the cave on foot to explore.');
  const cave=tidalCaveAt(world,mouth),map=adventureMapFor(world);
  if(!cave||!usableTidalCave(world,map,cave))return fail(world,'This cave mouth is blocked.');
  const point=seaPoint(world.width,cave.mouth),distance=adventureDistance(actor,point);
  const region=adventureRegion(world,map,actor);
  if(distance>1||!region.area.has(cave.mouth))return fail(world,'Walk to the marked cave entrance.');
  if(!coastTide(world).low)return fail(world,'The tide covers the sand below the arch.');
  const approach=distance===0?{world,moved:true}:walkAdventure(world,region,
    point.x-actor.x,point.y-actor.y,false);
  if(!approach.moved)return approach;
  const charted=chartCaves(approach.world,[cave]);
  const descent=charted.descent!,tidal=descent.tidal!;
  return {world:{...charted,descent:{...descent,tidal:{...tidal,
    inside:{mouth,cell:tidalCaveRoom(cave).entrance}}}},moved:true};
}

export function waitForCaveTide(world:World,mouth:number):MortalStep{
  const actor=player(world),descent=world.descent,cave=tidalCaveAt(world,mouth),tide=coastTide(world);
  if(!actor||!cave||descent?.ship?.underway||descent?.tidal?.inside||descent?.interior||
    adventureDistance(actor,seaPoint(world.width,cave.mouth))>1)
    return fail(world,'Wait on the shore beside the cave.');
  const map=adventureMapFor(world);
  if(!usableTidalCave(world,map,cave)||!adventureRegion(world,map,actor).area.has(mouth))
    return fail(world,'Approach the dry ledge first.');
  if(tide.low)return fail(world,'The sand is already exposed.');
  return {world:advanceWorldDays(world,tide.untilLow),moved:true};
}

export function walkTideCave(world:World,dx:number,dy:number):MortalStep{
  const visit=occupiedTidalCave(world);
  if(!visit||!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)
    return fail(world,'Choose a direction inside the cave.');
  const {inside,room}=visit;
  const point=cavePoint(inside.cell),x=point.x+dx,y=point.y+dy;
  const cell=y*CAVE_WIDTH+x;
  if(x<0||x>=CAVE_WIDTH||y<0||y>=CAVE_HEIGHT||!caveWalkable(room,cell))
    return fail(world,'Follow the dry ledge around the water and rock.');
  const descent=world.descent!,tidal=descent.tidal!;
  return {world:{...world,descent:{...descent,tidal:{...tidal,inside:{...inside,cell}}}},moved:true};
}

export function inspectCaveFind(world:World):{world:World;message:string}{
  const visit=occupiedTidalCave(world);
  if(!visit||adventureDistance(cavePoint(visit.inside.cell),cavePoint(visit.room.find))>1)
    return {world,message:'Walk to the find to inspect it.'};
  const {cave}=visit,find=CAVE_FINDS[cave.find],descent=world.descent!,tidal=descent.tidal!;
  if(tidal.chart.some(entry=>entry.mouth===cave.mouth&&entry.find))return {world,message:find.description};
  const chart=tidal.chart.map(entry=>entry.mouth===cave.mouth?{...entry,find:cave.find}:entry);
  return {world:{...world,descent:{...descent,tidal:{...tidal,chart}}},
    message:find.description+' Recorded in your coastal journal.'};
}

/** The land anchor remains on the dry side of the tidal sill. A rising
 * tide can close the approach, but the high ledge always leads back out. */
export function leaveTideCave(world:World,throughPassage=false):MortalStep{
  const descent=world.descent,tidal=descent?.tidal;
  if(!descent||!tidal?.inside)return fail(world,'You are already outside.');
  const {inside,...record}=tidal;
  if(!throughPassage)return {world:{...world,descent:{...descent,tidal:record}},moved:true};
  const visit=occupiedTidalCave(world),shore=visit?.cave.farShore,exit=visit?.room.farExit;
  if(!visit||shore===undefined||exit===undefined||
    adventureDistance(cavePoint(inside.cell),cavePoint(exit))>1)
    return fail(world,'Follow the passage to the opening.');
  const {actor}=visit,map=adventureMapFor(world),point=seaPoint(world.width,shore);
  if(!map.open[shore]||world.tiles[shore].biome==='water'||map.buildings.has(shore)||
    world.agents.filter(a=>a.id!==actor.id&&a.x===point.x&&a.y===point.y).length>=
      mortalTileCapacity(world,point.x,point.y))return fail(world,'The far ledge is blocked. The original exit is still open.');
  const cognition=actor.cognition&&cloneCognition(actor.cognition);
  if(cognition){cognition.route=undefined;cognition.trail=[shore];}
  return {world:{...world,agents:world.agents.map(a=>a.id===actor.id?{...a,...point,cognition}:a),
    descent:{...descent,tidal:record,place:{kind:'wild',...point,expedition:true}}},moved:true};
}
