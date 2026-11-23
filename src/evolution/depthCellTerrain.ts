import type {RasterCrop} from './atlasRaster';
import type {BuildingPlots} from './buildingPlots';
import type {createDepthProjector} from './depthProjection';
import {DEPTH_RISE} from './depthProjection';
import {pickTerrainFace,type DepthPicking} from './depthTerrain';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {surfaceGrid,Shore,VISUAL_TERRAIN_SIDE,type SurfaceWorld} from './surfaceGrid';
import {cellPixel,firstTerrainSquare,shadeTerrainPixel,terrainPixel,
  terrainSwatches} from './terrainCellArt';
import {CONTACT_SHADE,insetEdge,RIM_LIGHT,stampSegment,waterCrest} from './depthForm';
import {SEA_LEVEL} from './topography';
import {surfaceLight} from './surfaceLight';

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
/** Rasterize a single world-wide grid. Terrain and selection IDs use the same
 * spans. A small face costs a few contiguous writes instead of a canvas path. */
export function paintDepthCells(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,
  hit:DepthPicking,w:SurfaceWorld,
  projector:Projector,density:number,tiles:readonly number[],sea:string,
  tilePaint:(index:number)=>{color:string;grain:number;water:boolean},
  plots?:Pick<BuildingPlots,'squares'|'decoratedTiles'>,sample=1,cutaway=false,crop?:RasterCrop):void{
  const {width,height}=hit,image=ctx.createImageData(width,height);
  const pixels=new Uint32Array(image.data.buffer);
  if(!cutaway)pixels.fill(terrainPixel(sea));
  const grid=surfaceGrid(w),{columns,rows,ground,water,shore,rootRise}=grid;
  const light=surfaceLight(w);
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
  const ox=origin.x*density-(crop?.left??0),oy=origin.y*density-(crop?.top??0);
  const spanX=(Math.abs(ux)+Math.abs(vx))*SIDE,spanY=(Math.abs(uy)+Math.abs(vy))*SIDE;
  const rise=projector.riseScale/DEPTH_RISE/TERRAIN_ELEVATION_UNITS*density;
  const level=(i:number)=>ground[i]+water[i]+(decks?.[i]??0)+(rootRise?.[i]??0);
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
  const seam=(topA:typeof a,topB:typeof b,upper:number,lower:number,wall:number)=>{
    const drop=(upper-lower)*rise;
    if(drop<6)return;
    const band=(upper-Math.floor((upper-4)/24)*24)*rise;
    if(band<1.2||band>drop-1.2)return;
    stampSegment(pixels,width,height,topA.x,topA.y+band,topB.x,topB.y+band,
      shadeTerrainPixel(wall,.79),wall);
  };
  const xWall=frontX<0?.92:.69,yWall=frontY<0?.88:.77;
  const horizontal=frontX>0?[b,c,e,f]:[d,a,e,f];
  const vertical=frontY>0?[c,d,e,f]:[a,b,e,f];
  for(const index of tiles){
    const first=firstTerrainSquare(w.width,columns,index);
    const baseX=first%columns,baseY=Math.floor(first/columns);
    if(crop){
      const x=ox+baseX*ux+baseY*vx,y=oy+baseX*uy+baseY*vy;
      const highest=(255*TERRAIN_ELEVATION_UNITS+255)*rise;
      if(x+spanX<0||x-spanX>width||y+spanY<0||y-spanY-highest>height)continue;
    }
    const paint=tilePaint(index),palette=terrainSwatches(paint.color,paint.water);
    const sunlight=light[index];
    const decorated=plots?.decoratedTiles.has(index)?plots.squares:undefined;
    for(const cell of order){
      const x=baseX+cell%SIDE,y=baseY+Math.floor(cell/SIDE);
      const i=(y+offset)*columns+x+offset;
      const z=level(i);
      const plot=decorated?.get(i);
      const surface=cellPixel(grid,i,palette,paint.grain,sunlight);
      const color=plot?paintPlotSquare(surface,plot.color):surface;
      a.x=ox+x*ux+y*vx;a.y=oy+x*uy+y*vy-z*rise;
      b.x=a.x+ux*sample;b.y=a.y+uy*sample;
      c.x=b.x+vx*sample;c.y=b.y+vy*sample;
      d.x=a.x+vx*sample;d.y=a.y+vy*sample;
      const tx=frontX*sample,ty=frontY*sample;
      const zX=x+tx>=0&&x+tx<columns?level(i+tx):seaHeight;
      const zY=y+ty>=0&&y+ty<rows?level(i+ty*columns):seaHeight;
      if(frontX&&zX<z){
        e.x=horizontal[1].x;e.y=horizontal[1].y+(z-zX)*rise;
        f.x=horizontal[0].x;f.y=horizontal[0].y+(z-zX)*rise;
        const wall=shadeTerrainPixel(color,xWall);
        pickTerrainFace(hit,horizontal,index,pixels,wall);
        if(!plot&&!paint.water)seam(horizontal[0],horizontal[1],z,zX,wall);
      }
      if(frontY&&zY<z){
        e.x=vertical[1].x;e.y=vertical[1].y+(z-zY)*rise;
        f.x=vertical[0].x;f.y=vertical[0].y+(z-zY)*rise;
        const wall=shadeTerrainPixel(color,yWall);
        pickTerrainFace(hit,vertical,index,pixels,wall);
        if(!plot&&!paint.water)seam(vertical[0],vertical[1],z,zY,wall);
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
