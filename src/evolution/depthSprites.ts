/** Crisp 2.5D sprites use intentionally unequal footprints. The world grid
 * controls ecology and ownership, not an object's visible width or height. */
import {SPECIES_INFO,type Agent} from './engine';
import {ARCHITECTURE,buildingTier,type Building} from './construction';
import {DEPTH_FOOTPRINT} from './spatialDetails';
import {INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';

type Point={x:number;y:number};
type Painter=CanvasRenderingContext2D;
const draw=(ctx:Painter,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);
};

/** Mortals are tiny one-pixel-wide figures on the raised world map: a tile is
 * twelve pixels wide, and the taller trees and homes preserve a real sense of
 * scale. Full character detail remains in the close-up and portrait views. */
export function paintDepthPerson(ctx:Painter,a:Pick<Agent,'species'|'id'> &
  Partial<Pick<Agent,'innateTrait'|'awakening'>>,
  p:Point,walking=false,showGlow=false):void{
  const width=DEPTH_FOOTPRINT.person;
  draw(ctx,'rgba(11,28,39,.7)',p.x,p.y+1,width,1);
  draw(ctx,SPECIES_INFO[a.species].color,p.x,p.y-2,width,2);
  draw(ctx,'#f1d7a5',p.x,p.y-3,width,1);
  if(walking)draw(ctx,'#202e3a',p.x,p.y,width,1);
  if(showGlow&&a.awakening&&a.innateTrait){
    const gift=INNATE_TRAIT_INFO[a.innateTrait];
    const color=TRAIT_DOMAIN_INFO[gift.domain].color;
    draw(ctx,color,p.x-2,p.y-5,1,1);
    draw(ctx,color,p.x+2,p.y-6,1,1);
  }
}

export function paintDepthTree(ctx:Painter,p:Point,pine:boolean):void{
  const width=DEPTH_FOOTPRINT.tree*3;
  // Stacked crowns and separate canopy shadows produce actual silhouette
  // volume at the tiny 2.5D scale; decorative roots do not block movement.
  draw(ctx,'rgba(9,30,31,.42)',p.x-width/2-1,p.y,width+4,3);
  draw(ctx,'#473b3b',p.x-1,p.y-5,3,7);
  draw(ctx,'#947050',p.x,p.y-5,1,5);
  if(pine){
    draw(ctx,'#152e38',p.x-width/2-1,p.y-5,width+3,4);
    draw(ctx,'#245447',p.x-width/2,p.y-9,width+1,5);
    draw(ctx,'#3b8061',p.x-width/3,p.y-13,width*.7,5);
    draw(ctx,'#67ae79',p.x-1,p.y-17,3,7);
    draw(ctx,'#aed4a0',p.x,p.y-14,1,3);
    draw(ctx,'#2b6653',p.x+width/3,p.y-8,3,3);
  }else{
    draw(ctx,'#1a493f',p.x-width/2-1,p.y-8,width+3,7);
    draw(ctx,'#2d7854',p.x-width/2,p.y-13,width,8);
    draw(ctx,'#509a67',p.x-width/3,p.y-17,width*.75,8);
    draw(ctx,'#81bc7c',p.x-2,p.y-19,7,5);
    draw(ctx,'#b7d891',p.x,p.y-18,2,2);
    draw(ctx,'#66a875',p.x+width/3,p.y-12,4,4);
  }
  draw(ctx,'#375b46',p.x-width/2,p.y-1,3,2);
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
  draw(ctx,'#283449',x-3,y-bodyHeight-3,width+6,2);
  draw(ctx,style.roof,x-2,y-bodyHeight-5,width+4,5);
  draw(ctx,'#f4d5a2',x-1,y-bodyHeight-5,width+2,1);
  draw(ctx,'#4f4551',x+1,y-bodyHeight-1,width-2,1);
  draw(ctx,'#d9c198',x,y-bodyHeight,width,2);
  draw(ctx,'#393444',x+Math.floor(width/2)-1,y-5,3,5);
  draw(ctx,'#998776',x+Math.floor(width/2)-2,y-1,5,1);
  draw(ctx,'#e6d2ac',x+1,y-bodyHeight+2,1,Math.max(3,bodyHeight-5));
  draw(ctx,'#f1da9a',x+2,y-bodyHeight+3,2,2);
  if(tier>=1){
    draw(ctx,'#f1da9a',x+width-4,y-bodyHeight+3,2,2);
    draw(ctx,'#9a785c',x+width-5,y-bodyHeight+5,4,1);
  }
  if(tier>=2){
    draw(ctx,'#e3d2b3',x+1,y-bodyHeight+7,width-2,1);
    draw(ctx,'#c1b9a9',x+3,y-bodyHeight+8,width-6,2);
  }
  if(tier>=3){
    draw(ctx,style.wall,x+2,y-bodyHeight-8,width-4,6);
    draw(ctx,style.roof,x+1,y-bodyHeight-10,width-2,3);
    draw(ctx,'#ffdc9f',x+5,y-bodyHeight-5,3,3);
  }
  if(tier>=1){
    // Gables, masonry seams and tiny hanging lanterns indicate settlement
    // prosperity from the actual building tier, not arbitrary age.
    for(let tile=3;tile<width-3;tile+=4)
      draw(ctx,'rgba(255,238,196,.24)',x+tile,y-bodyHeight-3,2,1);
    draw(ctx,'#d8b782',x+width-2,y-6,1,3);
    draw(ctx,'#ffda8f',x+width-3,y-7,2,2);
  }
  if(tier>=2){
    draw(ctx,'#5c6d73',x-2,y-3,3,2);
    draw(ctx,'#a9b6ac',x+width-2,y-3,4,2);
    draw(ctx,'#f6e3b0',x+Math.floor(width/2)-1,y-bodyHeight-5,3,2);
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
