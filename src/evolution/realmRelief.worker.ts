import {prepareRealmRelief,rasterizeRealm,type RealmRasterRequest} from './realmRelief';

let terrain:ReturnType<typeof prepareRealmRelief>|undefined;
self.onmessage=({data}:MessageEvent<RealmRasterRequest>)=>{
  if(data.map)terrain=prepareRealmRelief(data.map);
  if(!terrain)throw Error('The Underworld relief needs a map.');
  const result=rasterizeRealm(data,terrain);
  self.postMessage(result,{transfer:[result.pixels.buffer,result.hit.ids.buffer as ArrayBuffer]});
};
