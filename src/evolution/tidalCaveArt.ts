import {terrainHash,terrainNoise} from './biomeGeneration';
import {CAVE_HEIGHT as H,CAVE_WIDTH as W,type CaveStone,type TidalCave} from './tidalCaves';
import {CaveFloor,cavePoint,type TidalCaveRoom} from './tidalCaveRoom';

export const CAVE_TILE=20;
const TILE=CAVE_TILE;
const rockColors:Record<CaveStone,readonly string[]>={
  basalt:['#1e2632','#313b46','#454e58','#5d6369','#777b7c'],
  limestone:['#222b31','#3e4548','#565854','#77766a','#a0927c'],
  reef:['#203137','#3c5050','#546460','#7b8272','#abac89'],
};
const stoneColors={
  basalt:['#464d53','#525760','#5c6063','#666668'],
  limestone:['#545652','#646258','#716b60','#7b7466'],
  reef:['#4c5c5b','#5a6964','#6c7669','#797e6c'],
};
const sand=['#827863','#918568','#a59474','#b4a080'];
const water=['#235764','#285f69','#2d6870','#337276'];
const lagoon=['#286775','#2e7b80','#38a09a','#52aaa1'];
const fill=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
};

export function paintTidalCave(ctx:CanvasRenderingContext2D,cave:TidalCave,room:TidalCaveRoom,low:boolean){
  const roll=(x:number,y:number)=>terrainHash(x,y,cave.seed);
  const {cells}=room,rock=rockColors[cave.stone],floor=stoneColors[cave.stone];
  const has=(x:number,y:number)=>x>=0&&y>=0&&x<W&&y<H;
  const lighting=(x:number,y:number)=>{
    const start=cavePoint(room.entrance);
    const entrance=Math.max(0,1-Math.hypot((x-start.x)*.86,y-start.y)/6);
    const gap=cavePoint(room.farExit??room.find);
    const light=cave.stone==='reef'||room.farExit!==undefined?.7:.15;
    return Math.max(entrance,Math.max(0,1-Math.hypot(x-gap.x,y-gap.y)/6)*light);
  };
  fill(ctx,'#121d26',0,0,W*TILE,H*TILE);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const kind=cells[y*W+x],px=x*TILE,py=y*TILE;
    const adjacent=(dx:number,dy:number)=>has(x+dx,y+dy)?cells[(y+dy)*W+x+dx]:CaveFloor.rock;
    const light=lighting(x,y);
    if(kind===CaveFloor.rock){
      if(!adjacent(0,1)&&!adjacent(0,-1)&&!adjacent(-1,0)&&!adjacent(1,0))continue;
      fill(ctx,rock[0],px,py,20,20);
      for(let ty=0;ty<20;ty+=4)for(let tx=0;tx<20;tx+=4){
        const variation=terrainNoise(px+tx,py+ty,8,cave.seed+649)*1.25;
        const warmth=(ty<8?.55:0)+light*.68;
        const k=Math.max(0,Math.min(4,Math.floor(1.5+warmth+variation)));
        fill(ctx,rock[k],px+tx,py+ty,4,4);
      }
      if(adjacent(0,1)){
        fill(ctx,rock[3],px,py+13,20,1);
        fill(ctx,rock[1],px,py+14,20,5);
        fill(ctx,rock[0],px,py+18,20,2);
        for(let offset=1;offset<19;offset+=4){
          const width=roll(px+offset,py)>.4?3:2;
          fill(ctx,rock[2],px+offset,py+15,width,3);
          if(cave.stone==='basalt')fill(ctx,rock[0],px+offset+width,py+3,1,12);
        }
      }
      if(adjacent(1,0))fill(ctx,rock[1],px+17,py,3,20);
      if(adjacent(-1,0))fill(ctx,rock[3],px,py+2,2,15);
      if(roll(x,y)>.54){
        const gx=px+4+Math.floor(roll(x+8,y)*11);
        fill(ctx,rock[0],gx,py+4,1,7);
        fill(ctx,rock[1],gx-2,py+6,3,1);
      }
      continue;
    }

    const flooded=kind===CaveFloor.water;
    const palette=flooded?(cave.stone==='reef'?lagoon:water):kind===CaveFloor.sand?sand:floor;
    for(let ty=0;ty<20;ty+=4)for(let tx=0;tx<20;tx+=4){
      const variation=terrainNoise(px+tx,py+ty,6,cave.seed+950)*1.32;
      const level=1.25+light*1.35+variation+(flooded&&!low?-.45:0);
      const k=Math.min(3,Math.max(0,Math.floor(level)));
      fill(ctx,palette[k],px+tx,py+ty,4,4);
    }
    if(flooded){
      const side=cave.stone==='reef'?'#73b0a0':'#4d8183';
      const rim=low?(cave.stone==='reef'?'#9ba98b':'#727d75'):side;
      if(adjacent(0,-1)!==CaveFloor.water)fill(ctx,rim,px+1,py,18,2);
      if(adjacent(0,1)!==CaveFloor.water)fill(ctx,side,px,py+18,20,2);
      if(adjacent(1,0)!==CaveFloor.water)fill(ctx,side,px+18,py+1,2,18);
      if(adjacent(-1,0)!==CaveFloor.water)fill(ctx,rim,px,py+1,2,18);
      const glint=cave.stone==='reef'?'#b7dbbb79':'#bbd6c861';
      fill(ctx,glint,px+2+Math.floor(roll(x+7,y)*6),py+5+Math.floor(roll(x,y+7)*8),4,1);
      if(roll(x,y)>.53)fill(ctx,glint,px+9,py+15,6,1);
      if(cave.stone==='reef'&&roll(x,y)>.7){
        fill(ctx,'#b18a877b',px+6,py+11,4,3);fill(ctx,'#b69b8a95',px+5,py+10,2,2);
      }
    }else{
      const mark=roll(x,y),shade=kind===CaveFloor.sand?'#716d5a':'#3d494d';
      if(adjacent(0,-1)===CaveFloor.rock)fill(ctx,'#101a2544',px,py,20,3);
      fill(ctx,shade,px+3+Math.floor(mark*9),py+13,2,1);
      if(mark>.43){
        fill(ctx,rock[3],px+2,py+3,3,2);
        fill(ctx,rock[1],px+3,py+5,3,1);
      }
      if(mark>.7&&low&&kind===CaveFloor.sand)fill(ctx,'#c5b594',px+14,py+8,2,1);
    }
  }
  paintOpening(ctx,room.entrance,true,low);
  if(room.farExit!==undefined)paintOpening(ctx,room.farExit,false,true);
  paintFind(ctx,cave,room.find);
}

