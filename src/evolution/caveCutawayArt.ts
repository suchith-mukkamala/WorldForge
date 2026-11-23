import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Point} from './motion';
import type {CaveConnection,Caverns} from './realmCaverns';
import {seaPoint} from './shipSave';
import {STACKED_SEA,type stackedProjection} from './stackedProjection';
import {rockColor} from './strataRock';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';
import type {RealmMap} from './underworld';

type Projection=ReturnType<typeof stackedProjection>;
type Grid={width:number;height:number};
type RoofLobe={x:number;y:number;rx:number;ry:number;weight:number};
const roofInks=['#63535f','#514553','#42394e'].map(terrainPixel);
const roofMinerals=['#a48b91','#867ca0','#779695'];

function polygon(ctx:CanvasRenderingContext2D,ink:string,a:Point,b:Point,c:Point,d:Point){
  ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
}

const drop=(p:Point,y:number):Point=>({x:p.x,y:p.y+y});
const between=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

function roofLobes({width,height}:Grid,seed:number):RoofLobe[]{
  const lobes:RoofLobe[]=[];
  for(let edge=0;edge<4;edge++){
    const sideways=edge<2,length=sideways?width:height,depth=sideways?height:width;
    const count=Math.min(5,Math.max(2,Math.round(length/20)));
    for(let i=0;i<count;i++){
      const grain=terrainHash(edge,i,seed+3759);
      const along=(i+.24+grain*.52)*length/count-.5;
      const across=1+terrainHash(edge,i,seed+243)*depth*.06;
      const inset=edge%2?depth-1-across:across;
      const radius=length/count*(.32+grain*.20);
      const spread=depth*(.078+terrainHash(edge,i,seed+58)*.095);
      lobes.push({x:sideways?along:inset,y:sideways?inset:along,
        rx:sideways?radius:spread,ry:sideways?spread:radius,weight:.78+grain*.22});
    }
  }
  return lobes;
}

/** Expose short shelves of bedrock under the upper crust. The cutaway
 * opens below these overhangs, leaving the lower deck clear at every orbit. */
export function paintCaveRoof(ctx:CanvasRenderingContext2D,projection:Projection,
  map:Grid&{seed:number},plan:Pick<Caverns,'clearance'>,worldSize:Grid){
  const {surface,upperCrust,lowerTop}=projection,{width,height,seed}=map;
  const {frontX,frontY}=surface;
  const scaleX=worldSize.width/width,scaleY=worldSize.height/height;
  const upper=(x:number,y:number)=>surface.projectSmooth((x+.5)*scaleX-.5,(y+.5)*scaleY-.5,STACKED_SEA);
  const point=(x:number,y:number,depth:number)=>drop(upper(x,y),depth);
  const maxDepth=Math.min(upperCrust*1.56,95+Math.min(worldSize.width,worldSize.height)*.62);
  const lobes=roofLobes(map,seed);
  const depths=new Uint16Array(width*height),limits=new Float32Array(depths.length);
  const tiles:{x:number;y:number;cell:number;order:number}[]=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let mass=0;
    for(const lobe of lobes){
      const u=(x-lobe.x)/lobe.rx,v=(y-lobe.y)/lobe.ry;
      mass=Math.max(mass,(1-u*u-v*v)*lobe.weight);
    }
    if(mass<.12)continue;
    const cell=y*width+x;
    const noise=terrainNoise(x,y,3.4,seed+918);
    const pocket=mass+noise*.24-plan.clearance[cell]*.002;
    if(pocket<.17)continue;
    const order=upper(x+frontX*.51,y+frontY*.51).y;
    limits[cell]=Math.max(0,Math.min(maxDepth,lowerTop-14-order));
    const depth=Math.floor(Math.min(limits[cell],maxDepth*(.14+Math.sqrt(pocket)*.82))/4)*4;
    if(depth<8)continue;
    depths[cell]=depth;
    tiles.push({x,y,cell,order});
  }
  tiles.sort((a,b)=>a.order-b.order);
  const at=(x:number,y:number)=>x>=0&&x<width&&y>=0&&y<height?depths[y*width+x]:0;
  for(const {x,y,cell} of tiles){
    const depth=depths[cell],grain=terrainHash(x,y,seed+39);
    const tint=(face:number,light=1)=>rockColor(shadeTerrainPixel(roofInks[face],light*(.86+grain*.28)));
    const base=[point(x-.508,y-.508,depth),point(x+.508,y-.508,depth),
      point(x+.508,y+.508,depth),point(x-.508,y+.508,depth)] as const;
    polygon(ctx,tint(2),...base);
    const edge=(a:Point,b:Point,start:number,end:number,face:number)=>{
      if(end<=start)return;
      polygon(ctx,tint(face),drop(a,start),drop(b,start),drop(b,end),drop(a,end));
      if(end-start<=10)return;
      polygon(ctx,tint(2),drop(a,end-3),drop(b,end-3),drop(b,end),drop(a,end));
      if(grain>.76){
        const left=between(a,b,.19),right=between(a,b,.71),seam=start+Math.round((end-start)*.61);
        polygon(ctx,roofMinerals[(cell+face)%roofMinerals.length],
          drop(left,seam),drop(right,seam),drop(right,seam+2),drop(left,seam+2));
      }
    };
    if(frontX){
      const a=upper(x+frontX*.5,y-.51),b=upper(x+frontX*.5,y+.51);
      edge(a,b,at(x+frontX,y),depth,1);
    }
    if(frontY){
      const a=upper(x-.51,y+frontY*.5),b=upper(x+.51,y+frontY*.5);
      edge(a,b,at(x,y+frontY),depth,0);
    }
    const length=Math.min(limits[cell]-depth,10+terrainHash(cell,415,seed)*31);
    if(grain<.944||length<9||depth<maxDepth*.43)continue;
    let start=depth-1;
    for(const [radius,end] of [[.36,depth+length*.38],[.24,depth+length*.74],[.12,depth+length]]){
      if(frontX)edge(upper(x+frontX*radius,y-radius),upper(x+frontX*radius,y+radius),start,end,1);
      if(frontY)edge(upper(x-radius,y+frontY*radius),upper(x+radius,y+frontY*radius),start,end,0);
      start=end;
    }
  }
}

