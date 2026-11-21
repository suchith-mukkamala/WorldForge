import {opaqueArtAt,paintAtlasBuilding,type PlacedArt} from './atlasBuildingArt';
import {terrainHash} from './biomeGeneration';
import {blockProp} from './blockModels';
import {blockSceneryArt,depthBlockView} from './blockScenery';
import type {createDepthProjector} from './depthProjection';
import {rasterFace} from './depthTerrain';
import type {Point} from './motion';
import {skylandMesh,type IslandMesh,type Skyfall,type Skyland} from './skylands';
import {surfaceHeightAt} from './structureGround';
import {VISUAL_TERRAIN_SIDE as SIDE,type SurfaceGrid} from './surfaceGrid';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';

type Projector=ReturnType<typeof createDepthProjector>;
type BlockView=ReturnType<typeof depthBlockView>;
type Face={points:readonly Point[];color:number};
type SkyStamp={id:number;order:number;art:PlacedArt};

const earth={
  grove:['#828974','#749865','#82a875','#93b17a','#6d936b'],
  heath:['#8f897d','#879a72','#a996a2','#928f9c','#a5ad80'],
  frost:['#859ba5','#a8c4cb','#c3d5d4','#e3e6da','#b4cbcf'],
};
const rocks=['#8f8780','#6b6873','#807380','#646271','#778081','#535465','#646878','#484b60'];
const blue=['#538f9d','#6aabba','#cae5dd','#77b7c3','#9ad3ce'];
const colors=Object.fromEntries(Object.entries(earth).map(([key,list])=>[key,list.map(terrainPixel)]));
const strata=rocks.map(terrainPixel),stream=blue.map(terrainPixel);
const riseColors=[1,.83,.96].map(light=>strata.map(value=>shadeTerrainPixel(value,light)));
const worldPoint=(coord:number)=>coord/SIDE-.5;

function roofColor(mesh:IslandMesh,i:number):number{
  return mesh.water[i]?stream[mesh.water[i]-1]:colors[mesh.island.terrain][mesh.cover[i]];
}

function stamp(faces:readonly Face[],density:number):PlacedArt|undefined{
  if(!faces.length)return;
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const {points} of faces)for(const p of points){
    x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);
  }
  x=Math.floor(x*density)/density;y=Math.floor(y*density)/density;
  const image=document.createElement('canvas');
  image.width=Math.ceil((right-x)*density)+1;image.height=Math.ceil((bottom-y)*density)+1;
  const ctx=image.getContext('2d');
  if(!ctx)return;
  const data=ctx.createImageData(image.width,image.height),pixels=new Uint32Array(data.data.buffer);
  for(const {points,color} of faces){
    rasterFace(data,points.map(p=>({x:(p.x-x)*density,y:(p.y-y)*density})),pixels,color);
  }
  ctx.putImageData(data,0,0);
  return {x,y,scale:1/density,art:{image,pixels:data.data,
    bounds:{left:0,right:image.width,top:0,bottom:image.height}}};
}

function islandFaces(mesh:IslandMesh,{projectSmooth,order,frontX,frontY}:Projector,jump:number){
  const {island,left,top,width,rows,surface,underside}=mesh;
  const cells:number[]=[],faces:Face[]=[];
  for(let row=0;row<rows;row+=jump)for(let col=0;col<width;col+=jump){
    const i=row*width+col;
    if(surface[i])cells.push(i);
  }
  cells.sort((a,b)=>order(a%width,Math.floor(a/width))-order(b%width,Math.floor(b/width)));
  const exposed=(z:number,low:number,far:number,farLow:number,
    a:Point,b:Point,light:number)=>{
    const band=(from:number,to:number)=>{
      for(let h=from;h<to;){
        const level=Math.floor((island.height-h-.0001)/9);
        const cap=Math.min(to,island.height-level*9);
        const color=riseColors[light][Math.max(0,Math.min(strata.length-1,level))];
        const points=[projectSmooth(a.x,a.y,h),projectSmooth(b.x,b.y,h),
          projectSmooth(b.x,b.y,cap),projectSmooth(a.x,a.y,cap)];
        faces.push({points,color});
        h=cap;
      }
    };
    if(!far)band(low,z);
    else{
      band(Math.max(low,far),z);
      band(low,Math.min(z,farLow));
    }
  };
  const step=jump/SIDE;
  for(const i of cells){
    const col=i%width,row=Math.floor(i/width),x=worldPoint(left+col),y=worldPoint(top+row);
    const z=surface[i],low=underside[i];
    const farX=i+frontX*jump,farY=i+frontY*jump*width;
    if(frontX){
      const edge=x+(frontX>0?step:0),inside=col+frontX*jump>=0&&col+frontX*jump<width;
      exposed(z,low,inside?surface[farX]:0,inside?underside[farX]:0,
        {x:edge,y},{x:edge,y:y+step},1);
    }
    if(frontY){
      const edge=y+(frontY>0?step:0);
      exposed(z,low,surface[farY],underside[farY],{x,y:edge},{x:x+step,y:edge},2);
    }
    faces.push({points:[projectSmooth(x,y,z),projectSmooth(x+step,y,z),
      projectSmooth(x+step,y+step,z),projectSmooth(x,y+step,z)],color:roofColor(mesh,i)});
  }
  return faces;
}

