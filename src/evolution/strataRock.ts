import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Point} from './motion';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';

type Grid={width:number;height:number};
type Project=(x:number,y:number)=>Point;
type StoneFace=(points:readonly Point[],ink:number)=>void;
type RockColumn={a:Point;b:Point;outward:Point;depth:number;grain:number;seam:number;foot:[number,number]};
type RockEdge={side:number;columns:RockColumn[]};
const stone={
  surface:[
    ['#9b8165','#7e6557','#5d4d54','#383643'],
    ['#aa896c','#836356','#69535a','#41414d'],
  ],
  underworld:[
    ['#6d5d71','#52465e','#42394f','#302e45'],
    ['#807086','#62546f','#493e59','#373349'],
  ],
} as const;
const ore={
  surface:['#cab58d','#a79275','#8e8789'],
  underworld:['#9c8fa3','#7dadac','#ad8eaf'],
} as const;
export const rockColor=(ink:number)=>'rgb('+(ink&255)+','+(ink>>>8&255)+','+(ink>>>16&255)+')';

function slide(a:Point,b:Point,u:number,drop=0):Point{
  return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u+drop};
}

/** World-coordinate noise follows the same rock outcrop when the camera orbits. */
export function exposedRock({width,height}:Grid,frontX:number,frontY:number,maxDepth:number,
  seed:number,kind:keyof typeof stone,project:Project):RockEdge[]{
  const x=frontX>0?width-.5:-.5,y=frontY>0?height-.5:-.5;
  const visible:{length:number;x:number;y:number;dx:number;dy:number;nx:number;ny:number;side:number}[]=[];
  if(frontX)visible.push({length:height,x,y:-.5,dx:0,dy:1,nx:frontX,ny:0,side:frontX>0?1:3});
  if(frontY)visible.push({length:width,x:-.5,y,dx:1,dy:0,nx:0,ny:frontY,side:frontY>0?2:0});
  return visible.map(edge=>{
    const stride=kind==='surface'?2.25:1.45;
    const count=Math.max(1,Math.round(edge.length/stride));
    const step=edge.length/count;
    const columns:RockColumn[]=[];
    for(let i=0;i<count;i++){
      const start=i*step,end=(i+1)*step;
      const wx=edge.x+edge.dx*(start+end)/2,wy=edge.y+edge.dy*(start+end)/2;
      const grain=terrainHash(Math.round(wx*2),Math.round(wy*2),seed+2195);
      const terrace=terrainNoise(wx,wy,kind==='surface'?15:8,seed+483);
      const fault=terrainNoise(wx,wy,kind==='surface'?43:23,seed+1151);
      const ratio=Math.min(1,Math.max(.21,.53+fault*.44+terrace*.28+(grain-.5)*.18));
      const depth=Math.min(maxDepth,Math.max(4,Math.round(maxDepth*ratio/4)*4));
      const a=project(edge.x+edge.dx*start,edge.y+edge.dy*start);
      const b=project(edge.x+edge.dx*end,edge.y+edge.dy*end);
      const lip=project(wx+edge.nx*.62,wy+edge.ny*.62),center=project(wx,wy);
      columns.push({a,b,depth,grain,seam:terrace*.08+(grain-.5)*.09,
        foot:grain>.68?[.16+(1-grain)*.38,.92]:[0,1],
        outward:{x:lip.x-center.x,y:lip.y-center.y}});
    }
    return {side:edge.side,columns};
  });
}

export function paintCutRock(edges:RockEdge[],kind:keyof typeof stone,draw:StoneFace){
  for(const {side,columns} of edges){
    const palette=stone[kind][side%2].map(terrainPixel),minerals=ore[kind].map(terrainPixel);
    for(const {a,b,depth,grain,seam,outward,foot} of columns){
      const course=[-1,depth*(.27+seam),depth*(.54+seam*.5),depth*.78,depth];
      const light=.88+grain*.24;
      const face=(u:number,v:number,top:number,bottom:number,ink:number)=>{
        draw([slide(a,b,u,top),slide(a,b,v,top),slide(a,b,v,bottom),slide(a,b,u,bottom)],ink);
      };
      // An opaque backing seals the bands when the projected edges fall on
      // opposite sides of a pixel center.
      face(0,1,-1,course[3],shadeTerrainPixel(palette[3],light));
      face(foot[0],foot[1],course[3]-.7,depth,shadeTerrainPixel(palette[3],light));
      for(let n=0;n<3;n++)face(0,1,course[n],course[n+1],shadeTerrainPixel(palette[n],light));
      if(grain>.28){
        const trace=course[1]+(course[2]-course[1])*(.17+grain*.52);
        face(.06,.6+grain*.3,trace,trace+Math.min(2,depth*.09),
          shadeTerrainPixel(minerals[Math.min(2,Math.floor(grain*3))],.67+grain*.27));
      }
      if(grain<.70||depth<16)continue;
      const left=slide(a,b,.12,course[2]),right=slide(a,b,.9,course[2]);
      const rimLeft={x:left.x+outward.x,y:left.y+outward.y};
      const rimRight={x:right.x+outward.x,y:right.y+outward.y};
      const lip=Math.min(7,depth*.16);
      draw([left,right,rimRight,rimLeft],shadeTerrainPixel(palette[1],1.06));
      draw([rimLeft,rimRight,{x:rimRight.x,y:rimRight.y+lip},{x:rimLeft.x,y:rimLeft.y+lip}],
        shadeTerrainPixel(palette[2],light));
    }
  }
}

