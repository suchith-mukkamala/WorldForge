import {terrainHash,terrainNoise} from './biomeGeneration';
import {blockCrater,blockRealmHouse} from './blockModels';
import {DESCENT_BLOCK_VIEW,paintBlockScenery} from './blockScenery';
import type {Point} from './motion';
import {seaPoint} from './shipSave';
import {terrainPixel} from './terrainCellArt';
import {RealmBiome,realmFordOpen,type RealmMap,type RealmResident} from './underworld';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';

export const REALM_TILE=24;
const SIDE=VISUAL_TERRAIN_SIDE,T=REALM_TILE;
const {basalt,ember,lava,steam,glowroot,crystal,chalk,sea}=RealmBiome;

export const UNDERWORLD_BIOMES=[
  {name:'Basalt galleries',color:'#797583',floor:['#646171','#716d7d','#7b7686','#86808c']},
  {name:'Ember Rivers',color:'#9a6c60',floor:['#744d4a','#875951','#98655a','#a67666']},
  {name:'Molten channels',color:'#ff9754',floor:['#a64038','#d45436','#f87a35','#ffca6a']},
  {name:'Steam banks',color:'#b9ac91',floor:['#93847c','#a39685','#b7a98f','#c3b69e']},
  {name:'Glowroot Forests',color:'#578d72',floor:['#426e65','#4f7c6e','#5b8c75','#69987e']},
  {name:'Crystal halls',color:'#967cb1',floor:['#6b5f81','#796a92','#8a76a2','#a48bb8']},
  {name:'Pale shores',color:'#d9c393',floor:['#b2a080','#c0ad88','#d0bb90','#decb9e']},
  {name:'Buried Sea',color:'#367d99',floor:['#214b69','#275b7b','#2f6c88','#42849d']},
] as const;
const palette=UNDERWORLD_BIOMES.map(biome=>biome.floor.map(terrainPixel));
const shallows=['#377887','#428891','#5c9c9d','#94bfb3'].map(terrainPixel);
const paving=['#877b76','#978782','#ad9d8e','#b9a89a'].map(terrainPixel);
const piers=['#796b68','#938278','#a48f7e','#b7a38a'].map(terrainPixel);
const emberLight=terrainPixel('#ffb06a');
const abyss=terrainPixel('#171825');
const rect=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
};

function warmStone(ink:number,strength:number){
  const mix=(shift:number)=>Math.round((ink>>>shift&255)*(1-strength)+(emberLight>>>shift&255)*strength);
  return (255<<24|mix(16)<<16|mix(8)<<8|mix(0))>>>0;
}