function fallingWater(fall:Skyfall,projector:Projector,grid:SurfaceGrid):Face[]{
  const {x,y,height,direction:{x:dx,y:dy}}=fall;
  const floor=surfaceHeightAt(grid,x+dx*.008,y+dy*.008),faces:Face[]=[];
  const {frontX,frontY,projectSmooth:p}=projector;
  // Three square-wide ribbons fall independently into the marked pool.
  for(let row=floor;row<height;row+=7){
    for(let strand=-1;strand<=1;strand++){
      const a=x-dy*strand/SIDE+dx*.021,b=y+dx*strand/SIDE+dy*.021;
      const half=fall.width/6,top=Math.min(height,row+7);
      const xx=a+frontX*half,yy=b+frontY*half;
      const color=stream[(Math.floor(row/7)+(strand+1)*3)%stream.length];
      if(frontX)faces.push({color,points:[p(xx,b-half,row),p(xx,b+half,row),
        p(xx,b+half,top),p(xx,b-half,top)]});
      if(frontY)faces.push({color:shadeTerrainPixel(color,.87),points:[
        p(a-half,yy,row),p(a+half,yy,row),p(a+half,yy,top),p(a-half,yy,top)]});
    }
  }
  return faces;
}

/** Render only the little parcels of air with geometry. The atlas can reuse
 * these stamps on playback and draw smaller samples during a live orbit. */
export function prepareSkylandArt(sites:readonly Skyland[],projector:Projector,view:BlockView,
  grid:SurfaceGrid,density:number,preview:boolean):SkyStamp[]{
  const stamps:SkyStamp[]=[];
  const add=(id:number,order:number,art?:PlacedArt)=>{if(art)stamps.push({id,order,art});};
  for(const site of sites){
    const {fall,islands}=skylandMesh(site);
    add(site.id,projector.depth(fall.x,fall.y,fall.height-37),
      stamp(fallingWater(fall,projector,grid),density));
    for(const mesh of islands){
      const {island,width,rows,left,top}=mesh;
      add(site.id,projector.depth(island.x,island.y,island.height),
        stamp(islandFaces(mesh,projector,preview?3:1),density));
      if(preview)continue;
      for(let row=2;row<rows-2;row+=SIDE)for(let col=2;col<width-2;col+=SIDE){
        const i=row*width+col,z=mesh.surface[i],u=left+col,v=top+row;
        const hash=terrainHash(u,v,island.seed);
        if(!z||!mesh.cover[i]||mesh.water[i]||hash>(island.terrain==='grove'?.48:.28))continue;
        const x=worldPoint(u+.5),y=worldPoint(v+.5);
        const species=island.terrain==='grove'?(hash<.22?'birch':'pine'):
          island.terrain==='frost'?'snowstone':'scrub';
        const art=blockSceneryArt(blockProp(species,Math.floor(hash*403)),projector.projectSmooth(x,y,z),view,.67);
        add(site.id,projector.depth(island.x,island.y,island.height)+.25+hash*.08,art);
      }
    }
  }
  return stamps.sort((a,b)=>a.order-b.order);
}

export function paintSkylandArt(ctx:CanvasRenderingContext2D,stamps:readonly SkyStamp[]){
  for(const {art} of stamps)paintAtlasBuilding(ctx,art);
}

export function skylandHit(stamps:readonly SkyStamp[],x:number,y:number):number|undefined{
  for(let i=stamps.length-1;i>=0;i--){
    if(opaqueArtAt(stamps[i].art,x,y))return stamps[i].id;
  }
}

const overhead=new WeakMap<IslandMesh,HTMLCanvasElement>();
export function paintOverheadSkylands(ctx:CanvasRenderingContext2D,sites:readonly Skyland[],cell:number){
  for(const site of sites)for(const mesh of skylandMesh(site).islands){
    const {left,top,width,rows,surface}=mesh;
    let image=overhead.get(mesh);
    if(!image){
      image=document.createElement('canvas');image.width=width;image.height=rows;
      const painter=image.getContext('2d');
      if(!painter)continue;
      const data=painter.createImageData(width,rows),pixels=new Uint32Array(data.data.buffer);
      for(let i=0;i<pixels.length;i++){
        if(surface[i])pixels[i]=roofColor(mesh,i);
      }
      painter.putImageData(data,0,0);
      overhead.set(mesh,image);
    }
    ctx.drawImage(image,left*cell/SIDE,top*cell/SIDE,width*cell/SIDE,rows*cell/SIDE);
  }
}

export function overheadSkylandHit(sites:readonly Skyland[],col:number,row:number):number|undefined{
  const x=Math.floor(col*SIDE),y=Math.floor(row*SIDE);
  for(let g=sites.length-1;g>=0;g--){
    for(const mesh of skylandMesh(sites[g]).islands){
      const u=x-mesh.left,v=y-mesh.top;
      if(u>=0&&v>=0&&u<mesh.width&&v<mesh.rows&&mesh.surface[v*mesh.width+u])return sites[g].id;
    }
  }
}