export type HangingVine={root:Point;tip:number;phase:number;width:number;color:number;curve:number};

/** The lower canvas starts before any cavern scenery. Keep each tip well
 * above it, including when a shallow angle exposes a long stretch of roof. */
export function hangingVines(edges:RockEdge[],underworldTop:number,seed:number):HangingVine[]{
  const vines:HangingVine[]=[];
  for(const {side,columns} of edges){
    const span=Math.max(4,Math.ceil(columns.length/8));
    for(let first=1;first<columns.length-1;first+=span){
      const patch=terrainHash(first,side,seed+6649);
      if(patch<.12&&first>1)continue;
      const spread=Math.min(span,columns.length-1-first);
      const i=first+Math.min(spread-1,Math.floor(spread*terrainHash(first,side,seed+721)));
      const {a,b,depth,grain,foot}=columns[i];
      const count=patch>.89?4:patch>.66?3:patch>.27?2:1,color=grain>.69?1:grain>.16?0:2;
      for(let n=0;n<count;n++){
        const phase=terrainHash(i*4+n,side,seed+7043);
        const u=foot[0]+(foot[1]-foot[0])*((n+.55)/(count+.15));
        const root=slide(a,b,u,depth-2);
        const gap=underworldTop-root.y;
        const tip=root.y+Math.min(96,Math.max(0,gap-13),gap*(.28+phase*.44));
        if(tip-root.y<13)continue;
        vines.push({root,tip,phase,width:1.7+phase*1.44,color,
          curve:(n%2?1:-1)*(4.8+phase*9)});
      }
    }
  }
  return vines;
}

const canopy=[
  ['#26483a','#629568','#8ad996','#d1ffb9','#7bd39d32'],
  ['#214652','#528e7d','#7ee0c1','#ccffdc','#69d7c931'],
  ['#454b34','#77834e','#cbdf88','#f1ffc3','#d3dd7f31'],
] as const;

export function paintHangingVines(ctx:CanvasRenderingContext2D,vines:readonly HangingVine[]){
  const pixel=2;
  const rect=(ink:string,x:number,y:number,w:number,h:number)=>{
    ctx.fillStyle=ink;ctx.fillRect(Math.round(x),Math.round(y),w,h);
  };
  for(const {root,tip,width,phase,color,curve} of vines){
    const [shade,stem,leaf,light,glow]=canopy[color],length=tip-root.y;
    const xAt=(u:number)=>Math.round((root.x+curve*u+Math.sin(u*7.8+phase*4)*u*3)/pixel)*pixel;
    rect(shade,root.x-2,root.y-4,5,5);
    rect(stem,root.x-1,root.y-2,3,3);
    // Luminous buds are composed of small, square strokes and a single
    // larger square of light, with stepped stems between them.
    for(let y=root.y;y<tip;y+=pixel){
      const u=(y-root.y)/length,x=xAt(u),next=xAt(Math.min(1,u+pixel/length));
      const w=width*(1-u*.58),h=Math.min(pixel,tip-y);
      rect(shade,x-1,y,w+2,h);
      rect(stem,x,y,w,h);
      if(next!==x)rect(stem,Math.min(x,next),y+h-.8,Math.abs(next-x)+w,.8);
    }
    const spacing=9+phase*6;
    let n=0;
    for(let y=root.y+5+phase*4;y<tip-1;y+=spacing){
      const u=(y-root.y)/length,x=xAt(u),dir=(n+Math.floor(phase*3))%2===0?-1:1;
      n++;
      const long=u<.70&&n%2===1;
      if(long){
        for(let j=1;j<=3;j++){
          const tx=x+dir*j*2,ty=y+j*2;
          if(ty+2<=tip)rect(stem,tx,ty,2,2);
        }
      }
      const lx=x+dir*(long?6:3),ly=Math.min(tip-2,y+(long?5:1));
      rect(glow,lx-3,ly-3,7,Math.min(7,tip-ly+3));
      rect(leaf,lx-1,ly-1,4,3);
      rect(light,lx,ly-1,2,2);
    }
    rect(light,xAt(1),tip-2,2,2);
  }
}