export function realmFloorPixels(map:RealmMap,day:number|undefined,origin:Point,width:number,height:number){
  const iw=width*SIDE;
  const pixels=new Uint32Array(iw*height*SIDE);
  pixels.fill(abyss);
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const x=origin.x+col,y=origin.y+row,i=y*map.width+x;
    if(x<0||y<0||x>=map.width||y>=map.height)continue;
    const natural=map.biomes[i],span=map.bridges.has(i)||day!==undefined&&realmFordOpen(map,i,day);
    const kind=span?ember:natural,road=map.roads.has(i);
    const north=map.biomes[i-map.width],south=map.biomes[i+map.width];
    const west=x>0?map.biomes[i-1]:undefined,east=x<map.width-1?map.biomes[i+1]:undefined;
    const shore=(neighbor:number|undefined)=>neighbor!==undefined&&neighbor!==sea&&neighbor!==lava;
    const shoreNorth=shore(north),shoreSouth=shore(south),shoreWest=shore(west),shoreEast=shore(east);
    for(let dy=0;dy<SIDE;dy++)for(let dx=0;dx<SIDE;dx++){
      const px=x*SIDE+dx,py=y*SIDE+dy;
      const grain=Math.imul(px+map.seed,1597334677)^Math.imul(py,122949829);
      const hash=Math.imul(grain^grain>>>14,0x45d9f3b);
      const variation=terrainNoise(px,py,9,map.seed)*(kind===sea?.9:1.35);
      const level=Math.max(0,Math.min(3,Math.floor(1.65+variation+(hash>>>28)*.08)));
      const edge=dy===0?north:dy===SIDE-1?south:dx===0?west:dx===SIDE-1?east:undefined;
      const blend=edge!==undefined&&edge!==lava&&edge!==sea&&kind!==lava&&kind!==sea&&
        edge!==kind&&(hash&3)>1;
      const step=kind!==sea&&kind!==lava&&dy>=SIDE-2&&map.heights[i]>(map.heights[i+map.width]??0)+3;
      const causeway=road&&(dx>=3&&dx<=4||dy>=3&&dy<=4)&&
        (dx>=2&&dx<=5&&dy>=2&&dy<=5||
          dy<=2&&map.roads.has(i-map.width)||dy>=5&&map.roads.has(i+map.width)||
          dx<=2&&map.roads.has(i-1)||dx>=5&&map.roads.has(i+1));
      let color=span?piers[(dx+Math.floor(dy/3))&3]:causeway?paving[level]:
        step?palette[kind][dy===SIDE-1?0:1]:palette[blend?edge:kind][level];
      if(!span&&kind===lava){
        const pulse=terrainNoise(px,py*.62,4,map.seed+664);
        const rim=edge!==undefined&&edge!==lava;
        color=palette[lava][rim?Math.min(level,1):pulse>.24?3:pulse>.01?2:1];
      }else if(!span&&kind===sea){
        const width=2+(hash&1);
        const shallow=shoreNorth&&dy<width||shoreSouth&&dy>=SIDE-width||
          shoreWest&&dx<width||shoreEast&&dx>=SIDE-width;
        const ripple=(py+(hash>>>27&1))%11===0&&variation>.08;
        color=(shallow?shallows:palette[sea])[ripple?3:level];
      }else if(!span){
        const glow=Math.min(north===lava?dy:SIDE,south===lava?SIDE-1-dy:SIDE,
          west===lava?dx:SIDE,east===lava?SIDE-1-dx:SIDE);
        if(glow<3)color=warmStone(color,(3-glow)*.087);
      }
      pixels[(row*SIDE+dy)*iw+col*SIDE+dx]=color;
    }
  }
  return pixels;
}

export function paintRealmFloor(ctx:CanvasRenderingContext2D,map:RealmMap,day:number|undefined,
  origin:Point,width:number,height:number,offset?:Point){
  const pixels=realmFloorPixels(map,day,origin,width,height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),width*SIDE,height*SIDE),
    offset?.x??0,offset?.y??0);
}

function fungi(ctx:CanvasRenderingContext2D,x:number,y:number,grain:number){
  for(let n=0;n<3;n++){
    const dx=x+(n-1)*4,dy=y-4-(grain>>n&3),stalk=5+(grain>>(n+3)&3);
    rect(ctx,'#293335',dx-4,dy+stalk-1,9,3);
    rect(ctx,'#6a8780',dx,dy,2,stalk);
    rect(ctx,'#466b69',dx-3,dy-1,8,2);
    rect(ctx,'#6b9c8b',dx-2,dy-4,6,3);
    rect(ctx,n===1?'#b4d6a0':'#a0c6a2',dx-1,dy-4,3,1);
    rect(ctx,'#b3d5c6',dx+3,dy-2,2,1);
  }
}

function prisms(ctx:CanvasRenderingContext2D,x:number,y:number,grain:number){
  for(let n=0;n<3;n++){
    const px=x-5+n*4,wide=n===1?5:3,height=5+(grain>>(n*2)&7)+(n===1?3:0);
    rect(ctx,'#323144',px-2,y+1,wide+4,3);
    rect(ctx,'#625780',px,y-height,wide,height);
    rect(ctx,'#8b81a7',px,y-height+2,2,height-4);
    rect(ctx,'#baa3c0',px+1,y-height-2,Math.max(1,wide-2),3);
    rect(ctx,'#d1b5cf',px+1,y-height-2,2,1);
  }
}

