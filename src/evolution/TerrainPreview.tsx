import {useEffect,useRef} from 'react';
import {atlasRivers,atlasTileGrain,overheadTerrainColor,paintOverheadTerrainTile,type AtlasLand} from './atlasTerrain';
import {hydrologyForWorld} from './hydrology';
import {coastalDepth} from './oceanDepth';
import {pixelTerrainHash} from './depthWorldArt';
import {woodlandCover,woodlandHabitat} from './woodland';

const CELL=4;
export function TerrainPreview({world,label}:{world:AtlasLand;label:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  const {width,height}=world;
  useEffect(()=>{
    const ctx=ref.current?.getContext('2d');
    if(!ctx)return;
    const depths=coastalDepth(width,height,i=>world.tiles[i].biome==='water');
    for(let i=0;i<world.tiles.length;i++){
      const x=i%width,y=Math.floor(i/width),biome=world.tiles[i].biome;
      const cover=woodlandHabitat(biome)?woodlandCover(world.woodland,i):undefined;
      paintOverheadTerrainTile(ctx,x,y,CELL,overheadTerrainColor(biome,depths[i],cover),
        atlasTileGrain(biome,depths[i],pixelTerrainHash(x,y,world.settings.seed)));
    }
    ctx.strokeStyle='#70aeb4';
    ctx.lineWidth=.8;
    ctx.beginPath();
    for(const {from,to} of atlasRivers(hydrologyForWorld(world),false)){
      ctx.moveTo((from%width+.5)*CELL,(Math.floor(from/width)+.5)*CELL);
      ctx.lineTo((to%width+.5)*CELL,(Math.floor(to/width)+.5)*CELL);
    }
    ctx.stroke();
  },[world,width,height]);
  return <canvas ref={ref} width={width*CELL} height={height*CELL} role="img"
    aria-label={label}/>;
}
