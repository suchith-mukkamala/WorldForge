import {ATLAS_SEA,highlandColor} from './atlasTerrain';
import type {BuildingPlots} from './buildingPlots';
import {paintDepthCells} from './depthCellTerrain';
import {createDepthProjector,type DepthCamera} from './depthProjection';
import type {DepthPicking} from './depthTerrain';
import {pixelTerrainHash,surfaceColor} from './depthWorldArt';
import type {World} from './engine';
import {coastalDepth,OCEAN_TONES} from './oceanDepth';
import type {SurfaceWorld} from './surfaceGrid';
import {topographyForWorld} from './topography';
import {woodlandCover,woodlandHabitat} from './woodland';
import {isMultiIslandLayout} from './worldGeography';
import {visibleCoastTile} from './worldOutline';

export type BackdropWorld=SurfaceWorld&Pick<World,'woodland'>;
type Projector=ReturnType<typeof createDepthProjector>;
export type BackdropPaint=Pick<BuildingPlots,'squares'|'decoratedTiles'>;
export type DepthRasterRequest={id:number;world:BackdropWorld;plots?:BackdropPaint;
  relief:number;camera:DepthCamera;density:number;cutaway?:boolean;showSkylands?:boolean};
export type DepthRasterResult={id:number;bitmap:ImageBitmap;hit:DepthPicking};

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
  plots?:BackdropPaint,sample=1,cutaway=false){
  const {width,height,tiles,settings}=w,heights=topographyForWorld(w).heights;
  const ocean=coastalDepth(width,height,i=>tiles[i].biome==='water');
  paintDepthCells(ctx,hit,w,projector,density,ordered,ATLAS_SEA,index=>{
    const x=index%width,y=Math.floor(index/width),biome=tiles[index].biome;
    const grain=pixelTerrainHash(x,y,settings.seed);
    const cover=woodlandHabitat(biome)?woodlandCover(w.woodland,index):undefined;
    const upland=settings.landforms?highlandColor(biome,heights[index],grain):undefined;
    return {color:biome==='water'?OCEAN_TONES[ocean[index]]:
      upland??surfaceColor(biome,x,y,settings.seed,cover),grain,water:biome==='water'};
  },plots,sample,cutaway);
}
