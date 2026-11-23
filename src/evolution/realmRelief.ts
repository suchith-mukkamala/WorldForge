import type {RasterCrop} from './atlasRaster';
import {interpolatedGroundHeight} from './depthProjection';
import {pickTerrainFace,rasterFace,type DepthPicking} from './depthTerrain';
import type {Point} from './motion';
import {realmScenery} from './realmScenery';
import {realmDepthPoint,type RealmProjection} from './stackedProjection';
import {exposedRock,paintCutRock} from './strataRock';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';
import {RealmBiome,type RealmMap} from './underworld';
import {realmFloorPixels} from './underworldArt';

export type RealmRasterRequest={id:number;projection:RealmProjection;map?:RealmMap;crop?:RasterCrop};
export type RealmRasterResult={id:number;pixels:Uint32Array<ArrayBuffer>;hit:DepthPicking};
type PreparedRealm={map:RealmMap;palette:Uint32Array;columns:number;rows:number;
  elevations:Float32Array;falls:Int8Array;fallWidths:Uint8Array};
const SIDE=VISUAL_TERRAIN_SIDE;
const cataract=['#5d98a8','#96cfcb','#bae0cd','#83bbc3'].map(terrainPixel);
export function realmRasterSize(width:number,height:number){
  const density=Math.min(1.55,Math.sqrt(2_300_000/(width*height)));
  return {width:Math.ceil(width*density),height:Math.ceil(height*density)};
}

export function prepareRealmRelief(map:RealmMap):PreparedRealm{
  const {width,height,biomes,heights}=map,columns=width*SIDE,rows=height*SIDE;
  const palette=realmFloorPixels(map,undefined,{x:0,y:0},width,height);
  const elevations=new Float32Array(palette.length);
  const falls=new Int8Array(biomes.length),fallWidths=new Uint8Array(biomes.length);
  for(const [cell,{dx,dy,flow}] of realmScenery(map).falls){
    falls[cell]=dx+2*dy;
    fallWidths[cell]=flow===2?3:flow===1?1:2;
  }
  const lighting=new Float32Array(biomes.length);
  for(let i=0;i<lighting.length;i++){
    const x=i%width,y=Math.floor(i/width);
    const west=x>0?heights[i-1]:heights[i],east=x+1<width?heights[i+1]:heights[i];
    const north=y>0?heights[i-width]:heights[i],south=y+1<height?heights[i+width]:heights[i];
    lighting[i]=1+Math.max(-.16,Math.min(.16,(east-west)*.013+(south-north)*.007));
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const tile=Math.floor(y/SIDE)*width+Math.floor(x/SIDE),i=y*columns+x;
    const level=heights[tile];
    if(biomes[tile]===RealmBiome.sea||biomes[tile]===RealmBiome.lava){elevations[i]=level;continue;}
    const slope=interpolatedGroundHeight(heights,width,height,(x+.5)/SIDE-.5,(y+.5)/SIDE-.5);
    elevations[i]=Math.round((level*.54+slope*.46)*4)/4;
    palette[i]=shadeTerrainPixel(palette[i],lighting[tile]);
  }
  return {map,palette,columns,rows,elevations,falls,fallWidths};
}

function paintRealmCrust(projection:RealmProjection,hit:DepthPicking,pixels:Uint32Array,map:RealmMap,crop?:RasterCrop){
  const sx=crop?.density??hit.width/projection.width,sy=crop?.density??hit.height/projection.height;
  const left=crop?.left??0,top=crop?.top??0;
  const {frontX,frontY,crust}=projection;
  const rock=exposedRock(map,frontX,frontY,crust,map.seed,'underworld',
    (x,y)=>realmDepthPoint(projection,x,y,0));
  paintCutRock(rock,'underworld',(points,ink)=>{
    rasterFace(hit,points.map(p=>({x:p.x*sx-left,y:p.y*sy-top})),pixels,ink);
  });
}

function paintCliff(hit:DepthPicking,pixels:Uint32Array,face:readonly Point[],tile:number,
  drop:number,ink:number,banded:boolean){
  pickTerrainFace(hit,face,tile,pixels,ink);
  if(!banded||drop<7)return;
  const [a,b]=face;
  const seam=(at:number,thickness:number,tone:number)=>{
    const upper=drop*at,lower=upper+thickness;
    pickTerrainFace(hit,[{x:a.x,y:a.y+upper},{x:b.x,y:b.y+upper},
      {x:b.x,y:b.y+lower},{x:a.x,y:a.y+lower}],tile,pixels,shadeTerrainPixel(ink,tone));
  };
  seam(.57,Math.min(3,drop*.12),.73);
  if(drop>13)seam(.24,Math.min(2,drop*.08),1.17);
}

