/** Crisp 2.5D sprites use intentionally unequal footprints. The world grid
 * controls ecology and ownership, not an object's visible width or height. */
import {SPECIES_INFO,type Agent} from './engine';
import {ARCHITECTURE,buildingTier,type Building} from './construction';
import {DEPTH_FOOTPRINT} from './spatialDetails';
import {INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';
import {paintPerson,PERSON_SPRITE_HEIGHT,PERSON_SPRITE_WIDTH,
  spriteKey} from './pixelArt';

type Point={x:number;y:number};
type Painter=CanvasRenderingContext2D;
export type DepthArtDetail=0|1|2;
export const depthArtDetail=(zoom:number):DepthArtDetail=>
  zoom>=4?2:zoom>=2?1:0;
export type PersonSpriteCache=Map<string,HTMLCanvasElement>;
const draw=(ctx:Painter,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);
};

/** People remain tiny at world scale but gain identifiable pixel-art bodies
 * and outfits when the player zooms in. The simulated tile size is unchanged. */
export function paintDepthPerson(ctx:Painter,a:Agent,
  p:Point,walking=false,showGlow=false,detail:DepthArtDetail=0,
  cache?:PersonSpriteCache):void{
  if(detail>0&&cache){
    const key=spriteKey(a)+':'+(walking?'walk':'idle');
    let image=cache.get(key);
    if(!image){
      image=document.createElement('canvas');
      image.width=PERSON_SPRITE_WIDTH;image.height=PERSON_SPRITE_HEIGHT;
      const painter=image.getContext('2d');
      if(painter)paintPerson(painter,a,0,0,'south',walking?1:0,
        walking?'walk':'idle');
      if(cache.size>1200)cache.clear();
      cache.set(key,image);
    }
    const w=detail===2?12:6,h=detail===2?16:8;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,Math.round(p.x-w/2),Math.round(p.y-h+1),w,h);
    if(showGlow&&a.awakening&&a.innateTrait){
      const color=TRAIT_DOMAIN_INFO[INNATE_TRAIT_INFO[a.innateTrait].domain].color;
      draw(ctx,color,p.x-w/2-2,p.y-h,2,2);
      draw(ctx,color,p.x+w/2+1,p.y-h-2,2,2);
    }
    return;
  }
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

