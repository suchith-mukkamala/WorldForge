import {interpolatedGroundHeight,type DepthCamera} from './depthProjection';
import {pickTerrainFace,type DepthPicking} from './depthTerrain';
import type {World} from './engine';
import {stackedProjection} from './stackedProjection';
import {shadeTerrainPixel} from './terrainCellArt';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';
import {RealmBiome,type RealmMap} from './underworld';
import {paintRealmFloor} from './underworldArt';

type Context=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
export type StrataWorld=Pick<World,'width'|'height'|'worldTree'|'skylands'>;
export type RealmRasterRequest={id:number;world:StrataWorld;map:RealmMap;camera:DepthCamera;
  day:number;maxRealmHeight:number};
export type RealmRasterResult={id:number;bitmap:ImageBitmap;hit:DepthPicking};
const SIDE=VISUAL_TERRAIN_SIDE;

export function realmRasterSize(width:number,height:number){
  const density=Math.min(1.4,Math.sqrt(2_300_000/(width*height)));
  return {width:Math.ceil(width*density),height:Math.ceil(height*density)};
}

/** The existing eight-by-eight floor texture is draped over the actual
 * rock heightfield. Tops, vertical risers and picking share each exact face. */
export function paintRealmRelief(ctx:Context,texture:Context,
  request:RealmRasterRequest):DepthPicking{
  const {world,map,camera,day,maxRealmHeight}=request;
  const {underneath,lowerHeight,size,surface}=stackedProjection(world,map,camera,maxRealmHeight);
  const {width,height}=realmRasterSize(size.width,lowerHeight);
  const densityX=width/size.width,densityY=height/lowerHeight;
  const hit={width,height,ids:new Uint32Array(width*height)};
  const image=ctx.createImageData(width,height),pixels=new Uint32Array(image.data.buffer);
  const {width:w,height:h,biomes,heights}=map,columns=w*SIDE,rows=h*SIDE;
  paintRealmFloor(texture,map,day,{x:0,y:0},w,h);
  const palette=new Uint32Array(texture.getImageData(0,0,columns,rows).data.buffer);
  const elevations=new Float32Array(palette.length);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const tile=Math.floor(y/SIDE)*w+Math.floor(x/SIDE),i=y*columns+x;
    const v=heights[tile];
    if(biomes[tile]===RealmBiome.sea||biomes[tile]===RealmBiome.lava){elevations[i]=v;continue;}
    const level=interpolatedGroundHeight(heights,w,h,(x+.5)/SIDE-.5,(y+.5)/SIDE-.5);
    elevations[i]=Math.round((v*.54+level*.46)*4)/4;
  }
  const a={x:0,y:0},b={x:0,y:0},c={x:0,y:0},d={x:0,y:0},e={x:0,y:0},f={x:0,y:0};
  const top=[a,b,c,d],{frontX,frontY}=surface;
  const faceX=frontX>0?[b,c,e,f]:[d,a,e,f],faceY=frontY>0?[c,d,e,f]:[a,b,e,f];
  const origin=underneath(-.5,-.5,0),px=underneath(-.5+1/SIDE,-.5,0),
    py=underneath(-.5,-.5+1/SIDE,0),high=underneath(-.5,-.5,1);
  const ux=(px.x-origin.x)*densityX,uy=(px.y-origin.y)*densityY;
  const vx=(py.x-origin.x)*densityX,vy=(py.y-origin.y)*densityY;
  const rise=(origin.y-high.y)*densityY;
  for(let row=0;row<rows;row++){
    const y=frontY<0?rows-row-1:row;
    for(let col=0;col<columns;col++){
      const x=frontX<0?columns-col-1:col;
      const i=y*columns+x,z=elevations[i],ink=palette[i];
      const tile=Math.floor(y/SIDE)*w+Math.floor(x/SIDE);
      a.x=origin.x*densityX+x*ux+y*vx;a.y=origin.y*densityY+x*uy+y*vy-z*rise;
      b.x=a.x+ux;b.y=a.y+uy;c.x=b.x+vx;c.y=b.y+vy;d.x=a.x+vx;d.y=a.y+vy;
      const neighborX=x+frontX>=0&&x+frontX<columns?elevations[i+frontX]:0;
      const neighborY=y+frontY>=0&&y+frontY<rows?elevations[i+frontY*columns]:0;
      if(frontX&&neighborX<z){
        e.x=faceX[1].x;e.y=faceX[1].y+(z-neighborX)*rise;
        f.x=faceX[0].x;f.y=faceX[0].y+(z-neighborX)*rise;
        pickTerrainFace(hit,faceX,tile,pixels,shadeTerrainPixel(ink,.68));
      }
      if(frontY&&neighborY<z){
        e.x=faceY[1].x;e.y=faceY[1].y+(z-neighborY)*rise;
        f.x=faceY[0].x;f.y=faceY[0].y+(z-neighborY)*rise;
        pickTerrainFace(hit,faceY,tile,pixels,shadeTerrainPixel(ink,.79));
      }
      pickTerrainFace(hit,top,tile,pixels,ink);
    }
  }
  ctx.putImageData(image,0,0);
  return hit;
}
