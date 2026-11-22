import type {DivineDescent} from './engine';
import type {Facing,Point} from './motion';

export type MortalShip={at:number;shore:number;underway:boolean;heading:Facing;landfalls:number[]};
export type Shipyard={settlementId:number;shore:number;water:number};

export const MAX_LANDING_RISE=28;

export const seaPoint=(width:number,i:number):Point=>({x:i%width,y:Math.floor(i/width)});
export const seaNeighbors=(index:number,width:number,count:number)=>[
  index>=width?index-width:-1,
  index%width<width-1?index+1:-1,
  index+width<count?index+width:-1,
  index%width>0?index-1:-1,
];

export function validMortalShip(value:unknown,width:number,height:number):value is MortalShip{
  if(!value||typeof value!=='object')return false;
  const ship=value as Partial<MortalShip>,count=width*height;
  const position=(i:unknown):i is number=>typeof i==='number'&&Number.isInteger(i)&&i>=0&&i<count;
  return position(ship.at)&&position(ship.shore)&&typeof ship.underway==='boolean'&&
    (ship.underway||seaNeighbors(ship.shore,width,count).includes(ship.at))&&
    !!ship.heading&&['north','east','south','west'].includes(ship.heading)&&
    Array.isArray(ship.landfalls)&&ship.landfalls.length<=128&&ship.landfalls.every(position)&&
    new Set(ship.landfalls).size===ship.landfalls.length;
}

/** A voyage or cave visit reserves the mortal's land tile even in God Mode.
 * Navigation resumes from the saved ship or chamber position on return. */
export const controlsMortal=(descent:DivineDescent|undefined,id:number)=>
  descent?.agentId===id&&(descent.mode==='mortal'||descent.ship?.underway||!!descent.tidal?.inside||!!descent.realm?.visit);
