import {terrainHash,terrainNoise} from './biomeGeneration';
import {seaPoint} from './shipSave';
import {CAVE_WIDTH as W,CAVE_HEIGHT as H,type TidalCave} from './tidalCaves';

export const CaveFloor={rock:0,stone:1,sand:2,water:3} as const;
export type TidalCaveRoom={cells:Uint8Array;entrance:number;find:number;farExit?:number};
const rooms=new WeakMap<TidalCave,TidalCaveRoom>();
const cell=(x:number,y:number)=>y*W+x;

export const cavePoint=(index:number)=>seaPoint(W,index);
export const caveWalkable=(room:TidalCaveRoom,index:number)=>
  room.cells[index]===CaveFloor.stone||room.cells[index]===CaveFloor.sand;

/** A continuous ledge threads the chambers. Water and scree form around
 * that ledge so the find and any second exit are always reachable. */
export function tidalCaveRoom(cave:TidalCave):TidalCaveRoom{
  const cached=rooms.get(cave);
  if(cached)return cached;
  const cells=new Uint8Array(W*H);
  const random=(x:number,y:number)=>terrainHash(x,y,cave.seed);
  const shift=(n:number)=>Math.round(random(n,9)*6)-3;
  const entranceX=9+Math.round(random(13,5)*4)-2;
  const bendX=9+shift(2),chamberX=9+shift(8);
  const findX=chamberX+(random(50,1)>.5?2:-2);
  const mouthY=H-2;
  const entrance=cell(entranceX,mouthY),find=cell(findX,4);
  const farExit=cave.farShore!==undefined?cell(chamberX,1):undefined;
  const walk=new Set<number>();
  let x=entranceX,y=mouthY;
  for(const [tx,ty] of [[entranceX,11],[bendX,8],[chamberX,6],[findX,4],
    ...(farExit===undefined?[]:[[chamberX,1]])]){
    while(y>ty||x!==tx){
      walk.add(cell(x,y));
      if(x!==tx&&(y===ty||random(x,y)>.42))x+=Math.sign(tx-x);
      else y--;
    }
    walk.add(cell(x,y));
  }
  const pockets=[
    {x:entranceX,y:12,rx:2.5,ry:2.1},
    {x:bendX,y:8.5,rx:5.2,ry:3.2},
    {x:chamberX,y:4.4,rx:cave.stone==='reef'?7:5.8,ry:3.45},
  ];
  const lagoonSide=findX<chamberX?1:-1;
  const pools=[
    {x:bendX-lagoonSide*2.9,y:8.4,rx:2.2,ry:1.85},
    {x:chamberX+lagoonSide*2.8,y:4.55,rx:cave.stone==='reef'?3.5:2.75,ry:2.4},
  ];
  for(y=1;y<H-1;y++)for(x=1;x<W-1;x++){
    const i=cell(x,y),grain=terrainNoise(x,y,2.3,cave.seed+254);
    if(!walk.has(i)&&!pockets.some(p=>((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<1+grain*.65))continue;
    if(!walk.has(i)&&pools.some(p=>((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<.92+grain*.55)){
      cells[i]=CaveFloor.water;continue;
    }
    cells[i]=y>=10||cave.stone==='reef'&&y<8&&grain>-.45?CaveFloor.sand:CaveFloor.stone;
  }
  // Put a small dry shelf around the object. It remains a place to stand
  // whether the outer beach is wet or dry.
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(Math.abs(dx)+Math.abs(dy)>1)continue;
    cells[cell(findX+dx,4+dy)]=cave.stone==='reef'?CaveFloor.sand:CaveFloor.stone;
  }
  cells[entrance+W]=CaveFloor.sand;
  if(farExit!==undefined)cells[farExit-W]=CaveFloor.sand;
  const room={cells,entrance,find,farExit};
  rooms.set(cave,room);
  return room;
}
