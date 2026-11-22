import {lavaField} from './volcanism';
import {ventHasGround} from './volcanicGeography';
import {WORLD_TREE_TRUNK_CLEARANCE} from './worldTree';
/** v2.5.0 — Divine Descent creates a genuine mortal in the existing world.
 * Movement and player authority are deliberately deferred to v2.5.1. */
import {SPECIES_INFO,editWorld,type Agent,type MortalAppearance,
  type Species,type World} from './engine';
import {tileCapacity} from './density';
import {biomeHome} from './biomeGeneration';
import {cleanIdentityName,renamePerson} from './identity';
import type {Career} from './development';
import {adventureArrival,adventureMapFor,riverTrailArrival} from './adventureMap';
import type {RiverTrail,TownStop,WildStop} from './adventurePlaces';
import {isMultiIslandLayout} from './worldGeography';
import {seaNeighbors,seaPoint} from './shipSave';

export const DESCENT_BACKGROUNDS=[
  {id:'scout',name:'Wayfinder',description:'A curious traveler seeking unknown lands.'},
  {id:'artisan',name:'Craftsperson',description:'A life shaped by tools and invention.'},
  {id:'scholar',name:'Scholar',description:'A student of knowledge and forgotten places.'},
  {id:'forager',name:'Homesteader',description:'Someone at home among farms and forests.'},
] as const satisfies readonly {id:Career;name:string;description:string}[];
export type DescentBackground=typeof DESCENT_BACKGROUNDS[number]['id'];
export type MortalCreation={name:string;species:Species;
  background:DescentBackground;appearance:MortalAppearance};

/** Choose a safe, available plot near a living settlement of this species.
 * On worlds without settlements, favor the species' native biome. This is a
 * one-time O(map area + population) query, never part of the frame loop. */
function arrival(world:World,species:Species,mouth?:number,shipyard?:number,atWorldTree=false,atCrater?:number):{
  point:{x:number;y:number};place?:TownStop|RiverTrail|WildStop}|null{
  const settlement=world.settlements.find(s=>s.species===species);
  const home=biomeHome(world.settings.seed,species);
  const resident=isMultiIslandLayout(world.settings.layout)?
    world.agents.find(a=>a.species===species):undefined;
  const anchor=settlement??resident??{x:Math.round(home[0]*(world.width-1)),
    y:Math.round(home[1]*(world.height-1))};
  const capacity=tileCapacity(world);
  const occupancy=new Map<number,number>();
  for(const a of world.agents){
    const id=a.y*world.width+a.x;
    occupancy.set(id,(occupancy.get(id)??0)+1);
  }
  const hot=lavaField(world).hot;
  const available=(i:number)=>world.tiles[i].biome!=='water'&&!hot.has(i)&&
    (occupancy.get(i)??0)<capacity[i];
  if(atCrater!==undefined){
    const vent=world.volcanicLayout?.vents.find(vent=>vent.index===atCrater);
    const map=adventureMapFor(world);
    if(!vent||!ventHasGround(world,vent))return null;
    const index=[vent.rim,...seaNeighbors(vent.rim,world.width,world.tiles.length)]
      .find(i=>map.open[i]&&available(i));
    if(index===undefined)return null;
    const point=seaPoint(world.width,index);
    return {point,place:{kind:'wild',...point,expedition:true}};
  }
  if(atWorldTree){
    const tree=world.worldTree;
    const map=adventureMapFor(world);
    if(!tree)return null;
    const able=(i:number)=>!!map.open[i]&&available(i);
    const trailSite=tree.trail.find(i=>{
      const {x,y}=seaPoint(world.width,i);
      return able(i)&&Math.hypot(x-tree.x,y-tree.y)>=WORLD_TREE_TRUNK_CLEARANCE;
    });
    if(trailSite!==undefined)return {point:seaPoint(world.width,trailSite)};
    // Start on the same landmass a short walk back from the trunk when possible.
    const start=tree.trail[0],visited=new Set([start]),queue=[start];
    for(let read=0;read<queue.length;read++){
      const i=queue[read],point=seaPoint(world.width,i);
      if(Math.hypot(point.x-tree.x,point.y-tree.y)>=WORLD_TREE_TRUNK_CLEARANCE&&able(i))return {point};
      for(const next of seaNeighbors(i,world.width,world.tiles.length)){
        if(next<0||visited.has(next)||!map.open[next])continue;
        visited.add(next);queue.push(next);
      }
    }
    const fallback=tree.trail.find(able);
    return fallback===undefined?null:{point:seaPoint(world.width,fallback)};
  }
  if(mouth!==undefined)return riverTrailArrival(world,mouth,available)??null;
  if(shipyard!==undefined){
    const map=adventureMapFor(world),yard=map.shipyards.get(shipyard);
    const town=map.towns.find(t=>t.place.id===shipyard);
    if(!yard||!town)return null;
    const candidates=[yard.shore,...seaNeighbors(yard.shore,world.width,world.tiles.length)];
    const index=candidates.find(i=>town.area.has(i)&&available(i));
    return index===undefined?null:{point:seaPoint(world.width,index),place:town.place};
  }
  const gate=adventureArrival(world,species,available);
  if(gate)return gate;
  let best:null|{x:number;y:number}=null,score=Infinity;
  const preferred=SPECIES_INFO[species].preferred;
  for(let i=0;i<world.tiles.length;i++){
    const tile=world.tiles[i];
    if(!available(i))continue;
    const x=i%world.width,y=Math.floor(i/world.width);
    const distance=(x-anchor.x)**2+(y-anchor.y)**2;
    const next=distance+(preferred.includes(tile.biome)?0:160);
    if(next<score){score=next;best={x,y};}
  }
  return best?{point:best}:null;
}

