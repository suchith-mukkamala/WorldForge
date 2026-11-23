import {terrainNoise} from './biomeGeneration';
import {DESCENT_BLOCK_VIEW,paintBlockContact,paintBlockScenery} from './blockScenery';
import type {Point} from './motion';
import {realmScenery,type RealmFormation} from './realmScenery';
import {realmPropAt} from './realmSceneryArt';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';
import {RealmBiome,realmFordOpen,type RealmMap,type RealmResident} from './underworld';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';

export const REALM_TILE=24;
const SIDE=VISUAL_TERRAIN_SIDE,T=REALM_TILE;
const {basalt,ember,lava,steam,glowroot,crystal,chalk,sea}=RealmBiome;

export const UNDERWORLD_BIOMES=[
  {name:'Basalt galleries',color:'#746980',floor:['#3e374c','#51465e','#5b5169','#72627c']},
  {name:'Ember Rivers',color:'#a46755',floor:['#543b48','#70494a','#86554f','#a46a57']},
  {name:'Molten channels',color:'#ff9754',floor:['#7d293c','#c34534','#f87632','#ffcc69']},
  {name:'Steam banks',color:'#b9ac91',floor:['#777574','#9b9077','#b6a77c','#d1bd8e']},
  {name:'Glowroot Forests',color:'#58ac91',floor:['#254c50','#306365','#387674','#50988a']},
  {name:'Crystal halls',color:'#a58ac0',floor:['#50456f','#625488','#7966a1','#9780b5']},
  {name:'Pale shores',color:'#d9c393',floor:['#958970','#aca28a','#c0b491','#d5c89f']},
  {name:'Buried Sea',color:'#378ba5',floor:['#173750','#204a6c','#285f86','#397596']},
] as const;
const palette=UNDERWORLD_BIOMES.map(biome=>biome.floor.map(terrainPixel));
const shallows=['#306e88','#3d909f','#63aaa9','#9fd0bb'].map(terrainPixel);
const paving=['#82756d','#9d8b7e','#af9d87','#c9b69b'].map(terrainPixel);
const piers=['#796b68','#938278','#a48f7e','#b7a38a'].map(terrainPixel);
const emberLight=terrainPixel('#ffb06a');
const abyss=terrainPixel('#171825');
const lavaCrust=['#442941','#653246','#863c42'].map(terrainPixel);
const mineralSpecks=['#b38fc9','#76c2c9','#e6af79'].map(terrainPixel);
const fungusLight=['#75e3c7','#e6a9e0','#aee6a0'].map(terrainPixel);
const steamLight=terrainPixel('#9cd1b7');
const rect=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
};

function tintStone(ink:number,tint:number,strength:number){
  const mix=(shift:number)=>Math.round((ink>>>shift&255)*(1-strength)+(tint>>>shift&255)*strength);
  return (255<<24|mix(16)<<16|mix(8)<<8|mix(0))>>>0;
}

function formationLight(formation:RealmFormation|undefined){
  if(formation?.kind==='fungus')return fungusLight[formation.variant];
  if(formation?.kind==='crystal')return mineralSpecks[formation.variant];
  if(formation?.kind==='vent')return steamLight;
}

