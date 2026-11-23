import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Point} from './motion';
import type {CaveConnection,Caverns} from './realmCaverns';
import {realmScenery} from './realmScenery';
import {seaPoint} from './shipSave';
import {STACKED_SEA,type stackedProjection} from './stackedProjection';
import {RealmBiome,type RealmMap} from './underworld';

type Projection=ReturnType<typeof stackedProjection>;
type Face={cell:number;x:number;y:number;dx:number;dy:number;nx:number;ny:number};
const rock=['#5e5052','#51434e','#494055','#3d3648','#343042'];
const coldRock=['#574951','#4a404d','#414054','#383347','#302d40'];
const stone=['#776169','#665267','#52465c','#3c354e'];
const minerals=['#8a65727a','#88789e8c','#6a939088'];

function polygon(ctx:CanvasRenderingContext2D,ink:string,a:Point,b:Point,c:Point,d:Point){
  ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
}

const drop=(p:Point,y:number):Point=>({x:p.x,y:p.y+y});
const between=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** Place the rear cut where it shows a good section through the actual
 * vaults. For a cardinal view, there is only one visible cut face. */
function section({lower}:Projection,{width,height}:RealmMap,plan:Caverns):Face[]{
  const {frontX,frontY}=lower;
  const slices=[.18,.27,.36,.45];
  const candidates=(length:number,front:number)=>front?slices.map(r=>Math.round((front<0?1-r:r)*(length-1))):[0];
  let backX=0,backY=0,best=-Infinity;
  for(const x of candidates(width,frontX))for(const y of candidates(height,frontY)){
    let east=0,south=0;
    if(frontY)for(let i=0;i<width;i++){
      if(frontX&&(i-x)*frontX<0)continue;
      const gap=plan.clearance[y*width+i];east+=Math.max(0,gap-34)**1.3;
    }
    if(frontX)for(let i=0;i<height;i++){
      if(frontY&&(i-y)*frontY<0)continue;
      const gap=plan.clearance[i*width+x];south+=Math.max(0,gap-34)**1.3;
    }
    const score=(east/width+south/height)*.7+Math.min(east/width,south/height)*.3;
    if(score>best){best=score;backX=x;backY=y;}
  }
  const faces:Face[]=[];
  if(frontY)for(let x=0;x<width;x++){
    if(frontX&&(x-backX)*frontX<0)continue;
    faces.push({cell:backY*width+x,x,y:backY,dx:1,dy:0,nx:0,ny:frontY});
  }
  if(frontX)for(let y=0;y<height;y++){
    if(frontY&&(y-backY)*frontY<0)continue;
    faces.push({cell:y*width+backX,x:backX,y,dx:0,dy:1,nx:frontX,ny:0});
  }
  const depth=({x,y}:Face)=>x*lower.east.y+y*lower.south.y;
  return faces.sort((a,b)=>depth(a)-depth(b));
}

