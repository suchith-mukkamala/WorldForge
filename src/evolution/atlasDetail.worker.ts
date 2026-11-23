import type {AtlasDetailRequest,AtlasDetailFrame,AtlasDetailSource} from './atlasDetailTypes';
import {orderedDepthTiles,paintDepthBackdrop} from './depthBackdrop';
import {createDepthProjector} from './depthProjection';
import {prepareRealmRelief,rasterizeRealm} from './realmRelief';
import {topographyForWorld} from './topography';

function prepare(source:AtlasDetailSource){
  if(source.kind==='underworld'){
    const terrain=prepareRealmRelief(source.map);
    return (id:number,crop:AtlasDetailRequest['crop'])=>{
      const {pixels,hit}=rasterizeRealm({id,projection:source.projection,crop},terrain);
      const canvas=new OffscreenCanvas(crop.width,crop.height),ctx=canvas.getContext('2d')!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),crop.width,crop.height),0,0);
      return {hit,bitmap:canvas.transferToImageBitmap()};
    };
  }

  const {world,relief,camera,showSkylands,cutaway,plots}=source.view;
  const projector=createDepthProjector({...world,skylands:showSkylands?world.skylands:undefined},
    relief,camera,topographyForWorld(world).heights);
  const tiles=orderedDepthTiles(world,projector,cutaway);
  return (_id:number,crop:AtlasDetailRequest['crop'])=>{
    const {width,height,density}=crop;
    const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d')!;
    const hit={width,height,ids:new Uint32Array(width*height)};
    paintDepthBackdrop(ctx,hit,world,projector,density,tiles,plots,1,cutaway,crop);
    return {hit,bitmap:canvas.transferToImageBitmap()};
  };
}

let paint:ReturnType<typeof prepare>|undefined;
self.onmessage=({data}:MessageEvent<AtlasDetailRequest>)=>{
  const {id,crop,source}=data;
  if(source)paint=prepare(source);
  if(!paint)throw Error('The close-up raster needs a scene.');
  const result:AtlasDetailFrame={id,crop,...paint(id,crop)};
  self.postMessage(result,{transfer:[result.bitmap,result.hit.ids.buffer as ArrayBuffer]});
};
