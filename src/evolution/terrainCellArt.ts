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

const shoreColors=['','#b39771','#c9b087','#448398','#407d93',
  '#a89c81','#778468','#a9c8ce','#53868a','#9bc7c4','#667d99','#aa7894','#c6999b'];
export const shoreColor=(type:number)=>shoreColors[type];
const shoreline=shoreColors.map(color=>color?terrainPixel(color):0);
export function cellPixel(grid:SurfaceGrid,index:number,palette:Uint32Array,grain:number):number{
  const edge=grid.shore[index];
  if(edge!==Shore.ground)return shoreline[edge];
  const water=grid.water[index];
  if(water)return palette[water>=12?14:water>=4?13:12];
  const hash=Math.imul(index^grain,0x45d9f3b);
  return palette[grid.material[index]*4+((hash^(hash>>>15)^(hash>>>27))&3)];
}

export const firstTerrainSquare=(width:number,columns:number,index:number)=>
  Math.floor(index/width)*SIDE*columns+index%width*SIDE;

/** Paint the full overhead grid in one nearest-neighbor image, so the
 * face size and texture stay identical when the camera moves. */
export function paintTerrainMosaic(ctx:CanvasRenderingContext2D,w:SurfaceWorld,unit:number,
  tileColor:(tile:number)=>{color:string;grain:number;water:boolean}|undefined,sea:string):void{
  const grid=surfaceGrid(w),{columns,rows}=grid;
  const texture=document.createElement('canvas');
  texture.width=columns;texture.height=rows;
  const painter=texture.getContext('2d');
  if(!painter)return;
  const image=painter.createImageData(columns,rows),pixels=new Uint32Array(image.data.buffer);
  pixels.fill(terrainPixel(sea));
  for(let tile=0;tile<w.tiles.length;tile++){
    const terrain=tileColor(tile);
    if(!terrain)continue;
    const palette=terrainSwatches(terrain.color,terrain.water);
    const first=firstTerrainSquare(w.width,columns,tile);
    for(let row=0;row<SIDE;row++)for(let col=0;col<SIDE;col++){
      const i=first+row*columns+col;
      pixels[i]=cellPixel(grid,i,palette,terrain.grain);
    }
  }
  painter.putImageData(image,0,0);
  ctx.drawImage(texture,0,0,w.width*unit,w.height*unit);
}