export function mortalArrivalSite(world:World,species:Species):{x:number;y:number}|null{
  return arrival(world,species)?.point??null;
}

export function createMortal(world:World,options:MortalCreation,mouth?:number,shipyard?:number,atWorldTree=false,atCrater?:number):{
  world:World;agent:Agent}{
  const name=cleanIdentityName(options.name);
  if(!name)throw Error('Please choose a name of 2–64 letters or characters.');
  if(!DESCENT_BACKGROUNDS.some(b=>b.id===options.background))
    throw Error('Choose a valid mortal background.');
  if(!SPECIES_INFO[options.species])throw Error('Choose a valid species.');
  const look=options.appearance;
  if(!look||![look.skin,look.hair].every(v=>Number.isInteger(v)&&v>=0&&v<4)||
    !Number.isInteger(look.hairStyle)||look.hairStyle<0||look.hairStyle>2||
    !['wanderer','forager','artisan','scholar'].includes(look.outfit))
    throw Error('Choose a valid appearance.');
  if(world.descent&&world.agents.some(a=>a.id===world.descent!.agentId))
    throw Error('You already have a living mortal. Resume their story first.');
  const start=arrival(world,options.species,mouth,shipyard,atWorldTree,atCrater);
  if(!start)throw Error(atCrater!==undefined?'The crater rim has no open ground for a new mortal.':atWorldTree?'The root trail has no open ground for a new mortal.':
    shipyard!==undefined?'This shipyard has no open ground for a new mortal.':
    mouth!==undefined?'This river trailhead has no open ground for a new mortal.':
      'This world has no safe space for a new mortal.');
  const location=start.point;
  const spawned=editWorld(world,location.x,location.y,
    {kind:'spawn',species:options.species});
  if(spawned===world)throw Error('The arrival location is no longer available.');
  const id=spawned.nextAgentId-1;
  const actor=spawned.agents.find(a=>a.id===id)!;
  const customized:Agent={...actor,appearance:{...look},
    development:actor.development?{...actor.development,
      career:options.background}:undefined};
  const named=renamePerson({...spawned,agents:spawned.agents.map(a=>
    a.id===id?customized:a),lineage:spawned.lineage.map(r=>
    r.id===id?{...r,appearance:{...look}}:r)},id,name);
  const description='The divine spirit descended as '+name+'.';
  const updated:World={...named,descent:{agentId:id,mode:'mortal',
    createdYear:world.year,...(start.place?{place:start.place}:{})},
    lineage:named.lineage.map(r=>r.id===id?{
      ...r,moments:[...(r.moments??[]),{year:world.year,kind:'divine' as const,
        text:'A divine soul began its mortal journey.'}].slice(-40),
    }:r),events:[...named.events,{id:named.nextEventId,year:world.year,
      type:'world' as const,message:description}].slice(-90),
    nextEventId:named.nextEventId+1};
  return {world:updated,agent:customized};
}

export function setDescentMode(world:World,mode:'mortal'|'divine'):World{
  const current=world.descent;
  if(!current||current.mode===mode)return world;
  if(mode==='mortal'&&!world.agents.some(a=>a.id===current.agentId))
    throw Error('That mortal is no longer alive. Create a new character.');
  return {...world,descent:{...current,mode}};
}