function paintOpening(ctx:CanvasRenderingContext2D,index:number,south:boolean,low:boolean){
  const {x,y}=cavePoint(index),px=x*TILE,py=(y+(south?1:0))*TILE;
  const start=south?0:-10;
  const [waterline,light,rim]=low?['#b2a182','#ead3a080','#798d85']:
    ['#37737e','#9acab475','#58928f'];
  fill(ctx,rim,px-7,py+start,34,9);
  fill(ctx,waterline,px-2,py+start,24,10);
  fill(ctx,light,px+4,py-5,12,16);
  fill(ctx,light,px+7,py-10,6,6);
}

function paintFind(ctx:CanvasRenderingContext2D,cave:TidalCave,index:number){
  const {x,y}=cavePoint(index),px=x*TILE,py=y*TILE;
  if(cave.find==='fossil'){
    fill(ctx,'#60594e',px+3,py+5,15,11);
    fill(ctx,'#939079',px+4,py+3,13,10);
    fill(ctx,'#e3cca0',px+6,py+5,8,1);
    fill(ctx,'#e3cca0',px+6,py+6,1,5);
    fill(ctx,'#d5bc8b',px+7,py+10,7,2);
    fill(ctx,'#d5bc8b',px+13,py+6,2,4);
    fill(ctx,'#f0dfb1',px+9,py+7,4,2);
  }else if(cave.find==='mooring'){
    fill(ctx,'#302a26',px+2,py+9,16,5);
    fill(ctx,'#79634b',px+2,py+6,16,4);
    fill(ctx,'#ab8c62',px+2,py+6,16,1);
    for(const offset of [4,13]){
      fill(ctx,'#a6a29b',px+offset,py+8,4,4);
      fill(ctx,'#36343a',px+offset+1,py+9,2,2);
    }
  }else{
    fill(ctx,'#a69f80',px+3,py+11,13,4);
    fill(ctx,'#d9c597',px+5,py+9,10,4);
    fill(ctx,'#e3aa99',px+9,py+6,4,4);
    fill(ctx,'#f2d5b6',px+5,py+8,6,2);
    fill(ctx,'#b8cab0',px+15,py+13,2,2);
  }
}

export function markCavePoint(ctx:CanvasRenderingContext2D,index:number){
  const {x,y}=cavePoint(index);
  ctx.strokeStyle='#edd39b';ctx.lineWidth=1;
  ctx.strokeRect(x*TILE+1.5,y*TILE+1.5,TILE-3,TILE-3);
}
