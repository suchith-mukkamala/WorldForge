/** v2.6.0 — shared room templates keyed by actual building type. These are
 * presentation-only: no rooms, duplicates or NPCs are added to world saves. */
import type {World} from './engine';
import {BUILDING_LABELS,type BuildingType} from './construction';
import type {MortalBuilding} from './mortalGameplay';

export type InteriorPosition={x:number;y:number};
export type InteriorProp={x:number;y:number;kind:string};
export type InteriorTemplate={name:string;floor:string;wall:string;
  props:readonly InteriorProp[]};
export const ROOM_WIDTH=13,ROOM_HEIGHT=9;
export const INTERIOR_DOOR:InteriorPosition={x:6,y:8};
const thing=(kind:string,x:number,y:number):InteriorProp=>({kind,x,y});

export const INTERIOR_TEMPLATES:Record<BuildingType,InteriorTemplate>={
  shelter:{name:'Shelter',floor:'#8a7963',wall:'#796a59',props:[
    thing('bed',2,2),thing('fire',6,2),thing('crate',10,2),thing('rug',6,5)]},
  house:{name:'Residence',floor:'#9a836e',wall:'#a88d77',props:[
    thing('bed',2,2),thing('bed',3,2),thing('shelf',10,2),
    thing('table',6,4),thing('chair',6,5),thing('chest',2,6),
    thing('fire',10,6),thing('rug',7,6)]},
  farm:{name:'Farmstead',floor:'#917e57',wall:'#8b7958',props:[
    thing('hay',2,2),thing('hay',3,2),thing('crate',9,2),
    thing('barrel',10,2),thing('table',6,4),thing('tools',2,6)]},
  storage:{name:'Storehouse',floor:'#827f74',wall:'#898981',props:[
    thing('crate',2,2),thing('crate',3,2),thing('barrel',5,2),
    thing('crate',9,2),thing('crate',10,2),thing('crate',2,5),
    thing('barrel',10,5),thing('table',6,4)]},
  well:{name:'Well court',floor:'#8c9986',wall:'#81948e',props:[
    thing('well',6,3),thing('barrel',2,2),thing('barrel',10,2),
    thing('crate',10,6),thing('rug',6,6)]},
  workshop:{name:'Workshop',floor:'#817a70',wall:'#7e716d',props:[
    thing('forge',3,2),thing('tools',10,2),thing('table',6,4),
    thing('crate',2,6),thing('barrel',10,6),thing('shelf',9,2)]},
  market:{name:'Marketplace',floor:'#998a73',wall:'#b49c7a',props:[
    thing('stall',2,2),thing('stall',10,2),thing('crate',2,5),
    thing('barrel',10,5),thing('table',6,4),thing('rug',6,6)]},
  dock:{name:'Dockhouse',floor:'#837a68',wall:'#6f857c',props:[
    thing('boat',6,2),thing('crate',2,2),thing('barrel',10,2),
    thing('net',2,6),thing('barrel',10,6)]},
  communal:{name:'Communal hall',floor:'#9b8a71',wall:'#a18f80',props:[
    thing('bench',3,3),thing('bench',9,3),thing('table',6,4),
    thing('bench',3,5),thing('bench',9,5),thing('fire',6,2)]},
};

export function canEnterMortalBuilding(world:World,site:MortalBuilding):boolean{
  const actor=world.agents.find(a=>a.id===world.descent?.agentId);
  if(world.descent?.mode!=='mortal'||!actor||site.distance>1)return false;
  const settlement=world.settlements.find(s=>s.id===site.settlementId);
  return !!settlement?.infrastructure?.buildings.some(b=>
    b.id===site.building.id&&b.stage==='complete'&&b.condition>0);
}

export function findInteriorBuilding(world:World,
  reference:{settlementId:number;buildingId:number}):MortalBuilding|null{
  const settlement=world.settlements.find(s=>s.id===reference.settlementId);
  const building=settlement?.infrastructure?.buildings.find(b=>
    b.id===reference.buildingId&&b.stage==='complete'&&b.condition>0);
  if(!settlement||!building||world.descent?.mode!=='mortal'||
    !world.agents.some(a=>a.id===world.descent?.agentId))return null;
  return {building,settlementId:settlement.id,settlementName:settlement.name,
    entrance:{x:building.x,y:building.y},distance:0};
}

export function moveInside(type:BuildingType,from:InteriorPosition,
  dx:number,dy:number,occupied?:ReadonlySet<string>):InteriorPosition{
  if(!Number.isInteger(dx)||!Number.isInteger(dy)||
    Math.abs(dx)>1||Math.abs(dy)>1||!dx&&!dy)return from;
  const next={x:from.x+dx,y:from.y+dy};
  if(next.x<1||next.x>=ROOM_WIDTH-1||next.y<1||next.y>=ROOM_HEIGHT)return from;
  if(occupied?.has(`${next.x}:${next.y}`))return from;
  const props=INTERIOR_TEMPLATES[type].props;
  if(props.some(p=>p.x===next.x&&p.y===next.y&&p.kind!=='rug'))return from;
  if(dx&&dy&&props.some(p=>p.x===from.x+dx&&p.y===from.y&&p.kind!=='rug')&&
    props.some(p=>p.x===from.x&&p.y===from.y+dy&&p.kind!=='rug'))return from;
  return next;
}

export const atInteriorDoor=(position:InteriorPosition)=>
  Math.abs(position.x-INTERIOR_DOOR.x)<=1&&position.y>=INTERIOR_DOOR.y-1;

export const interiorTitle=(type:BuildingType)=>
  INTERIOR_TEMPLATES[type]?.name??BUILDING_LABELS[type];
