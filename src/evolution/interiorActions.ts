import type {World} from './engine';
import {advanceWorldDays} from './calendar';
import {stockOf} from './economy';
import {TOPIC_INFO} from './knowledge';
import {adventureDistance} from './adventureMap';
import {INTERIOR_TEMPLATES,occupiedMortalRoom,type InteriorPropKind} from './mortalInteriors';
import {samePoint,type Point} from './motion';

const PROP_NAMES:Record<InteriorPropKind,string>={
  bed:'Bed',fire:'Hearth',crate:'Crate',rug:'Rug',shelf:'Shelves',table:'Table',
  chair:'Chair',chest:'Chest',hay:'Hay',barrel:'Barrel',tools:'Tools',well:'Well',
  forge:'Forge',stall:'Stall',boat:'Boat',net:'Net',bench:'Bench',
};

const canRest=(kind:InteriorPropKind)=>kind==='bed'||kind==='chair'||kind==='bench';
export const interiorPropAction=(kind:InteriorPropKind)=>canRest(kind)?'Rest until tomorrow':
  kind==='shelf'?'Read shelves':'Inspect '+PROP_NAMES[kind].toLowerCase();

export function interactWithInteriorProp(world:World,point:Point):{world:World;message:string}{
  const room=world.descent?.interior,site=occupiedMortalRoom(world);
  const prop=site&&INTERIOR_TEMPLATES[site.building.type].props.find(item=>samePoint(item,point));
  if(!room||!site||!prop||adventureDistance(room.position,prop)>1)
    return {world,message:'Walk closer to interact.'};
  const town=world.settlements.find(s=>s.id===site.settlementId)!;
  if(canRest(prop.kind)){
    const id=world.descent!.agentId,person=world.agents.find(a=>a.id===id)!;
    if(person.energy>=100&&person.health>=100)
      return {world,message:'You are already well rested.'};
    const tomorrow=advanceWorldDays(world,1);
    if(tomorrow===world)return {world,message:'The world clock has ended.'};
    if(!tomorrow.agents.some(a=>a.id===id))return {world:tomorrow,message:'A day passed.'};
    const agents=tomorrow.agents.map(a=>a.id===id?
      {...a,energy:Math.min(100,a.energy+18),health:Math.min(100,a.health+5)}:a);
    return {world:{...tomorrow,agents},message:'You rested for a day and recovered energy.'};
  }
  if(prop.kind==='shelf'){
    const topics=town.archives?.map(topic=>TOPIC_INFO[topic].name).join(', ');
    return {world,message:topics?'The shelves hold notes on '+topics+'.':
      'The shelves hold household records.'};
  }
  if(prop.kind==='crate'||prop.kind==='barrel'||prop.kind==='stall')
    return {world,message:town.name+' has '+Math.floor(stockOf(town,'food'))+
      ' food and '+Math.floor(stockOf(town,'wood'))+' wood in reserve.'};
  const notes:Partial<Record<InteriorPropKind,string>>={
    fire:'The hearth is warm.',forge:'The forge is set up for metalwork.',
    well:'The well serves '+town.name+'.',table:'A place to sit and share a meal.',
    chest:'This chest belongs to the household.',tools:'The tools are laid out for the next shift.',
    boat:'The boat is ready for the next crossing.',net:'The net is hung up to dry.',
    hay:'Dried hay is stacked here for the farm.',rug:'A handwoven rug.',
  };
  return {world,message:notes[prop.kind]??PROP_NAMES[prop.kind]};
}
