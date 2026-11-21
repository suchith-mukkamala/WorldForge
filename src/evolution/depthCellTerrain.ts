import type {BuildingPlots} from './buildingPlots';
import type {createDepthProjector} from './depthProjection';
import {DEPTH_RISE} from './depthProjection';
import {pickTerrainFace,type DepthPicking} from './depthTerrain';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {surfaceGrid,Shore,VISUAL_TERRAIN_SIDE,type SurfaceWorld} from './surfaceGrid';
import {cellPixel,firstTerrainSquare,shadeTerrainPixel,terrainPixel,
  terrainSwatches} from './terrainCellArt';
import {CONTACT_SHADE,insetEdge,RIM_LIGHT,stampSegment,waterCrest} from './depthForm';
import {paintDepthSky} from './depthSky';
import {SEA_LEVEL} from './topography';

type Projector=ReturnType<typeof createDepthProjector>;
const SIDE=VISUAL_TERRAIN_SIDE;
function paintPlotSquare(base:number,color:string){
  const paint=terrainPixel(color.slice(0,7));
  if(color.length===7)return paint;
  const opacity=parseInt(color.slice(7),16)/255;
  const blend=(shift:number)=>Math.round((base>>>shift&255)*(1-opacity)+(paint>>>shift&255)*opacity);
  return (255<<24|blend(16)<<16|blend(8)<<8|blend(0))>>>0;
}
const GLINT=terrainPixel('#9bcacc');
const SPARK=terrainPixel('#d8e6d9');
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
export function paintDepthCells(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,
  hit:DepthPicking,w:SurfaceWorld,
  projector:Projector,density:number,tiles:readonly number[],sea:string,
  tilePaint:(index:number)=>{color:string;grain:number;water:boolean},
  plots?:Pick<BuildingPlots,'squares'|'decoratedTiles'>,sample=1):void{
  const {width,height}=hit,image=ctx.createImageData(width,height);
  const pixels=new Uint32Array(image.data.buffer);
  pixels.fill(terrainPixel(sea));
  paintDepthSky(pixels,width,height,w.settings.seed,projector.skyBand*density);
  const grid=surfaceGrid(w),{columns,rows,ground,water,shore}=grid;
  const decks=plots&&new Uint8Array(ground.length);
  if(decks)for(const [i,plot] of plots.squares){
    if(plot.kind==='boardwalk')decks[i]=2*TERRAIN_ELEVATION_UNITS;
  }
  const {frontX,frontY}=projector;
  const step=1/SIDE;
  const origin=projector.projectSmooth(-.5,-.5,0);
  const stepX=projector.projectSmooth(-.5+step,-.5,0);
  const stepY=projector.projectSmooth(-.5,-.5+step,0);
  const ux=(stepX.x-origin.x)*density,uy=(stepX.y-origin.y)*density;
  const vx=(stepY.x-origin.x)*density,vy=(stepY.y-origin.y)*density;
  const rise=projector.riseScale/DEPTH_RISE/TERRAIN_ELEVATION_UNITS*density;
  const level=(i:number)=>ground[i]+water[i]+(decks?.[i]??0);
  const seaHeight=(SEA_LEVEL-9)*TERRAIN_ELEVATION_UNITS;
  const count=SIDE/sample,offset=Math.floor(sample/2);
  const order=Array.from({length:count*count},(_,i)=>(i%count+Math.floor(i/count)*SIDE)*sample).sort((a,b)=>
    projector.order(a%SIDE,Math.floor(a/SIDE))-projector.order(b%SIDE,Math.floor(b/SIDE)));
  const a={x:0,y:0},b={x:0,y:0},c={x:0,y:0},d={x:0,y:0};
  const e={x:0,y:0},f={x:0,y:0};
  const top=[a,b,c,d];
  const lip=(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,face:number,factor:number)=>{
    if(Math.hypot(bx-ax,by-ay)<2.5)return;
    const edge=insetEdge(ax,ay,bx,by,cx,cy,1);
    stampSegment(pixels,width,height,edge.ax,edge.ay,edge.bx,edge.by,
      shadeTerrainPixel(face,factor),face);
  };
  const horizontal=frontX>0?[b,c,e,f]:[d,a,e,f];
  const vertical=frontY>0?[c,d,e,f]:[a,b,e,f];
  for(const index of tiles){
    const first=firstTerrainSquare(w.width,columns,index);
    const baseX=first%columns,baseY=Math.floor(first/columns);
    const paint=tilePaint(index),palette=terrainSwatches(paint.color,paint.water);
    const walls=terrainWalls(palette);
    const decorated=plots?.decoratedTiles.has(index)?plots.squares:undefined;
    for(const cell of order){
      const x=baseX+cell%SIDE,y=baseY+Math.floor(cell/SIDE);
      const i=(y+offset)*columns+x+offset;
      const z=level(i);
      const plot=decorated?.get(i);
      const surface=cellPixel(grid,i,palette,paint.grain);
      const color=plot?paintPlotSquare(surface,plot.color):surface;
      a.x=origin.x*density+x*ux+y*vx;a.y=origin.y*density+x*uy+y*vy-z*rise;
      b.x=a.x+ux*sample;b.y=a.y+uy*sample;
      c.x=b.x+vx*sample;c.y=b.y+vy*sample;
      d.x=a.x+vx*sample;d.y=a.y+vy*sample;
      const tx=frontX*sample,ty=frontY*sample;
      const zX=x+tx>=0&&x+tx<columns?level(i+tx):seaHeight;
      const zY=y+ty>=0&&y+ty<rows?level(i+ty*columns):seaHeight;
      if(frontX&&zX<z){
        e.x=horizontal[1].x;e.y=horizontal[1].y+(z-zX)*rise;
        f.x=horizontal[0].x;f.y=horizontal[0].y+(z-zX)*rise;
        const wall=!plot&&shore[i]===Shore.ground?cellPixel(grid,i,walls.east,paint.grain):
          shadeTerrainPixel(color,.71);
        pickTerrainFace(hit,horizontal,index,pixels,wall);
      }
      if(frontY&&zY<z){
        e.x=vertical[1].x;e.y=vertical[1].y+(z-zY)*rise;
        f.x=vertical[0].x;f.y=vertical[0].y+(z-zY)*rise;
        const wall=!plot&&shore[i]===Shore.ground?cellPixel(grid,i,walls.south,paint.grain):
          shadeTerrainPixel(color,.83);
        pickTerrainFace(hit,vertical,index,pixels,wall);
      }
      pickTerrainFace(hit,top,index,pixels,color);
      if(!plot){
        const crest=paint.water&&shore[i]===Shore.ground?waterCrest(paint.grain,x,y):0;
        const rimX=!!frontX&&(z-zX)*rise>=2;
        const rimY=!!frontY&&(z-zY)*rise>=2;
        const zBackX=rimX||frontX?x-tx>=0&&x-tx<columns?level(i-tx):z:z;
        const zBackY=rimY||frontY?y-ty>=0&&y-ty<rows?level(i-ty*columns):z:z;
        const shadeX=!!frontX&&(zBackX-z)*rise>=2;
        const shadeY=!!frontY&&(zBackY-z)*rise>=2;
        if(rimX||rimY||shadeX||shadeY||crest){
          const centerX=(a.x+b.x+c.x+d.x)/4,centerY=(a.y+b.y+c.y+d.y)/4;
          if(rimX)lip(frontX>0?b.x:d.x,frontX>0?b.y:d.y,frontX>0?c.x:a.x,frontX>0?c.y:a.y,
            centerX,centerY,color,RIM_LIGHT);
          if(rimY)lip(frontY>0?c.x:a.x,frontY>0?c.y:a.y,frontY>0?d.x:b.x,frontY>0?d.y:b.y,
            centerX,centerY,color,RIM_LIGHT);
          if(shadeX)lip(frontX>0?d.x:b.x,frontX>0?d.y:b.y,frontX>0?a.x:c.x,frontX>0?a.y:c.y,
            centerX,centerY,color,CONTACT_SHADE);
          if(shadeY)lip(frontY>0?a.x:c.x,frontY>0?a.y:c.y,frontY>0?b.x:d.x,frontY>0?b.y:d.y,
            centerX,centerY,color,CONTACT_SHADE);
          if(crest){
            const px=Math.round(centerX),py=Math.round(centerY),at=py*width+px;
            if(px>=0&&py>=0&&px<width&&py<height&&pixels[at]===color){
              pixels[at]=GLINT;
              if(px+1<width&&pixels[at+1]===color)pixels[at+1]=crest===2?SPARK:GLINT;
              if(crest===2&&px+2<width&&pixels[at+2]===color)pixels[at+2]=GLINT;
            }
          }
        }
      }
    }
  }
  ctx.putImageData(image,0,0);
}