export function paintDepthTree(ctx:Painter,p:Point,pine:boolean,variant=0,
  detail:DepthArtDetail=0):void{
  const width=DEPTH_FOOTPRINT.tree*3;
  // Stacked crowns and separate canopy shadows produce actual silhouette
  // volume at the tiny 2.5D scale; decorative roots do not block movement.
  draw(ctx,'rgba(9,30,31,.42)',p.x-width/2-1,p.y,width+4,3);
  draw(ctx,'#473b3b',p.x-1,p.y-5,3,7);
  draw(ctx,'#947050',p.x,p.y-5,1,5);
  if(pine){
    // Dark offset faces make each crown read as a small faceted volume.
    draw(ctx,'#102b32',p.x+width/3,p.y-12,4,11);
    draw(ctx,'#152e38',p.x-width/2-1,p.y-5,width+3,4);
    draw(ctx,'#245447',p.x-width/2,p.y-9,width+1,5);
    draw(ctx,'#3b8061',p.x-width/3,p.y-13,width*.7,5);
    draw(ctx,'#67ae79',p.x-1,p.y-17,3,7);
    draw(ctx,'#aed4a0',p.x,p.y-14,1,3);
    draw(ctx,variant===1?'#88bca0':'#4e9575',p.x-2,p.y-11,2,2);
    if(variant===2){
      draw(ctx,'#c6d1b7',p.x-2,p.y-16,4,1);
      draw(ctx,'#a8c6b1',p.x-3,p.y-12,2,1);
    }
    draw(ctx,'#2b6653',p.x+width/3,p.y-8,3,3);
  }else{
    draw(ctx,'#164436',p.x+width/3,p.y-15,5,13);
    draw(ctx,'#1a493f',p.x-width/2-1,p.y-8,width+3,7);
    draw(ctx,'#2d7854',p.x-width/2,p.y-13,width,8);
    draw(ctx,'#509a67',p.x-width/3,p.y-17,width*.75,8);
    draw(ctx,'#81bc7c',p.x-2,p.y-19,7,5);
    draw(ctx,'#b7d891',p.x,p.y-18,2,2);
    draw(ctx,'#66a875',p.x+width/3,p.y-12,4,4);
    draw(ctx,variant===1?'#e0bf83':'#a9c989',p.x-3,p.y-16,2,2);
    draw(ctx,'#3e845c',p.x-4,p.y-9,3,2);
    if(variant===2){
      draw(ctx,'#a0be83',p.x+2,p.y-19,3,1);
      draw(ctx,'#d0d49f',p.x+3,p.y-17,1,2);
    }
  }
  if(detail>=1){
    // Close-up faceted highlights make the original pixel silhouette appear
    // three-dimensional without changing terrain perspective or palette.
    draw(ctx,pine?'#194439':'#285a45',p.x+width/3,p.y-10,3,5);
    draw(ctx,pine?'#a5cda6':'#bcd89f',p.x-width/3,p.y-14,3,2);
    draw(ctx,'#815e46',p.x-1,p.y-4,1,4);
    if(detail===2){
      draw(ctx,pine?'#4f9776':'#72ab75',p.x-width/3-1,p.y-11,3,3);
      draw(ctx,'#d4dda5',p.x-2,p.y-17,2,1);
      draw(ctx,'#52785a',p.x+2,p.y-4,3,2);
      draw(ctx,'#322e34',p.x+1,p.y-2,2,2);
    }
  }
  draw(ctx,'#375b46',p.x-width/2,p.y-1,3,2);
}

/** Four-unit structures become taller and more durable with their real tier.
 * Construction and ruins remain visibly distinct from inhabited buildings. */
