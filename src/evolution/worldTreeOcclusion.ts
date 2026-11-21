import {atlasBuildingBounds,type PlacedArt} from './atlasBuildingArt';

type DepthArt={sprite:PlacedArt;order:number};

function rasterOrigin({art,x,y,scale}:PlacedArt){
  const {left,top}=art.bounds;
  return {x:Math.round(x+left*scale)-left*scale,y:Math.round(y+top*scale)-top*scale};
}

function depthReader(tree:DepthArt){
  const {sprite}=tree,{art,scale}=sprite;
  const origin=rasterOrigin(sprite),{width,height}=art.image;
  return (x:number,y:number,depth:number)=>{
    const col=Math.floor((x-origin.x)/scale),row=Math.floor((y-origin.y)/scale);
    return col>=0&&row>=0&&col<width&&row<height&&
      tree.order+(art.depth?.[row*width+col]??-Infinity)*scale>depth+.1;
  };
}

export const treeCovers=(tree:DepthArt,x:number,y:number,depth:number)=>depthReader(tree)(x,y,depth);

/** Ground anchors are enough for small sprites. Against a tree this wide,
 * compare the actual surfaces so a pine cannot appear halfway up its bark. */
export function clipBehindTree(tree:DepthArt,actor:DepthArt):PlacedArt|undefined{
  const {sprite}=actor,{art,scale}=sprite;
  if(!tree.sprite.art.depth)return sprite;
  const a=atlasBuildingBounds(sprite),b=atlasBuildingBounds(tree.sprite);
  if(a.right+1<b.left||a.left-1>b.right||a.bottom+1<b.top||a.top-1>b.bottom)return sprite;
  const {width,height}=art.image,origin=rasterOrigin(sprite),covered=depthReader(tree);
  let copy:Uint8ClampedArray|undefined,visible=false;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(art.pixels[i*4+3]<128)continue;
    const depth=actor.order+(art.depth?.[i]??0)*scale;
    if(covered(origin.x+(x+.5)*scale,origin.y+(y+.5)*scale,depth)){
      copy??=art.pixels.slice();
      copy[i*4+3]=0;
    }else visible=true;
  }
  if(!copy)return sprite;
  if(!visible)return;
  const image=document.createElement('canvas');
  image.width=width;image.height=height;
  const ctx=image.getContext('2d');
  if(!ctx)return sprite;
  const bitmap=ctx.createImageData(width,height);
  bitmap.data.set(copy);
  ctx.putImageData(bitmap,0,0);
  return {...sprite,art:{...art,image,pixels:copy}};
}