export function paintRealmTerrain(ground:CanvasRenderingContext2D,texture:HTMLCanvasElement,
  map:RealmMap,day:number,origin:Point,width:number,height:number){
  const small=texture.getContext('2d');if(!small)return;
  paintRealmFloor(small,map,day,origin,width,height);
  ground.imageSmoothingEnabled=false;
  ground.drawImage(texture,0,0,width*T,height*T);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const wx=origin.x+x,wy=origin.y+y,i=wy*map.width+wx;
    if(wx<0||wy<0||wx>=map.width||wy>=map.height)continue;
    const kind=map.biomes[i],house=map.houses.get(i),road=map.roads.has(i);
    const link=map.links.find(link=>link.cell===i);
    const px=x*T+T/2,py=y*T+16;
    const grain=Math.floor(4096*terrainHash(wx,wy,map.seed));
    if(house){
      paintBlockScenery(ground,blockRealmHouse(house.home==='ash-borne',grain%7),
        {x:px,y:py},DESCENT_BLOCK_VIEW,1.28);
    }else if(link){
      paintBlockScenery(ground,blockCrater(grain%8,false),{x:px,y:py+2},DESCENT_BLOCK_VIEW,1.02);
      if(link.kind==='falls'){
        rect(ground,'#547e86',px-3,py-15,6,20);
        rect(ground,'#86bcc0',px-2,py-14,2,18);
        rect(ground,'#a3d0cb',px-4,py+3,7,2);
      }else if(link.kind==='roots'){
        rect(ground,'#4b5550',px-4,py-18,8,17);
        rect(ground,'#7b8066',px-4,py-16,2,14);
        rect(ground,'#969779',px-7,py-4,5,2);
      }
    }else if(!road&&kind===glowroot&&grain%4!==0){
      if(grain%9===0){
        rect(ground,'#344647',px-1,py-15,4,19);
        rect(ground,'#54726a',px-2,py-14,2,15);
        rect(ground,'#6a8372',px-5,py-6,3,3);
        rect(ground,'#45635d',px+3,py-4,4,3);
      }
      fungi(ground,px,py,grain);
    }
    else if(!road&&kind===crystal&&grain%3===0)prisms(ground,px,py+1,grain);
    else if(!road&&kind===steam&&grain%4===0){
      rect(ground,'#77726d',px-3,py-3,7,4);
      rect(ground,'#b6b3a378',px-1,py-6,3,4);
      rect(ground,'#c3cbac65',px+1,py-8,2,2);
    }else if(kind===sea&&grain%7===0){
      const drift=(day+grain)%5-2;
      rect(ground,grain%2?'#82b7ad':'#b2adb5',px+drift,py-4,3,2);
      rect(ground,'#719eaa',px+drift+3,py-5,1,3);
    }
  }
  for(const town of map.towns){
    if(town.berth===undefined)continue;
    const p=seaPoint(map.width,town.index),q=seaPoint(map.width,town.berth);
    const x=(p.x-origin.x+.5)*T,y=(p.y-origin.y+.5)*T;
    const dx=q.x-p.x,dy=q.y-p.y;
    const left=x-Math.abs(dy)*4+Math.min(0,dx*14),top=y-Math.abs(dx)*4+Math.min(0,dy*14);
    rect(ground,'#5c5a60',left,top,Math.abs(dx)*14+Math.abs(dy)*8,Math.abs(dy)*14+Math.abs(dx)*8);
    for(let i=2;i<14;i+=3)rect(ground,'#998777',left+(dx?i:1),top+(dy?i:1),dx?1:6,dy?1:6);
  }
}

export function paintRealmResident(ctx:CanvasRenderingContext2D,resident:RealmResident,x:number,y:number){
  const ash=resident.people==='ash-borne',skin=ash?'#7d777a':'#c58582',cloth=ash?'#78616c':'#625e87';
  rect(ctx,'#1e202a',x-5,y-1,11,3);
  rect(ctx,cloth,x-4,y-9,8,7);
  rect(ctx,'#4d4352',x-3,y-4,6,3);
  rect(ctx,skin,x-3,y-15,6,7);
  rect(ctx,ash?'#a1a09e':'#714558',x-4,y-16,8,3);
  if(!ash){
    rect(ctx,'#cfb49a',x-4,y-18,2,3);
    rect(ctx,'#cfb49a',x+2,y-18,2,3);
  }else{
    rect(ctx,'#e9a876',x-3,y-14,2,1);
    rect(ctx,'#d9926e',x+2,y-11,2,1);
    rect(ctx,'#b68a73',x-2,y-7,1,3);
  }
  rect(ctx,'#eed1a3',x-2,y-12,1,1);rect(ctx,'#eed1a3',x+1,y-12,1,1);
}
