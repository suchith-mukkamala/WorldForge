import type {World} from './engine';
import type {createDepthProjector} from './depthProjection';
import {DEPTH_RISE} from './depthProjection';
import {pickTerrainFace,type DepthPicking} from './depthTerrain';
import {TERRAIN_CELL_SIDE,TERRAIN_ELEVATION_UNITS,terrainRenderGrid} from './terrainCells';
import {cellPixel,firstTerrainSquare,shadeTerrainPixel,terrainPixel,
  terrainSwatches} from './terrainCellArt';
import {SEA_LEVEL} from './topography';

type Projector=ReturnType<typeof createDepthProjector>;
const SIDE=TERRAIN_CELL_SIDE;
const wallColors=new WeakMap<Uint32Array,{east:Uint32Array;south:Uint32Array}>();
function terrainWalls(palette:Uint32Array){
  const cached=wallColors.get(palette);
  if(cached)return cached;
  const walls={east:palette.map(pixel=>shadeTerrainPixel(pixel,.71)),
    south:palette.map(pixel=>shadeTerrainPixel(pixel,.83))};
  wallColors.set(palette,walls);
  return walls;
}

/** Rasterize a single world-wide grid. Terrain and selection IDs use the same
 * spans. A small face costs a few contiguous writes instead of a canvas path. */
export function paintDepthCells(ctx:CanvasRenderingContext2D,hit:DepthPicking,w:World,
  projector:Projector,density:number,tiles:readonly number[],sea:string,
  tilePaint:(index:number)=>{color:string;grain:number;water:boolean}):void{
  const {width,height}=hit,image=ctx.createImageData(width,height);
  const pixels=new Uint32Array(image.data.buffer);
  pixels.fill(terrainPixel(sea));
  const grid=terrainRenderGrid(w),{columns,rows,ground,water}=grid;
  const {frontX,frontY}=projector;
  const step=1/SIDE;
  const origin=projector.projectSmooth(-.5,-.5,0);
  const stepX=projector.projectSmooth(-.5+step,-.5,0);
  const stepY=projector.projectSmooth(-.5,-.5+step,0);
  const ux=(stepX.x-origin.x)*density,uy=(stepX.y-origin.y)*density;
  const vx=(stepY.x-origin.x)*density,vy=(stepY.y-origin.y)*density;
  const rise=projector.riseScale/DEPTH_RISE/TERRAIN_ELEVATION_UNITS*density;
  const level=(i:number)=>ground[i]+water[i];
  const seaHeight=(SEA_LEVEL-9)*TERRAIN_ELEVATION_UNITS;
  const order=Array.from({length:SIDE*SIDE},(_,i)=>i).sort((a,b)=>
    projector.order(a%SIDE,Math.floor(a/SIDE))-projector.order(b%SIDE,Math.floor(b/SIDE)));
  const a={x:0,y:0},b={x:0,y:0},c={x:0,y:0},d={x:0,y:0};
  const e={x:0,y:0},f={x:0,y:0};
  const top=[a,b,c,d];
  const horizontal=frontX>0?[b,c,e,f]:[d,a,e,f];
  const vertical=frontY>0?[c,d,e,f]:[a,b,e,f];
  for(const index of tiles){
    const first=firstTerrainSquare(w.width,columns,index);
    const baseX=first%columns,baseY=Math.floor(first/columns);
    const paint=tilePaint(index),palette=terrainSwatches(paint.color,paint.water);
    const walls=terrainWalls(palette);
    for(const offset of order){
      const x=baseX+offset%SIDE,y=baseY+Math.floor(offset/SIDE),i=y*columns+x;
      const z=level(i);
      a.x=origin.x*density+x*ux+y*vx;a.y=origin.y*density+x*uy+y*vy-z*rise;
      b.x=a.x+ux;b.y=a.y+uy;
      c.x=b.x+vx;c.y=b.y+vy;
      d.x=a.x+vx;d.y=a.y+vy;
      const zX=x+frontX>=0&&x+frontX<columns?level(i+frontX):seaHeight;
      const zY=y+frontY>=0&&y+frontY<rows?level(i+frontY*columns):seaHeight;
      if(frontX&&zX<z){
        e.x=horizontal[1].x;e.y=horizontal[1].y+(z-zX)*rise;
        f.x=horizontal[0].x;f.y=horizontal[0].y+(z-zX)*rise;
        pickTerrainFace(hit,horizontal,index, pixels,cellPixel(grid,i,walls.east,paint.grain));
      }
      if(frontY&&zY<z){
        e.x=vertical[1].x;e.y=vertical[1].y+(z-zY)*rise;
        f.x=vertical[0].x;f.y=vertical[0].y+(z-zY)*rise;
        pickTerrainFace(hit,vertical,index, pixels,cellPixel(grid,i,walls.south,paint.grain));
      }
      pickTerrainFace(hit,top,index,pixels,cellPixel(grid,i,palette,paint.grain));
    }
  }
  ctx.putImageData(image,0,0);
}
