import {OCEAN_TONES} from './oceanDepth';
import {LEVEL_LIGHT,surfaceLight} from './surfaceLight';
import type {Point} from './motion';
import type {TerrainCell} from './terrainCells';
import {Shore,surfaceGrid,VISUAL_TERRAIN_SIDE,type SurfaceGrid,type SurfaceWorld} from './surfaceGrid';

const SIDE=VISUAL_TERRAIN_SIDE;
const colors=new Map<string,Uint32Array>();
const materialColors={stone:'#85929b',soil:'#658564',sand:'#bd9f72'};
export function terrainCellColor(cell:TerrainCell):string{
  return cell.waterDepth>=3?'#43798f':cell.waterDepth>=1?'#509798':
    cell.waterDepth>0?'#67a6a4':materialColors[cell.material];
}

/** Canvas ImageData stores RGBA bytes. Keep one small palette per ground
 * color instead of parsing CSS or making draw calls for every square. */
export function terrainPixel(color:string):number{
  const rgb=color.startsWith('#')?parseInt(color.slice(1),16):
    color.match(/\d+/g)!.reduce((value,digit)=>value*256+Number(digit),0);
  return (255<<24|(rgb&255)<<16|(rgb&0xff00)|rgb>>>16)>>>0;
}

export function shadeTerrainPixel(pixel:number,factor:number):number{
  const r=Math.min(255,Math.round((pixel&255)*factor));
  const g=Math.min(255,Math.round((pixel>>>8&255)*factor));
  const b=Math.min(255,Math.round((pixel>>>16&255)*factor));
  return (255<<24|b<<16|g<<8|r)>>>0;
}

export function terrainSwatches(color:string,water:boolean):Uint32Array{
  const key=color+':'+water,cached=colors.get(key);
  if(cached)return cached;
  const base=terrainPixel(color);
  const materials=['#a3a7a4','#79785c','#d6b586'].map(terrainPixel);
  const palette=new Uint32Array(15);
  for(let i=0;i<12;i++){
    const tint=materials[i>>2],weight=water?0:i>>2===1?.055:.14;
    const mix=(shift:number)=>Math.round((base>>>shift&255)*(1-weight)+(tint>>>shift&255)*weight);
    const mixed=(255<<24|mix(16)<<16|mix(8)<<8|mix(0))>>>0;
    palette[i]=shadeTerrainPixel(mixed,1+((i&3)-1.5)*(water?.016:.020));
  }
  palette.set(['#67a6a4','#509798','#43798f'].map(terrainPixel),12);
  colors.set(key,palette);
  return palette;
}

const shoreColors=['','#b39b78','#d6bf91','#509a9a','#428d9a',
  '#a89c81','#778468','#a9c8ce','#53868a','#afd9ce','#667d99','#ac7f99','#d6a39f',
  '#427f8d','#a9ded6','#aa956e','#75583f','#5e6a46','#504c43','#355869'];
const shoreline=shoreColors.map(color=>color?terrainPixel(color):0);
/** Shadows hold more blue while the lit lifts lean warm. All values use
 * the same small set of steps in the overhead and raised views. */
function sunlight(pixel:number,level:number):number{
  const delta=level-LEVEL_LIGHT;
  if(!delta)return pixel;
  const r=Math.min(255,Math.round((pixel&255)*(1+delta*.042)));
  const g=Math.min(255,Math.round((pixel>>>8&255)*(1+delta*.033)));
  const b=Math.min(255,Math.round((pixel>>>16&255)*(1+delta*.024)));
  return (255<<24|b<<16|g<<8|r)>>>0;
}

const oceanPixels=OCEAN_TONES.map(terrainPixel);
const depthRamp=Array.from({length:(OCEAN_TONES.length-1)*SIDE+1},(_,step)=>{
  const lower=Math.floor(step/SIDE),weight=step/SIDE-lower;
  const a=oceanPixels[lower],b=oceanPixels[Math.min(oceanPixels.length-1,lower+1)];
  const mix=(shift:number)=>Math.round((a>>>shift&255)*(1-weight)+(b>>>shift&255)*weight);
  return (255<<24|mix(16)<<16|mix(8)<<8|mix(0))>>>0;
});
function waterDepthPixel(grid:SurfaceGrid,depths:Uint8Array,x:number,y:number):number{
  const width=grid.columns/SIDE,height=grid.rows/SIDE;
  const tx=Math.floor(x/SIDE),ty=Math.floor(y/SIDE),i=ty*width+tx;
  const dx=(x%SIDE+.5)/SIDE-.5,dy=(y%SIDE+.5)/SIDE-.5;
  const sx=tx+Math.sign(dx),sy=ty+Math.sign(dy);
  const horizontal=sx>=0&&sx<width?sx-tx:0;
  const vertical=sy>=0&&sy<height?(sy-ty)*width:0;
  const u=Math.abs(dx),v=Math.abs(dy),center=depths[i]||1;
  const east=depths[i+horizontal]||1,south=depths[i+vertical]||1;
  const cross=depths[i+horizontal+vertical]||1;
  const top=center+(east-center)*u,bottom=south+(cross-south)*u;
  return depthRamp[Math.round((top+(bottom-top)*v)*SIDE)];
}

