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

/** Rasterize visible convex faces in draw order. Each pixel has one tile ID,
 * so anti-aliased edges can't mix two IDs into some unrelated location. */
export function pickTerrainFace(picking:DepthPicking,points:readonly Point[],index:number,
  pixels?:Uint32Array,color=0):void{
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
    if(start<end){
      const offset=y*picking.width;
      picking.ids.fill(index+1,offset+start,offset+end);
      pixels?.fill(color,offset+start,offset+end);
    }
  }
}
