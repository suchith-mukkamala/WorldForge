import type {RasterCrop} from './atlasRaster';
import type {BuildingArt,PlacedArt} from './atlasBuildingArt';
import {ATLAS_SEA,highlandColor} from './atlasTerrain';
import type {BuildingPlots} from './buildingPlots';
import {paintDepthCells} from './depthCellTerrain';
import {createDepthProjector,type DepthCamera} from './depthProjection';
import type {DepthPicking} from './depthTerrain';
import {pixelTerrainHash,surfaceColor} from './depthWorldArt';
import type {World} from './engine';
import {surfaceCoastalDepth,OCEAN_TONES} from './oceanDepth';
import type {SurfaceWorld} from './surfaceGrid';
import {topographyForWorld} from './topography';
import {woodlandCover,woodlandHabitat} from './woodland';
import {isMultiIslandLayout} from './worldGeography';
import {visibleCoastTile} from './worldOutline';

export type BackdropWorld=SurfaceWorld&Pick<World,'woodland'>;
type Projector=ReturnType<typeof createDepthProjector>;
type BackdropPaint=Pick<BuildingPlots,'squares'|'decoratedTiles'>;
type BackdropScene={world:BackdropWorld;plots?:BackdropPaint};
type BackdropPose={relief:number;camera:DepthCamera;cutaway?:boolean;showSkylands?:boolean;showTree?:boolean};
export type DepthBackdropView=BackdropScene&BackdropPose;
type BackdropUpdate={full:BackdropScene}|{world?:Partial<BackdropWorld>;plots?:BackdropPaint|null};
export type DepthBackdropInput=BackdropPose&{scene:BackdropUpdate};
export type DepthRasterRequest=DepthBackdropInput&{id:number;density:number};
type TreeArt=PlacedArt&{art:BuildingArt&{image:ImageBitmap}};
export type DepthRasterResult={id:number;bitmap:ImageBitmap;hit:DepthPicking;tree?:{sprite:TreeArt;order:number}};

/** Keep immutable buffers and their derived terrain caches in the worker. */
export function depthBackdropInput({world,plots,...pose}:DepthBackdropView,
  previous?:DepthBackdropView):DepthBackdropInput{
  if(!previous)return {...pose,scene:{full:{world,plots}}};
  const changes:Partial<BackdropWorld>={};
  const update=<K extends keyof BackdropWorld>(key:K)=>{
    if(world[key]!==previous.world[key])changes[key]=world[key];
  };
  for(const key of Object.keys({...previous.world,...world}))update(key as keyof BackdropWorld);
  const scene:BackdropUpdate={};
  if(Object.keys(changes).length)scene.world=changes;
  if(plots?.squares!==previous.plots?.squares||plots?.decoratedTiles!==previous.plots?.decoratedTiles)
    scene.plots=plots??null;
  return {...pose,scene};
}

export function receiveBackdropScene(update:BackdropUpdate,previous?:BackdropScene):BackdropScene{
  if('full' in update)return update.full;
  if(!previous)throw Error('The terrain raster needs a scene.');
  const world=update.world?{...previous.world,...update.world}:previous.world;
  const plots=update.plots===undefined?previous.plots:update.plots??undefined;
  return {world,plots};
}

export function closeDepthRaster({bitmap,tree}:DepthRasterResult){
  bitmap.close();tree?.sprite.art.image.close();
}

export function orderedDepthTiles(w:BackdropWorld,projector:Projector,cutaway=false){
  const {width,height,tiles}=w,seed=w.settings.seed;
  const all=cutaway||isMultiIslandLayout(w.settings.layout);
  const ordered=Array.from({length:tiles.length},(_,i)=>i).filter(i=>all||
    visibleCoastTile(i%width,Math.floor(i/width),width,height,tiles[i].biome,seed));
  const keys=new Float64Array(tiles.length);
  for(const i of ordered)keys[i]=projector.order(i%width,Math.floor(i/width));
  return ordered.sort((a,b)=>keys[a]-keys[b]||a%width-b%width);
}

export function paintDepthBackdrop(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,
  hit:DepthPicking,w:BackdropWorld,projector:Projector,density:number,ordered:readonly number[],
  plots?:BackdropPaint,sample=1,cutaway=false,crop?:RasterCrop){
  const {width,tiles,settings}=w,heights=topographyForWorld(w).heights;
  const ocean=surfaceCoastalDepth(w);
  paintDepthCells(ctx,hit,w,projector,density,ordered,ATLAS_SEA,index=>{
    const x=index%width,y=Math.floor(index/width),biome=tiles[index].biome;
    const grain=pixelTerrainHash(x,y,settings.seed);
    const cover=woodlandHabitat(biome)?woodlandCover(w.woodland,index):undefined;
    const upland=settings.landforms?highlandColor(biome,heights[index],grain):undefined;
    return {color:biome==='water'?OCEAN_TONES[ocean[index]]:
      upland??surfaceColor(biome,x,y,settings.seed,cover),grain,water:biome==='water'};
  },plots,sample,cutaway,crop);
}
