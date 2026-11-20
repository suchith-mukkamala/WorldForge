import {useEffect,useRef} from 'react';
import {ATLAS_SEA,highlandColor,overheadTerrainColor,type AtlasLand} from './atlasTerrain';
import {topographyForWorld} from './topography';
import {coastalDepth} from './oceanDepth';
import {pixelTerrainHash} from './depthWorldArt';
import {woodlandCover,woodlandHabitat} from './woodland';
import {paintTerrainMosaic} from './terrainCellArt';
import {VISUAL_TERRAIN_SIDE} from './surfaceGrid';

const CELL=VISUAL_TERRAIN_SIDE;
export function TerrainPreview({world,label}:{world:AtlasLand;label:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  const {width,height}=world;
  useEffect(()=>{
    const ctx=ref.current?.getContext('2d');
    if(!ctx)return;
    const depths=coastalDepth(width,height,i=>world.tiles[i].biome==='water');
    const heights=topographyForWorld(world).heights;
    ctx.imageSmoothingEnabled=false;
    paintTerrainMosaic(ctx,world,CELL,i=>{
      const x=i%width,y=Math.floor(i/width),biome=world.tiles[i].biome;
      const cover=woodlandHabitat(biome)?woodlandCover(world.woodland,i):undefined;
      const grain=pixelTerrainHash(x,y,world.settings.seed);
      const rock=world.settings.landforms?highlandColor(biome,heights[i],grain):undefined;
      return {color:rock??overheadTerrainColor(biome,depths[i],cover),grain,water:biome==='water'};
    },ATLAS_SEA);
  },[world,width,height]);
  return <canvas ref={ref} width={width*CELL} height={height*CELL} role="img"
    aria-label={label}/>;
}
