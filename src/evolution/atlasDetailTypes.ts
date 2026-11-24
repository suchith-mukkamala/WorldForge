import type {RasterCrop} from './atlasRaster';
import type {DepthBackdropInput,DepthBackdropView,DepthRasterResult} from './depthBackdrop';
import type {DepthCamera} from './depthProjection';
import type {RealmRasterRequest} from './realmRelief';
import type {RealmMap} from './underworld';

type UnderworldSource={kind:'underworld';map:RealmMap;projection:RealmRasterRequest['projection'];camera:DepthCamera};
export type AtlasDetailSource={kind:'surface';view:DepthBackdropView}|UnderworldSource;
export type AtlasDetailUpdate={kind:'surface';view:DepthBackdropInput}|
  (Omit<UnderworldSource,'map'>&{map?:RealmMap});
export type AtlasDetailRequest={id:number;crop:RasterCrop;source?:AtlasDetailUpdate};
export type AtlasDetailFrame=DepthRasterResult&{crop:RasterCrop};