export function paintCaveConnections(ctx:CanvasRenderingContext2D,projection:Projection,map:RealmMap,plan:Caverns,
  worldSize:Grid,connections:readonly CaveConnection[],elevations:readonly number[]){
  const {surface,underneath,lowerTop}=projection,{seed,heights}=map;
  const cave=(x:number,y:number,height:number)=>drop(underneath(x,y,height),lowerTop);
  for(const site of connections){
    const at=seaPoint(worldSize.width,site.surface),end=seaPoint(map.width,site.cell);
    const a=surface.projectSmooth(at.x,at.y,elevations[site.surface]);
    const b=cave(end.x,end.y,heights[site.cell]);
    const opening=cave(end.x,end.y,heights[site.cell]+plan.clearance[site.cell]);
    if(site.kind==='skylight'){
      const light=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
      light.addColorStop(0,'#ffe4a045');light.addColorStop(.38,'#f6ce801d');light.addColorStop(1,'#f6ce800b');
      ctx.fillStyle=light;
      ctx.beginPath();ctx.moveTo(a.x-3,a.y);ctx.lineTo(a.x+3,a.y);
      ctx.lineTo(b.x+13,b.y);ctx.lineTo(b.x-12,b.y);ctx.closePath();ctx.fill();
      continue;
    }
    const wet=site.kind==='seep',width=wet?3.4:2.6;
    const path=[a,between(a,opening,.26),between(a,opening,.62),opening,b];
    for(let n=1;n<path.length-2;n++)path[n].x+=(terrainHash(site.surface,n,seed)-.5)*27;
    for(let n=0;n<path.length-1;n++){
      const from=path[n],to=path[n+1],reach=width*(n===3?.65:1.15);
      polygon(ctx,wet?'#253d5077':'#3b293b77',{x:from.x-reach,y:from.y},{x:from.x+reach,y:from.y},
        {x:to.x+reach,y:to.y},{x:to.x-reach,y:to.y});
      polygon(ctx,wet?'#6bb4bb9c':'#b3543982',{x:from.x-1,y:from.y},{x:from.x+reach*.64,y:from.y},
        {x:to.x+1,y:to.y},{x:to.x-1,y:to.y});
    }
  }
}

export function paintCaveLight(ctx:CanvasRenderingContext2D,projection:Projection,map:RealmMap,
  connections:readonly CaveConnection[]){
  const {underneath,lower,lowerTop}=projection;
  for(const {kind,cell} of connections){
    if(kind==='fault')continue;
    const {x,y}=seaPoint(map.width,cell),z=map.heights[cell];
    const point=(dx:number,dy:number)=>drop(underneath(x+dx,y+dy,z),lowerTop);
    const tile=(ink:string,dx:number,dy:number,w:number,h:number)=>
      polygon(ctx,ink,point(dx,dy),point(dx+w,dy),point(dx+w,dy+h),point(dx,dy+h));
    if(kind==='skylight'){
      tile('#edca8233',-.52,-.49,1.04,.98);
      tile('#ffe2a758',-.36,-.32,.72,.63);
      tile('#ffeebb85',-.14,-.16,.32,.34);
      const center=point(0,0);
      polygon(ctx,'#ffe3a34e',drop({x:center.x-2,y:center.y},-lower.rise*9),
        drop({x:center.x+4,y:center.y},-lower.rise*9),{x:center.x+11,y:center.y},{x:center.x-10,y:center.y});
    }else{
      tile('#a1d8cb9c',-.37,-.08,.74,.15);
      tile('#beebda99',-.08,-.32,.15,.64);
      tile('#87c0c08a',.37,.18,.16,.1);
    }
  }
}
