import type {World} from './engine';
import {topographyForWorld,type Topography} from './topography';
import type {createDepthProjector} from './depthProjection';
import type {Point} from './motion';

const CLIFF_HEIGHT=32;
type Corner={index:number;slot:number};
type TerrainSurface={heights:number[];corners:Float32Array};
type Projector=ReturnType<typeof createDepthProjector>;
const surfaces=new WeakMap<Topography,TerrainSurface>();

/** Gentle neighbors meet at shared corners. A sharp break can have a higher
 * ledge and a lower ledge at the same vertex, with a cliff between them. */
export function depthTerrain(w:World):TerrainSurface{
  const topography=topographyForWorld(w),existing=surfaces.get(topography);
  if(existing)return existing;
  const {width,height,tiles}=w,heights=topography.heights;
  const corners=new Float32Array(tiles.length*4);
  for(let y=0;y<=height;y++)for(let x=0;x<=width;x++){
    const near:Corner[]=[];
    if(x>0&&y>0)near.push({index:(y-1)*width+x-1,slot:2});
    if(x<width&&y>0)near.push({index:(y-1)*width+x,slot:3});
    if(x<width&&y<height)near.push({index:y*width+x,slot:0});
    if(x>0&&y<height)near.push({index:y*width+x-1,slot:1});
    near.sort((a,b)=>heights[a.index]-heights[b.index]);
    for(let start=0;start<near.length;){
      let end=start+1;
      while(end<near.length&&heights[near[end].index]-heights[near[end-1].index]<CLIFF_HEIGHT)end++;
      let sum=0,water:number|undefined;
      for(let j=start;j<end;j++){
        const i=near[j].index;
        sum+=heights[i];
        if(tiles[i].biome==='water')water=heights[i];
      }
      const elevation=water??sum/(end-start);
      for(let j=start;j<end;j++)corners[near[j].index*4+near[j].slot]=elevation;
      start=end;
    }
  }
  const surface={heights,corners};
  surfaces.set(topography,surface);
  return surface;
}

export function projectedTerrainCorners(surface:TerrainSurface,projector:Projector,
  width:number,index:number):[Point,Point,Point,Point]{
  const x=index%width,y=Math.floor(index/width),i=index*4,h=surface.corners;
  return [projector.projectSmooth(x-.5,y-.5,h[i]),
    projector.projectSmooth(x+.5,y-.5,h[i+1]),
    projector.projectSmooth(x+.5,y+.5,h[i+2]),
    projector.projectSmooth(x-.5,y+.5,h[i+3])];
}

/** Height on a triangular slope between the tile center and its perimeter. */
function meshHeight(surface:TerrainSurface,index:number,dx:number,dy:number):number{
  const radial=Math.max(Math.abs(dx),Math.abs(dy))*2;
  const center=surface.heights[index];
  if(!radial)return center;
  const i=index*4,h=surface.corners;
  const along=(a:number,b:number,position:number)=>h[i+a]+(h[i+b]-h[i+a])*(.5+position/radial);
  const edge=Math.abs(dx)>=Math.abs(dy)?
    dx<0?along(0,3,dy):along(1,2,dy):
    dy<0?along(0,1,dx):along(3,2,dx);
  return center+(edge-center)*radial;
}

export function depthGroundHeight(w:World,x:number,y:number):number{
  const tx=Math.max(0,Math.min(w.width-1,Math.round(x)));
  const ty=Math.max(0,Math.min(w.height-1,Math.round(y)));
  return meshHeight(depthTerrain(w),ty*w.width+tx,
    Math.max(-.5,Math.min(.5,x-tx)),Math.max(-.5,Math.min(.5,y-ty)));
}

export function terrainRiverEdge(surface:TerrainSurface,projector:Projector,
  width:number,index:number,other:number):Point{
  const x=index%width,y=Math.floor(index/width);
  const dx=(other%width-x)/2,dy=(Math.floor(other/width)-y)/2;
  return projector.projectSmooth(x+dx,y+dy,meshHeight(surface,index,dx,dy));
}

export type DepthPicking={width:number;height:number;ids:Uint32Array};

/** Rasterize visible convex faces in draw order. Each pixel has one tile ID,
 * so anti-aliased edges can't mix two IDs into some unrelated location. */
export function pickTerrainFace(picking:DepthPicking,points:readonly Point[],index:number):void{
  let top=Infinity,bottom=-Infinity;
  for(const {y} of points){top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const lastRow=Math.min(picking.height,Math.ceil(bottom-.5));
  for(let y=Math.max(0,Math.ceil(top-.5));y<lastRow;y++){
    const scan=y+.5;
    let left=Infinity,right=-Infinity;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      if(scan<Math.min(a.y,b.y)||scan>=Math.max(a.y,b.y))continue;
      const x=a.x+(b.x-a.x)*(scan-a.y)/(b.y-a.y);
      left=Math.min(left,x);right=Math.max(right,x);
    }
    const start=Math.max(0,Math.ceil(left-.5)),end=Math.min(picking.width,Math.ceil(right-.5));
    if(start<end)picking.ids.fill(index+1,y*picking.width+start,y*picking.width+end);
  }
}