/** Project the same square heightfield into both atlas views. The floor
 * palette stays valid as time advances, while temporary fords have their
 * own overlay. Each opaque terrain face writes its exact picking ID. */
export function rasterizeRealm({id,projection,crop}:RealmRasterRequest,
  {map,palette,columns,rows,elevations,falls,fallWidths}:PreparedRealm):RealmRasterResult{
  const {width,height}=crop??realmRasterSize(projection.width,projection.height);
  const densityX=crop?.density??width/projection.width,densityY=crop?.density??height/projection.height;
  const hit={width,height,ids:new Uint32Array(width*height)},pixels=new Uint32Array(width*height);
  paintRealmCrust(projection,hit,pixels,map,crop);
  const a={x:0,y:0},b={x:0,y:0},c={x:0,y:0},d={x:0,y:0},e={x:0,y:0},f={x:0,y:0};
  const top=[a,b,c,d],{frontX,frontY,east,south}=projection;
  const faceX=frontX>0?[b,c,e,f]:[d,a,e,f],faceY=frontY>0?[c,d,e,f]:[a,b,e,f];
  const corner=realmDepthPoint(projection,-.5,-.5,0);
  const ox=corner.x*densityX-(crop?.left??0),oy=corner.y*densityY-(crop?.top??0);
  const ux=east.x*densityX/SIDE,uy=east.y*densityY/SIDE;
  const vx=south.x*densityX/SIDE,vy=south.y*densityY/SIDE;
  const rise=projection.rise*densityY,spanX=Math.abs(ux)+Math.abs(vx),spanY=Math.abs(uy)+Math.abs(vy);
  for(let row=0;row<rows;row++){
    const y=frontY<0?rows-row-1:row;
    for(let col=0;col<columns;col++){
      const x=frontX<0?columns-col-1:col;
      const i=y*columns+x,z=elevations[i],ink=palette[i];
      a.x=ox+x*ux+y*vx;a.y=oy+x*uy+y*vy-z*rise;
      if(crop&&(a.x+spanX<0||a.x-spanX>width||a.y+spanY+z*rise<0||a.y-spanY>height))continue;
      const tile=Math.floor(y/SIDE)*map.width+Math.floor(x/SIDE);
      const molten=map.biomes[tile]===RealmBiome.lava&&!map.bridges.has(tile);
      const fall=falls[tile],spread=fallWidths[tile];
      b.x=a.x+ux;b.y=a.y+uy;c.x=b.x+vx;c.y=b.y+vy;d.x=a.x+vx;d.y=a.y+vy;
      const neighborX=x+frontX>=0&&x+frontX<columns?elevations[i+frontX]:0;
      const neighborY=y+frontY>=0&&y+frontY<rows?elevations[i+frontY*columns]:0;
      if(frontX&&neighborX<z){
        const drop=(z-neighborX)*rise;
        e.x=faceX[1].x;e.y=faceX[1].y+drop;
        f.x=faceX[0].x;f.y=faceX[0].y+drop;
        const stripe=y%SIDE,spill=fall===frontX&&x%SIDE===(frontX>0?SIDE-1:0)&&Math.abs(stripe-3.5)<spread;
        paintCliff(hit,pixels,faceX,tile,drop,
          spill?cataract[(stripe+2)%4]:shadeTerrainPixel(ink,molten?.83:.65+(x&3)*.02),!molten&&!spill);
      }
      if(frontY&&neighborY<z){
        const drop=(z-neighborY)*rise;
        e.x=faceY[1].x;e.y=faceY[1].y+drop;
        f.x=faceY[0].x;f.y=faceY[0].y+drop;
        const stripe=x%SIDE,spill=fall===2*frontY&&y%SIDE===(frontY>0?SIDE-1:0)&&Math.abs(stripe-3.5)<spread;
        paintCliff(hit,pixels,faceY,tile,drop,
          spill?cataract[(stripe+2)%4]:shadeTerrainPixel(ink,molten?.92:.75+(y&3)*.02),!molten&&!spill);
      }
      pickTerrainFace(hit,top,tile,pixels,ink);
    }
  }
  return {id,pixels,hit};
}
