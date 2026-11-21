import {terrainHumidity,terrainNoise,terrainTemperature} from './biomeGeneration';
import type {Biome,WorldSettings} from './engine';
import {generateHydrology,riverBanks} from './hydrology';
import {generateRegionalTopography} from './regionalGeography';
import {generateTopography} from './topography';
import {generateSeedTerrain} from './worldGeography';
import {plantWorldTree} from './worldTree';
import {sculptLandforms} from './riverLandforms';
import {applyClimateBiomes} from './climate';

type LandscapeSettings=Pick<WorldSettings,'seed'|'layout'|'regionalGeography'|
  'landforms'|'regionalBiomes'|'riverlands'|'climateEcology'|'worldTree'>;

function regionalBiomes(width:number,height:number,biomes:readonly Biome[],
  elevations:readonly number[],seed:number):Biome[]{
  const scale=Math.min(width,height);
  const tiles=biomes.map(biome=>({biome}));
  const drainage=generateHydrology(width,height,elevations,tiles,seed,true);
  const banks=riverBanks(drainage,width,height);
  return biomes.map((biome,i)=>{
    if(biome!=='forest'&&biome!=='plains')return biome;
    const x=i%width,y=Math.floor(i/width),elevation=elevations[i];
    const neighbours=[x>0?i-1:i,x<width-1?i+1:i,y>0?i-width:i,y<height-1?i+width:i];
    const shore=neighbours.some(at=>biomes[at]==='water');
    const slope=Math.max(...neighbours.map(at=>Math.abs(elevations[at]-elevation)));
    const humidity=terrainHumidity(x,y,scale,seed);
    const regional=terrainNoise(x-11,y+27,scale*.18,seed+8461);
    const temperature=terrainTemperature(x,y,scale,(y+.5)/height,seed)-
      Math.max(0,elevation-74)*.0018;
    if(elevation<=92&&slope<23&&(shore||banks[i]>.23||drainage.pondDepth[i]>=4)&&
      humidity+regional*.23>-.24)return 'wetland';
    if(elevation<180&&temperature+regional*.12<.46&&
      (biome==='forest'||humidity>.02))return 'taiga';
    if(elevation<136&&temperature+regional*.13>.53&&humidity+regional*.28<.04)
      return 'savanna';
    return biome;
  });
}

/** Climate follows the saved seed, coastline and actual elevation. Preview
 * and world creation share the exact same generation path. */
export function generateWorldLandscape(width:number,height:number,settings:LandscapeSettings){
  const {seed,layout,regionalGeography,landforms}=settings;
  const terrain=generateSeedTerrain(width,height,seed,layout);
  const tiles=terrain.biomes.map(biome=>({biome}));
  const topography=regionalGeography?
    generateRegionalTopography(width,height,tiles,seed,landforms):
    generateTopography(width,height,tiles,seed);
  const features=settings.riverlands?sculptLandforms(width,height,seed,
    terrain.biomes,topography.heights,terrain.homes):[];
  const biomes=settings.regionalBiomes?
    regionalBiomes(width,height,terrain.biomes,topography.heights,seed):terrain.biomes;
  const climateBiomes=settings.climateEcology?
    applyClimateBiomes(width,height,biomes,topography.heights,seed,!!regionalGeography):biomes;
  const worldTree=settings.worldTree?plantWorldTree(width,height,seed,climateBiomes,
    topography.heights,Object.values(terrain.homes)):undefined;
  return {...terrain,topography,features,biomes:climateBiomes,worldTree};
}