export function realmFloorPixels(map:RealmMap,day:number|undefined,origin:Point,width:number,height:number){
  const iw=width*SIDE;
  const pixels=new Uint32Array(iw*height*SIDE);
  const scene=realmScenery(map);
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
    const formation=scene.formations.get(i),light=formationLight(formation)??(map.houses.has(i)?emberLight:undefined);
    const lightX=(.5+(formation?.dx??0))*SIDE,lightY=(.5+(formation?.dy??0))*SIDE;
    const mineral=Math.floor(terrainNoise(x,y,5,map.seed+91)*6);
    const coast=scene.coast[i];
    const northRoad=map.roads.has(i-map.width),southRoad=map.roads.has(i+map.width);
    const westRoad=x>0&&map.roads.has(i-1),eastRoad=x<map.width-1&&map.roads.has(i+1);
    const hotEdge=north===lava||south===lava||west===lava||east===lava;
    for(let dy=0;dy<SIDE;dy++)for(let dx=0;dx<SIDE;dx++){
      const px=x*SIDE+dx,py=y*SIDE+dy;
      const grain=Math.imul(px+map.seed,1597334677)^Math.imul(py,122949829);
      const hash=Math.imul(grain^grain>>>14,0x45d9f3b);
      const variation=terrainNoise(px,py,9,map.seed)*(kind===sea?.9:1.35);
      const level=Math.max(0,Math.min(3,Math.floor(1.70+variation+(hash>>>28)*.056)));
      const edge=dy===0?north:dy===SIDE-1?south:dx===0?west:dx===SIDE-1?east:undefined;
      const blend=edge!==undefined&&edge!==lava&&edge!==sea&&kind!==lava&&kind!==sea&&
        edge!==kind&&(hash&3)>1;
      const step=kind!==sea&&kind!==lava&&dy>=SIDE-2&&map.heights[i]>(map.heights[i+map.width]??0)+3;
      const causeway=road&&(dx>=3&&dx<=4||dy>=3&&dy<=4)&&
        (dx>=2&&dx<=5&&dy>=2&&dy<=5||
          dy<=2&&northRoad||dy>=5&&southRoad||dx<=2&&westRoad||dx>=5&&eastRoad);
      let color=span?piers[(dx+Math.floor(dy/3))&3]:causeway?paving[level]:
        step?palette[kind][dy===SIDE-1?0:1]:palette[blend?edge:kind][level];
      if(!span&&kind===lava){
        const pulse=terrainNoise(px*.62,py,4,map.seed+664);
        const bank=Math.min(north!==lava?dy:SIDE,south!==lava?SIDE-1-dy:SIDE,
          west!==lava?dx:SIDE,east!==lava?SIDE-1-dx:SIDE);
        const crust=bank===0||bank===1&&variation<-.13;
        color=crust?lavaCrust[level%3]:palette[lava][pulse>.17?3:pulse>-.24?2:1];
      }else if(!span&&kind===sea){
        const width=2+(hash&1);
        const shallow=shoreNorth&&dy<width||shoreSouth&&dy>=SIDE-width||
          shoreWest&&dx<width||shoreEast&&dx>=SIDE-width;
        const ripple=(py+mineral+(hash>>>27&1))%9===0&&variation>.04;
        const reef=coast<=2&&variation>.17;
        color=(shallow||reef?shallows:palette[sea])[ripple?3:level];
        if(!shallow&&!reef&&coast===4)color=shadeTerrainPixel(color,.83);
      }else if(!span){
        const seam=(px+py*2+mineral)&15;
        if(!causeway&&(kind===basalt||kind===ember)&&seam<=1)color=shadeTerrainPixel(color,.76+(hash&3)*.046);
        if(!causeway&&kind===crystal&&((px-py+mineral)&13)===0&&(hash&7)>4)
          color=tintStone(color,mineralSpecks[formation?.variant??0],.48);
        if(!causeway&&kind===glowroot&&seam===1&&variation>.09)
          color=tintStone(color,fungusLight[formation?.variant??0],.29);
        if(hotEdge){
          const glow=Math.min(north===lava?dy:SIDE,south===lava?SIDE-1-dy:SIDE,
            west===lava?dx:SIDE,east===lava?SIDE-1-dx:SIDE);
          if(glow<4)color=tintStone(color,emberLight,(4-glow)*.077);
        }
        if(light){
          const glow=Math.max(0,1-(Math.abs(dx+.5-lightX)+Math.abs(dy+.5-lightY))/8);
          color=tintStone(color,light,glow*.29);
        }
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

export function paintRealmTerrain(ground:CanvasRenderingContext2D,texture:HTMLCanvasElement,
  map:RealmMap,day:number,origin:Point,width:number,height:number){
  const small=texture.getContext('2d');if(!small)return;
  paintRealmFloor(small,map,day,origin,width,height);
  ground.imageSmoothingEnabled=false;
  ground.drawImage(texture,0,0,width*T,height*T);
  const scene=realmScenery(map);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const wx=origin.x+x,wy=origin.y+y;
    if(wx<0||wy<0||wx>=map.width||wy>=map.height)continue;
    const prop=realmPropAt(map,scene,wy*map.width+wx);
    if(!prop)continue;
    const point={x:(x+.5+prop.dx)*T,y:(y+.69+prop.dy)*T},unit=prop.unit*1.95;
    paintBlockContact(ground,prop.model,point,DESCENT_BLOCK_VIEW,unit);
    paintBlockScenery(ground,prop.model,point,DESCENT_BLOCK_VIEW,unit);
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