export function paintCaveCutaway(ctx:CanvasRenderingContext2D,projection:Projection,map:RealmMap,plan:Caverns,
  worldSize:{width:number;height:number},connections:readonly CaveConnection[],elevations:readonly number[]){
  const {surface,underneath,lowerTop,lower}=projection;
  const scaleX=worldSize.width/map.width,scaleY=worldSize.height/map.height;
  const upper=(x:number,y:number)=>surface.projectSmooth((x+.5)*scaleX-.5,(y+.5)*scaleY-.5,STACKED_SEA);
  const cave=(x:number,y:number,height:number)=>drop(underneath(x,y,height),lowerTop);
  const faces=section(projection,map,plan),passages=new Set(plan.galleries.flat());
  const formations=realmScenery(map).formations;
  const supports:Face[]=[];
  const {seed,heights,biomes}=map;
  const pillarBudget=map.width<50?4:6;
  for(const face of faces){
    const {cell,x,y,dx,dy,nx,ny}=face;
    const grain=terrainHash(x,y,seed+373),vein=terrainNoise(x,y,9.5,seed+925);
    const headroom=plan.clearance[cell],top=heights[cell]+headroom;
    const x1=x-dx*.508,y1=y-dy*.508,x2=x+dx*.508,y2=y+dy*.508;
    const a=upper(x1,y1),b=upper(x2,y2),c=cave(x2,y2,top),d=cave(x1,y1,top);
    const wall=(d.y-a.y),rim=Math.max(0,wall-21-lower.rise*2);
    const course=[0,wall*.19+vein*35,wall*.40+vein*39,wall*.67+vein*54,rim,wall];
    const back=dx?rock:coldRock;
    polygon(ctx,rock[4],a,b,c,d);
    for(let i=0;i<course.length-1;i++){
      const low=course[i],high=course[i+1]+1;
      polygon(ctx,back[i],drop(a,low),drop(b,low),drop(b,high),drop(a,high));
    }
    const panel=(ink:string,from:number,to:number,at:number,height:number)=>{
      const left=drop(between(a,b,from),at),right=drop(between(a,b,to),at);
      polygon(ctx,ink,left,right,drop(right,height),drop(left,height));
    };
    for(let ledge=1;ledge<9;ledge++){
      const roll=terrainHash(cell,ledge+873,seed);
      if(roll<.21)continue;
      const at=(ledge+vein*.45+(roll-.5)*.6)*rim/9;
      const from=roll>.6?0:roll*.56,to=roll>.6?.86:.7+roll*.3;
      panel(roll>.52?'#1c203745':'#9b84922c',from,to,at,4+Math.round(roll*17));
      if(roll>.72)panel('#b3a3a629',from+.07,to-.12,at-2,2);
      if(roll>.82){
        const ink=minerals[biomes[cell]===RealmBiome.glowroot?2:biomes[cell]===RealmBiome.crystal?1:0];
        panel(ink,from+.22,to-.08,at+5,3+Math.round(grain*4));
      }
    }
    const lip=1.8+Math.round((grain+vein*.6)*1.8)*.55;
    const lipA=cave(x1+nx*lip,y1+ny*lip,top+3),lipB=cave(x2+nx*lip,y2+ny*lip,top+3);
    polygon(ctx,grain>.55?'#343147':'#2d293f',d,c,lipB,lipA);
    polygon(ctx,grain>.54?'#66566f':'#50465e',drop(lipA,-11),drop(lipB,-11),lipB,lipA);
    if(grain>.33){
      const tooth=Math.min(headroom*.38,2+Math.round(grain*9))*lower.rise;
      const from=between(lipA,lipB,.15),to=between(lipA,lipB,.44+grain*.35);
      const step=between(from,to,.44),base=drop(step,tooth);
      polygon(ctx,'#353047',from,to,drop(to,tooth*.39),base);
      polygon(ctx,grain>.64?'#695570':'#4f4259',from,step,base,drop(from,tooth*.54));
    }
    const dry=biomes[cell]!==RealmBiome.sea&&biomes[cell]!==RealmBiome.lava;
    if(dry&&headroom>=27&&grain>.3&&supports.length<pillarBudget&&!map.roads.has(cell)&&
      !map.houses.has(cell)&&!formations.has(cell)&&!map.towns.some(town=>town.index===cell)&&
      !map.links.some(link=>link.cell===cell)&&!passages.has(cell)&&
      supports.every(support=>Math.hypot(support.x-x,support.y-y)>5))supports.push(face);
  }
  for(const {cell,x,y,dx,dy,nx,ny} of supports){
    const floor=heights[cell]-1,ceiling=heights[cell]+plan.clearance[cell]+1;
    const column=(height:number,width:number)=>[
      cave(x-dx*width,y-dy*width,height),cave(x+dx*width,y+dy*width,height),
      cave(x+dx*width+nx*.63,y+dy*width+ny*.63,height),
    ] as const;
    const levels=[column(ceiling,.48),column(ceiling-(ceiling-floor)*.34,.23),
      column(floor+(ceiling-floor)*.25,.32),column(floor,.51)];
    for(let n=0;n<levels.length-1;n++){
      const [a,b,c]=levels[n],[d,e,f]=levels[n+1];
      polygon(ctx,stone[n+1],a,b,e,d);polygon(ctx,rock[n+1],b,c,f,e);
    }
  }
  for(const site of connections){
    const at=seaPoint(worldSize.width,site.surface),end=seaPoint(map.width,site.cell);
    const a=surface.projectSmooth(at.x,at.y,elevations[site.surface]);
    const b=cave(end.x,end.y,heights[site.cell]);
    const opening=cave(end.x,end.y,heights[site.cell]+plan.clearance[site.cell]);
    if(site.kind==='skylight'){
      polygon(ctx,'#f3bf8045',{x:a.x-5,y:a.y},{x:a.x+5,y:a.y},{x:b.x+23,y:b.y},{x:b.x-21,y:b.y});
      polygon(ctx,'#ffe4a04f',{x:a.x-2,y:a.y},{x:a.x+2,y:a.y},{x:b.x+8,y:b.y},{x:b.x-5,y:b.y});
      continue;
    }
    const wet=site.kind==='seep',width=wet?6:5;
    const path=[a,between(a,opening,.26),between(a,opening,.62),opening,b];
    for(let n=1;n<path.length-2;n++)path[n].x+=(terrainHash(site.surface,n,seed)-.5)*27;
    for(let n=0;n<path.length-1;n++){
      const from=path[n],to=path[n+1],reach=width*(n===3?.65:1.15);
      polygon(ctx,wet?'#253d50cc':'#3b293bcc',{x:from.x-reach,y:from.y},{x:from.x+reach,y:from.y},
        {x:to.x+reach,y:to.y},{x:to.x-reach,y:to.y});
      polygon(ctx,wet?'#6bb4bbbd':'#b35439a3',{x:from.x-1,y:from.y},{x:from.x+reach*.64,y:from.y},
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
