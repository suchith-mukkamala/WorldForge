import {paintRealmRelief,realmRasterSize,type RealmRasterRequest,type RealmRasterResult} from './realmRelief';
import {stackedProjection} from './stackedProjection';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';

self.onmessage=({data}:MessageEvent<RealmRasterRequest>)=>{
  const {world,map,camera,maxRealmHeight,id}=data;
  const {size,lowerHeight}=stackedProjection(world,map,camera,maxRealmHeight);
  const {width,height}=realmRasterSize(size.width,lowerHeight);
  const canvas=new OffscreenCanvas(width,height);
  const texture=new OffscreenCanvas(map.width*VISUAL_TERRAIN_SIDE,map.height*VISUAL_TERRAIN_SIDE);
  const ctx=canvas.getContext('2d'),ink=texture.getContext('2d');
  if(!ctx||!ink)throw Error('Cannot draw the Underworld relief.');
  const hit=paintRealmRelief(ctx,ink,data);
  const bitmap=canvas.transferToImageBitmap();
  const result:RealmRasterResult={id,bitmap,hit};
  self.postMessage(result,{transfer:[bitmap,hit.ids.buffer]});
};
