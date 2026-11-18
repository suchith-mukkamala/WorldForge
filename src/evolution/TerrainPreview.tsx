import {useEffect,useRef} from 'react';
import type {Biome} from './engine';
import {coastalDepth,OCEAN_TONES} from './oceanDepth';
import {terrainHash} from './biomeGeneration';

const terrain:Record<Exclude<Biome,'water'>,readonly [string,string,string]> = {
  plains:['#78a066','#89b275','#6f935f'],
  forest:['#33634e','#44745b','#315e4b'],
  mountain:['#8e9895','#a5aaa0','#73867e'],
  cave:['#686f74','#80858a','#5f6972'],
  wasteland:['#a27c6d','#b69278','#916d65'],
  volcanic:['#ad685f','#ba7b65','#915b60'],
};

export function TerrainPreview({biomes,width,height,seed,label}:{
  biomes:readonly Biome[];width:number;height:number;seed:number;label:string;
}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const ctx=ref.current?.getContext('2d');
    if(!ctx)return;
    const depths=coastalDepth(width,height,i=>biomes[i]==='water');
    for(let i=0;i<biomes.length;i++){
      const x=i%width,y=Math.floor(i/width),biome=biomes[i],hash=terrainHash(x,y,seed);
      const shade=Math.min(2,Math.floor(hash*3));
      ctx.fillStyle=biome==='water'?OCEAN_TONES[depths[i]]:terrain[biome][shade];
      ctx.fillRect(x,y,1,1);
    }
  },[biomes,width,height,seed]);
  return <canvas ref={ref} width={width} height={height} role="img"
    aria-label={label}/>;
}
