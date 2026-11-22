import {orderedDepthTiles,paintDepthBackdrop,type DepthRasterRequest,type DepthRasterResult} from './depthBackdrop';
import {createDepthProjector} from './depthProjection';

self.onmessage=({data}:MessageEvent<DepthRasterRequest>)=>{
  const {id,world,relief,camera,density,plots,cutaway}=data;
  const projector=createDepthProjector(world,relief,camera);
  const width=projector.size.width*density,height=projector.size.height*density;
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Terrain canvas is unavailable.');
  const hit={width,height,ids:new Uint32Array(width*height)};
  paintDepthBackdrop(ctx,hit,world,projector,density,orderedDepthTiles(world,projector,cutaway),plots,1,cutaway);
  const bitmap=canvas.transferToImageBitmap();
  const result:DepthRasterResult={id,hit,bitmap};
  self.postMessage(result,{transfer:[bitmap,hit.ids.buffer]});
};
