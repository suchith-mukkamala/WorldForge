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
  const count=points.length;
  let top=Infinity,bottom=-Infinity,peak=0;
  for(let i=0;i<count;i++){
    const y=points[i].y;
    if(y<top){top=y;peak=i;}
    if(y>bottom)bottom=y;
  }
  const firstRow=Math.max(0,Math.ceil(top-.5));
  const lastRow=Math.min(height,Math.ceil(bottom-.5));
  if(firstRow>=lastRow)return;

  // Each side of a convex face advances from its peak to its base. Move
  // along those two chains only when a scanline crosses a vertex.
  let prev=peak,next=peak;
  let a=points[peak],b=a,c=a,d=a;
  let abX=0,abY=1,cdX=0,cdY=1;
  for(let y=firstRow;y<lastRow;y++){
    const scan=y+.5;
    if(scan>=b.y){
      do{
        a=b;prev=prev===0?count-1:prev-1;b=points[prev];
      }while(scan>=b.y);
      abX=b.x-a.x;abY=b.y-a.y;
    }
    if(scan>=d.y){
      do{
        c=d;next=next+1===count?0:next+1;d=points[next];
      }while(scan>=d.y);
      cdX=d.x-c.x;cdY=d.y-c.y;
    }
    const xA=a.x+abX*(scan-a.y)/abY,xB=c.x+cdX*(scan-c.y)/cdY;
    const start=Math.max(0,Math.ceil(Math.min(xA,xB)-.5));
    const end=Math.min(width,Math.ceil(Math.max(xA,xB)-.5));
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
