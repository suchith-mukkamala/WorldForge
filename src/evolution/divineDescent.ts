/** v2.5.0 — Divine Descent creates a genuine mortal in the existing world.
 * Movement and player authority are deliberately deferred to v2.5.1. */
import {SPECIES_INFO,editWorld,type Agent,type MortalAppearance,
  type Species,type World} from './engine';
import {tileCapacity} from './density';
import {biomeHome} from './biomeGeneration';
import {cleanIdentityName,renamePerson} from './identity';
import type {Career} from './development';

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
export function mortalArrivalSite(world:World,species:Species):{x:number;y:number}|null{
  const settlement=world.settlements.find(s=>s.species===species);
  const home=biomeHome(world.settings.seed,species);
  const anchor=settlement??{x:Math.round(home[0]*(world.width-1)),
    y:Math.round(home[1]*(world.height-1))};
  const capacity=tileCapacity(world);
  const occupancy=new Map<number,number>();
  for(const a of world.agents){
    const id=a.y*world.width+a.x;
    occupancy.set(id,(occupancy.get(id)??0)+1);
  }
  let best:null|{x:number;y:number}=null,score=Infinity;
  const preferred=SPECIES_INFO[species].preferred;
  for(let i=0;i<world.tiles.length;i++){
    const tile=world.tiles[i];
    if(tile.biome==='water'||(occupancy.get(i)??0)>=capacity[i])continue;
    const x=i%world.width,y=Math.floor(i/world.width);
    const distance=(x-anchor.x)**2+(y-anchor.y)**2;
    const next=distance+(preferred.includes(tile.biome)?0:160);
    if(next<score){score=next;best={x,y};}
  }
  return best;
}

export function createMortal(world:World,options:MortalCreation):{
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
  const location=mortalArrivalSite(world,options.species);
  if(!location)throw Error('This world has no safe space for a new mortal.');
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
    createdYear:world.year},lineage:named.lineage.map(r=>r.id===id?{
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
