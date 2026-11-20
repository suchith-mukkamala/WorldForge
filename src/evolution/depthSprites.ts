import {SPECIES_INFO,type Agent} from './engine';
import {DEPTH_FOOTPRINT} from './spatialDetails';
import {INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';
import {paintPerson,PERSON_SPRITE_HEIGHT,PERSON_SPRITE_WIDTH,
  spriteKey} from './pixelArt';
import type {Facing} from './motion';
import type {BuildingType} from './construction';

type Point={x:number;y:number};
type Painter=CanvasRenderingContext2D;
export type DepthArtDetail=0|1|2;
export const depthArtDetail=(zoom:number):DepthArtDetail=>
  zoom>=4?2:zoom>=2?1:0;
/** The landscape stays on its cheap low-resolution layer. Only the final
 * compositing canvas gains backing pixels near the ground, so the 16×22
 * character artwork is no longer collapsed into a 2×3 bitmap before zoom.
 * Keep the backing surface under ~64 MB on very large worlds. */
export function depthRenderDensity(zoom:number,size:{width:number;height:number}):number{
  const requested=zoom>=6?6:zoom>=4?4:zoom>=2?2:1;
  const safe=Math.floor(Math.sqrt(16_000_000/
    Math.max(1,size.width*size.height)));
  return Math.max(1,Math.min(requested,safe));
}
/** The terrain must remain as sharp as the foreground when zooming in.
 * A smaller memory budget than the moving layer avoids doubling the GPU
 * cost of the entire continent, and the cache only rebuilds on scene edits. */
export function depthSceneryDensity(zoom:number,size:{width:number;height:number}):number{
  const requested=zoom>=4?4:zoom>=2?2:1;
  const safe=Math.floor(Math.sqrt(6_000_000/
    Math.max(1,size.width*size.height)));
  return Math.max(1,Math.min(requested,safe));
}
/** Shrink houses much more than civic landmarks, without changing the site
 * position, save format, or the world's actual construction rules. */
export const buildingVisualScale=(type:BuildingType):number=>
  type==='house'||type==='shelter' ? .59 :
  type==='well' ? .68 : type==='farm' ? .72 :
  type==='communal' ? .82 : .76;
export type PersonSpriteCache=Map<string,HTMLCanvasElement>;
// Characters have a fixed footprint in world coordinates. Zoom magnifies the
// entire canvas uniformly; crossing detail thresholds must not inflate people.
export const DEPTH_PERSON_SIZE={width:2,height:3} as const;
const draw=(ctx:Painter,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);
};

/** People remain tiny at world scale but gain identifiable pixel-art bodies
 * and outfits when the player zooms in. The simulated tile size is unchanged. */
export function paintDepthPerson(ctx:Painter,a:Agent,
  p:Point,walking=false,showGlow=false,
  cache?:PersonSpriteCache,facing:Facing='south',stride:0|1|2|3=0):void{
  if(cache){
    const key=[spriteKey(a),facing,walking?stride:'idle'].join(':');
    let image=cache.get(key);
    if(!image){
      image=document.createElement('canvas');
      image.width=PERSON_SPRITE_WIDTH;image.height=PERSON_SPRITE_HEIGHT;
      const painter=image.getContext('2d');
      if(painter)paintPerson(painter,a,0,0,facing,walking?stride:0,
        walking?'walk':'idle');
      if(cache.size>2600)cache.clear();
      cache.set(key,image);
    }
    const {width:w,height:h}=DEPTH_PERSON_SIZE;
    ctx.imageSmoothingEnabled=false;
    // The high-density foreground supplies sub-pixel movement in world
    // coordinates. Rounding here used to make each footstep visibly snap
    // across a full terrain pixel, even during smooth motion interpolation.
    ctx.drawImage(image,p.x-w/2,p.y-h+1,w,h);
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