export function paintDepthBuilding(ctx:Painter,b:Building,p:Point,
  detail:DepthArtDetail=0):void{
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
    draw(ctx,style.roof,x+2,y-9,width-4,4);
    draw(ctx,'#385642',x+1,y-5,width-2,1);
    draw(ctx,'#e4cb82',x+3,y-7,2,1);
    if(detail>=1){
      draw(ctx,'#574b3c',x+width-4,y-6,2,4);
      draw(ctx,'#e6d7a7',x+2,y-10,width-4,1);
      if(detail===2)for(let row=0;row<3;row++)
        draw(ctx,'#d8e3a0',x+4+row*3,y-5+row,1,2);
    }
    return;
  }
  if(b.type==='well'){
    draw(ctx,'#a0b3b5',x+3,y-5,width-6,5);
    draw(ctx,'#346789',x+4,y-4,width-8,3);
    draw(ctx,style.roof,x+2,y-11,width-4,3);
    draw(ctx,'#dbe4dd',x+4,y-5,width-8,1);
    draw(ctx,'#69798c',x+2,y-8,2,7);
    if(detail>=1){
      draw(ctx,'#ebdba9',x+width-4,y-7,2,5);
      draw(ctx,'#77999b',x+5,y-3,width-10,1);
    }
    return;
  }
  const bodyHeight=8+tier*2;
  const wall=tier>=2?'#a7a3a0':style.wall;
  // Raised roof plane, side wall and eaves: the environment reads as solid
  // low-poly geometry while the mortals above remain flat pixel sprites.
  const side=3+Math.min(2,tier);
  draw(ctx,'rgba(12,24,35,.4)',x+width,y-bodyHeight+side,side,bodyHeight-side);
  draw(ctx,'#465465',x+width-1,y-bodyHeight+2,side,bodyHeight-3);
  draw(ctx,wall,x,y-bodyHeight,width,bodyHeight);
  draw(ctx,'rgba(18,37,45,.32)',x+width-3,y-bodyHeight+2,3,bodyHeight-3);
  draw(ctx,'#342d3d',x+side,y-bodyHeight-9,width-2,3);
  draw(ctx,style.roof,x+side-2,y-bodyHeight-11,width-2,3);
  draw(ctx,'#f5d8a9',x+side-1,y-bodyHeight-11,width-4,1);
  draw(ctx,'#253443',x+width,y-bodyHeight-7,side,4);
  draw(ctx,'#283449',x-3,y-bodyHeight-3,width+6,2);
  draw(ctx,'#332f42',x-3,y-bodyHeight-6,width+6,2);
  draw(ctx,style.roof,x-2,y-bodyHeight-5,width+4,5);
  draw(ctx,'#f4d5a2',x-1,y-bodyHeight-5,width+2,1);
  draw(ctx,'#4f4551',x+1,y-bodyHeight-1,width-2,1);
  draw(ctx,'#d9c198',x,y-bodyHeight,width,2);
  draw(ctx,'#393444',x+Math.floor(width/2)-1,y-5,3,5);
  draw(ctx,'#998776',x+Math.floor(width/2)-2,y-1,5,1);
  draw(ctx,'#b7a17a',x+Math.floor(width/2)-4,y,9,1);
  draw(ctx,'#4e614e',x-2,y-1,2,1);
  draw(ctx,'#687e62',x+width,y-1,2,1);
  draw(ctx,'#e6d2ac',x+1,y-bodyHeight+2,1,Math.max(3,bodyHeight-5));
  draw(ctx,'#f1da9a',x+2,y-bodyHeight+3,2,2);
  if(tier>=1){
    draw(ctx,'#f1da9a',x+width-4,y-bodyHeight+3,2,2);
    draw(ctx,'#9a785c',x+width-5,y-bodyHeight+5,4,1);
  }
  if(tier>=2){
    // Raised gables and masonry seams make mature towns visibly different.
    draw(ctx,'#c3c3b4',x,y-bodyHeight+5,width,1);
    for(let brick=2;brick<width-2;brick+=5)
      draw(ctx,'#7c8987',x+brick,y-bodyHeight+6,1,2);
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
    draw(ctx,'#ccb28d',x+width-6,y-6,4,2);
    draw(ctx,'#c48a6b',x+width-5,y-5,2,2);
    draw(ctx,'#66575b',x+width-4,y-bodyHeight-9,3,8);
    draw(ctx,'#d6b895',x+width-4,y-bodyHeight-10,3,2);
  }
  if(b.type==='market'){
    for(let strip=1;strip<width-1;strip+=4){
      draw(ctx,style.roof,x+strip,y-8,2,3);
      draw(ctx,'#e9ceb0',x+strip+2,y-8,2,3);
    }
    draw(ctx,'#e7c793',x+1,y-5,width-2,2);
    draw(ctx,style.roof,x+1,y-8,4,3);
  }
  if(detail>=1){
    draw(ctx,'rgba(18,25,37,.36)',x+width,y-bodyHeight+side,
      side,bodyHeight-side);
    draw(ctx,style.trim,x+2,y-bodyHeight+4,1,bodyHeight-6);
    draw(ctx,'#ffecb7',x+width-6,y-bodyHeight+4,2,2);
    draw(ctx,'#544c55',x+width-5,y-bodyHeight+6,1,2);
    if(detail===2){
      for(let roofX=3;roofX<width-3;roofX+=5)
        draw(ctx,style.trim,x+roofX,y-bodyHeight-6,2,1);
      draw(ctx,'#e8d8b4',x+width-2,y-bodyHeight+3,1,bodyHeight-4);
      draw(ctx,'#6e5c52',x+width/2+2,y-4,1,2);
      draw(ctx,style.trim,x+Math.floor(width/2)-2,y-6,5,1);
    }
  }
}
