import type {createDepthProjector} from './depthProjection';
import type {Point} from './motion';

type Projector=ReturnType<typeof createDepthProjector>;
type Quad=readonly [Point,Point,Point,Point];
const midpoint=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

/** Subdivide a projected square into four decorative squares. */
export function depthTileQuarters([a,b,c,d]:Quad):readonly [Quad,Quad,Quad,Quad]{
  const top=midpoint(a,b),right=midpoint(b,c),bottom=midpoint(c,d),left=midpoint(d,a);
  const center=midpoint(a,c);
  return [[a,top,center,left],[top,b,right,center],
    [left,center,bottom,d],[center,right,c,bottom]];
}

export function terrainRiverEdge(heights:readonly number[],projector:Projector,
  width:number,index:number,other:number):Point{
  const x=index%width,y=Math.floor(index/width);
  return projector.project((x+other%width)/2,(y+Math.floor(other/width))/2,heights[index]);
}

export type DepthPicking={width:number;height:number;ids:Uint32Array};
type RasterDepth={values:Float32Array;origin:number;dx:number;dy:number};

/** Fill a convex face at pixel centers. Shared edges use half-open spans so
 * adjacent faces meet without mixing their colors or leaving a seam. */
export function rasterFace({width,height}:{width:number;height:number},points:readonly Point[],
  pixels:Uint32Array|undefined,color:number,ids?:Uint32Array,id=0,depth?:RasterDepth):void{
  let top=Infinity,bottom=-Infinity;
  for(const {y} of points){top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const lastRow=Math.min(height,Math.ceil(bottom-.5));
  for(let y=Math.max(0,Math.ceil(top-.5));y<lastRow;y++){
    const scan=y+.5;
    let left=Infinity,right=-Infinity;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const upper=a.y<=b.y?a:b,lower=upper===a?b:a;
      if(scan<upper.y||scan>=lower.y)continue;
      const x=upper.x+(lower.x-upper.x)*(scan-upper.y)/(lower.y-upper.y);
      left=Math.min(left,x);right=Math.max(right,x);
    }
    const start=Math.max(0,Math.ceil(left-.5)),end=Math.min(width,Math.ceil(right-.5));
    if(start<end){
      const offset=y*width;
      ids?.fill(id,offset+start,offset+end);
      if(depth&&pixels){
        let z=depth.origin+depth.dx*(start+.5)+depth.dy*scan;
        for(let x=start;x<end;x++,z+=depth.dx){
          const i=offset+x;
          if(z<depth.values[i])continue;
          depth.values[i]=z;pixels[i]=color;
        }
      }else pixels?.fill(color,offset+start,offset+end);
    }
  }
}

export function pickTerrainFace(picking:DepthPicking,points:readonly Point[],index:number,
  pixels?:Uint32Array,color=0):void{
  rasterFace(picking,points,pixels,color,picking.ids,index+1);
}
