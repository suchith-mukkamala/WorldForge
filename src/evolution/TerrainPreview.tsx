import {useEffect,useRef} from 'react';
import {atlasTerrainColors,atlasRivers,type AtlasLand} from './atlasTerrain';
import {hydrologyForWorld} from './hydrology';

const CELL=3;
export function TerrainPreview({world,label}:{world:AtlasLand;label:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  const {width,height}=world;
  useEffect(()=>{
    const ctx=ref.current?.getContext('2d');
    if(!ctx)return;
    const colors=atlasTerrainColors(world);
    for(let i=0;i<colors.length;i++){
      ctx.fillStyle=colors[i];
      ctx.fillRect(i%width*CELL,Math.floor(i/width)*CELL,CELL,CELL);
    }
    ctx.strokeStyle='#70aeb4';
    ctx.lineWidth=.8;
    ctx.beginPath();
    for(const {from,to} of atlasRivers(hydrologyForWorld(world),false)){
      ctx.moveTo((from%width+.5)*CELL,(Math.floor(from/width)+.5)*CELL);
      ctx.lineTo((to%width+.5)*CELL,(Math.floor(to/width)+.5)*CELL);
    }
    ctx.stroke();
  },[world,width]);
  return <canvas ref={ref} width={width*CELL} height={height*CELL} role="img"
    aria-label={label}/>;
}
