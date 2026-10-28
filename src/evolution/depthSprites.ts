/** Crisp 2.5D sprites use intentionally unequal footprints. The world grid
 * controls ecology and ownership, not an object's visible width or height. */
import {SPECIES_INFO,type Agent} from './engine';
import {ARCHITECTURE,buildingTier,type Building} from './construction';
import {DEPTH_FOOTPRINT} from './spatialDetails';

type Point={x:number;y:number};
type Painter=CanvasRenderingContext2D;
const draw=(ctx:Painter,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);
};

/** A person is ~one unit; even a young tree occupies roughly twice as much
 * visual space, without being a harvested resource or blocking the next tile. */
export function paintDepthPerson(ctx:Painter,a:Pick<Agent,'species'|'id'>,
  p:Point,walking=false):void{
  const width=DEPTH_FOOTPRINT.person*3;
  draw(ctx,'#182737',p.x-1,p.y-1,width,2);
  draw(ctx,SPECIES_INFO[a.species].color,p.x-1,p.y-5,width,4);
  draw(ctx,'#f1d7a5',p.x,p.y-7,2,2);
  draw(ctx,'#152a37',p.x-1,p.y-1,1,walking?2:1);
  draw(ctx,'#152a37',p.x+1,p.y-1,1,walking?1:2);
}

export function paintDepthTree(ctx:Painter,p:Point,pine:boolean):void{
  const width=DEPTH_FOOTPRINT.tree*3;
  draw(ctx,'rgba(12,31,35,.45)',p.x-width/2,p.y,width+1,2);
  draw(ctx,'#624c3b',p.x-1,p.y-7,2,8);
  if(pine){
    draw(ctx,'#28574b',p.x-width/2,p.y-12,width,6);
    draw(ctx,'#3a8064',p.x-2,p.y-15,4,6);
  }else{
    draw(ctx,'#2a644c',p.x-width/2,p.y-13,width,7);
    draw(ctx,'#529b67',p.x-2,p.y-15,5,5);
  }
  draw(ctx,'#a1c5a2',p.x,p.y-14,2,2);
}

/** Four-unit structures become taller and more durable with their real tier.
 * Construction and ruins remain visibly distinct from inhabited buildings. */
export function paintDepthBuilding(ctx:Painter,b:Building,p:Point):void{
  const style=ARCHITECTURE[b.culture],tier=buildingTier(b);
  const baseWidth=DEPTH_FOOTPRINT.building*3;
  const width=baseWidth+tier*2;
  const x=Math.round(p.x-width/2),y=Math.round(p.y);
  draw(ctx,'rgba(13,28,40,.6)',x-2,y-1,width+4,3);
  if(b.stage==='ruin'||b.stage==='abandoned'){
    draw(ctx,'#414754',x,y-5,width,5);
    draw(ctx,style.wall,x+2,y-8,3,7);
    draw(ctx,'#a2a4a2',x+width-4,y-6,3,5);return;
  }
  if(b.stage!=='complete'){
    draw(ctx,'#8b806d',x,y-3,width,3);
    if(b.stage!=='foundation'){
      draw(ctx,'#bd9568',x+1,y-10,2,8);
      draw(ctx,'#bd9568',x+width-3,y-10,2,8);
      draw(ctx,'#d8c79b',x,y-11,width,2);
    }
    if(b.stage==='finishing')draw(ctx,style.roof,x-1,y-14,width+2,3);
    return;
  }
  if(b.type==='farm'){
    draw(ctx,'#6a8f5b',x,y-4,width,4);
    for(let row=0;row<3;row++){
      draw(ctx,'#b69d63',x+1,y-4+row,width-2,1);
      draw(ctx,'#b5d58d',x+2+row*2,y-5+row,2,2);
    }
    draw(ctx,style.roof,x+2,y-9,width-4,4);return;
  }
  if(b.type==='well'){
    draw(ctx,'#a0b3b5',x+3,y-5,width-6,5);
    draw(ctx,'#346789',x+4,y-4,width-8,3);
    draw(ctx,style.roof,x+2,y-11,width-4,3);return;
  }
  const bodyHeight=8+tier*2;
  const wall=tier>=2?'#a7a3a0':style.wall;
  draw(ctx,wall,x,y-bodyHeight,width,bodyHeight);
  draw(ctx,style.roof,x-2,y-bodyHeight-4,width+4,5);
  draw(ctx,'#d9c198',x,y-bodyHeight,width,2);
  draw(ctx,'#393444',x+Math.floor(width/2)-1,y-5,3,5);
  draw(ctx,'#f1da9a',x+2,y-bodyHeight+3,2,2);
  if(tier>=1)draw(ctx,'#f1da9a',x+width-4,y-bodyHeight+3,2,2);
  if(tier>=2){
    draw(ctx,'#e3d2b3',x+1,y-bodyHeight+7,width-2,1);
    draw(ctx,'#c1b9a9',x+3,y-bodyHeight+8,width-6,2);
  }
  if(tier>=3){
    draw(ctx,style.wall,x+2,y-bodyHeight-8,width-4,6);
    draw(ctx,style.roof,x+1,y-bodyHeight-10,width-2,3);
    draw(ctx,'#ffdc9f',x+5,y-bodyHeight-5,3,3);
  }
  if(b.type==='workshop'){
    draw(ctx,'#66575b',x+width-4,y-bodyHeight-9,3,8);
    draw(ctx,'#d6b895',x+width-4,y-bodyHeight-10,3,2);
  }
  if(b.type==='market'){
    draw(ctx,'#e7c793',x+1,y-5,width-2,2);
    draw(ctx,style.roof,x+1,y-8,4,3);
  }
}
