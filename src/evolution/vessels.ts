import type {World} from './engine';
import {directionBetween,type Facing} from './motion';
import {seaPoint} from './shipSave';

type Vessel={at:number;heading:Facing;merchant:boolean;crew?:number};

/** The trade and player ships use their actual positions on navigable water. */
export function activeVessels(world:World):Vessel[]{
  const vessels:Vessel[]=[];
  const {descent,width,tiles}=world;
  const ship=descent?.ship;
  if(ship&&tiles[ship.at]?.biome==='water')vessels.push({at:ship.at,heading:ship.heading,
    merchant:false,crew:ship.underway?descent?.agentId:undefined});
  for(const shipment of world.shipments??[]){
    if(shipment.mode!=='sea')continue;
    const {route,progress}=shipment,at=route[progress];
    if(tiles[at]?.biome!=='water')continue;
    const next=route[progress+1]??at,prior=route[progress-1]??at;
    const heading=directionBetween(seaPoint(width,prior),seaPoint(width,next));
    vessels.push({at,heading,merchant:true,crew:shipment.carrierId});
  }
  return vessels;
}
