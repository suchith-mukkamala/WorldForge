import type {Point} from './motion';

export const ROOM_WIDTH=13,ROOM_HEIGHT=9;
export const INTERIOR_DOOR:Point={x:6,y:8};
export type RoomReference={settlementId:number;buildingId:number};
export type MortalRoom=RoomReference&{position:Point};

export function insideRoom(point:Point){
  return Number.isInteger(point.x)&&Number.isInteger(point.y)&&
    point.x>=1&&point.x<ROOM_WIDTH-1&&point.y>=1&&point.y<ROOM_HEIGHT;
}

export function validMortalRoom(value:unknown):value is MortalRoom{
  if(!value||typeof value!=='object')return false;
  const room=value as Partial<MortalRoom>;
  return typeof room.settlementId==='number'&&Number.isSafeInteger(room.settlementId)&&
    room.settlementId>0&&typeof room.buildingId==='number'&&Number.isSafeInteger(room.buildingId)&&
    room.buildingId>0&&!!room.position&&insideRoom(room.position);
}
