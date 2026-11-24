import {orderedDepthTiles,paintDepthBackdrop,type DepthRasterRequest,type DepthRasterResult} from './depthBackdrop';
import {createDepthProjector} from './depthProjection';
import {topographyForWorld} from './topography';
import {createBlockBitmap,depthBlockView,placeBlockArt} from './blockScenery';
import {projectWorldTree} from './worldTreeArt';

self.onmessage=({data}:MessageEvent<DepthRasterRequest>)=>{
  const {id,world,relief,camera,density,plots,cutaway,showSkylands,showTree}=data;
  const projector=createDepthProjector({...world,skylands:showSkylands?world.skylands:undefined},
    relief,camera,topographyForWorld(world).heights);
  const width=projector.size.width*density,height=projector.size.height*density;
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Terrain canvas is unavailable.');
  const hit={width,height,ids:new Uint32Array(width*height)};
  paintDepthBackdrop(ctx,hit,world,projector,density,orderedDepthTiles(world,projector,cutaway),plots,1,cutaway);
  const bitmap=canvas.transferToImageBitmap();
  const result:DepthRasterResult={id,hit,bitmap};
  const transfer:Transferable[]=[bitmap,hit.ids.buffer];
  if(showTree&&world.worldTree){
    const view=depthBlockView(camera),{model,at,order,unit}=projectWorldTree(world,projector,view);
    const art=createBlockBitmap(model,view,unit,true);
    if(art){
      result.tree={sprite:placeBlockArt(art,at,1),order};
      transfer.push(art.image,art.pixels.buffer as ArrayBuffer);
      if(art.depth)transfer.push(art.depth.buffer as ArrayBuffer);
    }
  }
  self.postMessage(result,{transfer});
};
