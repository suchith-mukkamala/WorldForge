import type {RasterCrop} from './atlasRaster';
import type {DepthRasterRequest,DepthRasterResult} from './depthBackdrop';
import type {DepthCamera} from './depthProjection';
import type {RealmRasterRequest} from './realmRelief';
import type {RealmMap} from './underworld';

export type AtlasDetailSource={kind:'surface';view:Omit<DepthRasterRequest,'id'|'density'>}|
  {kind:'underworld';map:RealmMap;projection:RealmRasterRequest['projection'];camera:DepthCamera};
export type AtlasDetailRequest={id:number;crop:RasterCrop;source?:AtlasDetailSource};
export type AtlasDetailFrame=DepthRasterResult&{crop:RasterCrop};
