/** v2.6.1 — a view of real residents, never spawned indoor lookalikes.
 * Only people physically at their recorded home may appear inside. A change
 * in the simulation changes the scene; closing the room changes nothing.
 */
import type {Agent,World} from './engine';
import {lifeStage} from './development';
import {ACTIVITY_LABELS,type Activity} from './dailyLife';
import {INTERIOR_TEMPLATES,ROOM_HEIGHT,ROOM_WIDTH,
  type InteriorPosition} from './mortalInteriors';
import type {MortalBuilding} from './mortalGameplay';

export type HouseholdPresence={agent:Agent;position:InteriorPosition;
  action:string};
export type LivingHousehold={members:Agent[];present:HouseholdPresence[];
  away:Agent[];hasFood:boolean};

const nearby=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=1;
const isWalkable=(site:MortalBuilding,p:InteriorPosition)=>
  p.x>=1&&p.x<ROOM_WIDTH-1&&p.y>=1&&p.y<ROOM_HEIGHT&&
  !INTERIOR_TEMPLATES[site.building.type].props.some(prop=>
    prop.x===p.x&&prop.y===p.y&&prop.kind!=='rug');

const target=(a:Agent):InteriorPosition=>{
  const stage=lifeStage(a),activity:Activity=a.dailyLife?.activity??'rest';
  if(stage==='infant')return {x:2,y:3};
  if(activity==='rest')return {x:3,y:3};
  if(activity==='care')return {x:4,y:3};
  if(activity==='study'||activity==='reflect')return {x:10,y:3};
  if(activity==='socialize')return {x:6,y:5};
  if(activity==='craft'||activity==='work')return {x:8,y:4};
  return {x:6,y:6};
};

const action=(a:Agent,hasCompany:boolean,hasFood:boolean):string=>{
  const stage=lifeStage(a),activity=a.dailyLife?.activity??'rest';
  if(stage==='infant')return 'Being cared for';
  if(activity==='rest')return 'Resting at home';
  if(activity==='care')return 'Caring for family';
  if(activity==='socialize'&&hasCompany&&hasFood)return 'Sharing a meal';
  if(activity==='socialize'&&hasCompany)return 'Spending time together';
  if(activity==='study')return 'Learning at home';
  return ACTIVITY_LABELS[activity];
};

/** No arbitrary NPCs, no remote relatives magically teleported indoors.
 * The player is drawn separately; assigned chairs exclude no walkable floor.
 */
export function livingHousehold(world:World,site:MortalBuilding):LivingHousehold{
  const home=world.households?.find(h=>h.id===site.building.householdId&&
    h.residence?.settlementId===site.settlementId&&
    h.residence.buildingId===site.building.id);
  if(!home||!['house','shelter'].includes(site.building.type))
    return {members:[],present:[],away:[],hasFood:false};
  const people=new Map(world.agents.map(a=>[a.id,a]));
  const members=home.members.map(id=>people.get(id)).filter((a):a is Agent=>!!a);
  const atHome=members.filter(a=>a.id!==world.descent?.agentId&&
    nearby(a,site.building));
  const away=members.filter(a=>a.id!==world.descent?.agentId&&
    !nearby(a,site.building));
  const settlement=world.settlements.find(s=>s.id===site.settlementId);
  const hasFood=(settlement?.stores??0)>=atHome.length*.001;
  const occupied=new Set<string>(),present:HouseholdPresence[]=[];
  // At most eight visible residents in a room. Everyone else remains in the
  // roster, without inventing a new person or changing the outdoor state.
  for(const agent of atHome.slice(0,8)){
    const preferred=target(agent),cells:InteriorPosition[]=[];
    for(let y=1;y<ROOM_HEIGHT;y++)for(let x=1;x<ROOM_WIDTH-1;x++){
      const p={x,y};if(isWalkable(site,p)&&!occupied.has(`${x}:${y}`))cells.push(p);
    }
    cells.sort((a,b)=>{
      const da=Math.abs(a.x-preferred.x)+Math.abs(a.y-preferred.y),
        db=Math.abs(b.x-preferred.x)+Math.abs(b.y-preferred.y);
      return da-db||a.y-b.y||a.x-b.x;
    });
    const position=cells[0];if(!position)break;
    occupied.add(`${position.x}:${position.y}`);
    present.push({agent,position,action:action(agent,atHome.length>1,hasFood)});
  }
  return {members,present,away,hasFood};
}

/** The same stable indoor resident locations are used for targeting and
 * collision. Walking the player must not cause a family member to jump to
 * another chair or silently rearrange the room. */
export function nearestIndoorResident(world:World,site:MortalBuilding,
  position:InteriorPosition):HouseholdPresence|undefined{
  const present=livingHousehold(world,site).present;
  return present.filter(p=>Math.max(Math.abs(p.position.x-position.x),
    Math.abs(p.position.y-position.y))<=1)
    .sort((a,b)=>Math.max(Math.abs(a.position.x-position.x),
      Math.abs(a.position.y-position.y))-
      Math.max(Math.abs(b.position.x-position.x),
        Math.abs(b.position.y-position.y))||a.agent.id-b.agent.id)[0];
}