const spray=terrainPixel('#a6d6c5');
export function cellPixel(grid:SurfaceGrid,index:number,palette:Uint32Array,grain:number,light=LEVEL_LIGHT):number{
  const edge=grid.shore[index];
  let color:number;
  if(edge!==Shore.ground){
    color=shoreline[edge];
    if(edge===Shore.rootBark||edge===Shore.rootMoss||edge===Shore.rootWet){
      const fleck=Math.imul(index^grain,0x45d9f3b)>>>27;
      color=shadeTerrainPixel(color,.94+fleck*.004);
    }
  }
  else{
    const water=grid.water[index],hash=Math.imul(index^grain,0x45d9f3b);
    color=water?palette[water>=12?14:water>=4?13:12]:
      palette[grid.material[index]*4+((hash^(hash>>>15)^(hash>>>27))&3)];
  }
  const x=index%grid.columns,y=Math.floor(index/grid.columns);
  const grainCell=Math.imul(x+17,0x27d4eb2d)^Math.imul(y+11,0x119de1f3);
  if(grid.openWater?.[index]&&(edge===Shore.ground||edge===Shore.shallows)){
    if(edge===Shore.ground&&grid.coast)color=waterDepthPixel(grid,grid.coast,x,y);
    // Short overlapping crests follow world coordinates across tile edges.
    const swell=(y+(x>>3)+((x>>5)&1))&7;
    if(swell===0&&((x+(y>>2)*13)&15)<7)color=shadeTerrainPixel(color,edge===Shore.shallows?1.15:1.12);
    if(edge===Shore.shallows&&(grainCell>>>26)===9&&
      (!grid.openWater[index-grid.columns]||!grid.openWater[index+grid.columns]))color=spray;
  }else if(edge===Shore.ground&&!grid.water[index]){
    const seam=(x+(y>>1)+((x>>3)&3))&15;
    if(grid.material[index]===0&&seam<2&&(grainCell>>>29)>3)color=shadeTerrainPixel(color,.87);
    if(grid.material[index]===1&&((x>>2)^(y>>2))%7===0)color=shadeTerrainPixel(color,1.045);
  }else if(edge===Shore.channel||edge===Shore.wetSand||edge===Shore.drySand){
    color=shadeTerrainPixel(color,.94+(grainCell>>>29)*.018);
  }
  color=sunlight(color,light);
  const shadow=grid.shadow?.[index];
  return shadow?shadeTerrainPixel(color,shadow===3?.91:shadow===1?.81:.68):color;
}

export const firstTerrainSquare=(width:number,columns:number,index:number)=>
  Math.floor(index/width)*SIDE*columns+index%width*SIDE;

type TerrainInk=(tile:number)=>{color:string;grain:number;water:boolean}|undefined;
type SurfacePatch={origin:Point;width:number;height:number};

/** The atlas, walking and sailing sample the same world squares. A local
 * camera asks for just its patch, including the grid outside the map edge. */
export function surfacePatchPixels(w:SurfaceWorld,{origin,width,height}:SurfacePatch,
  tileColor:TerrainInk,sea:string):Uint32Array<ArrayBuffer>{
  const grid=surfaceGrid(w),light=surfaceLight(w),stride=width*SIDE;
  const pixels=new Uint32Array(stride*height*SIDE);
  pixels.fill(terrainPixel(sea));
  for(let ty=0;ty<height;ty++)for(let tx=0;tx<width;tx++){
    const x=origin.x+tx,y=origin.y+ty;
    if(x<0||y<0||x>=w.width||y>=w.height)continue;
    const tile=y*w.width+x,terrain=tileColor(tile);
    if(!terrain)continue;
    const palette=terrainSwatches(terrain.color,terrain.water);
    const first=firstTerrainSquare(w.width,grid.columns,tile);
    const start=ty*SIDE*stride+tx*SIDE;
    for(let row=0;row<SIDE;row++)for(let col=0;col<SIDE;col++){
      const i=first+row*grid.columns+col;
      pixels[start+row*stride+col]=cellPixel(grid,i,palette,terrain.grain,light[tile]);
    }
  }
  return pixels;
}

export function paintTerrainMosaic(ctx:CanvasRenderingContext2D,w:SurfaceWorld,unit:number,
  tileColor:TerrainInk,sea:string,patch:SurfacePatch={origin:{x:0,y:0},width:w.width,height:w.height}):void{
  const texture=document.createElement('canvas');
  texture.width=patch.width*SIDE;texture.height=patch.height*SIDE;
  const painter=texture.getContext('2d');
  if(!painter)return;
  const pixels=surfacePatchPixels(w,patch,tileColor,sea);
  painter.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),texture.width,texture.height),0,0);
  ctx.drawImage(texture,0,0,patch.width*unit,patch.height*unit);
}
