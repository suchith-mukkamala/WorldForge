/** The raised world paints most scenery into one cached backdrop. In close
 * adventure view a small set of nearby trees also participates in actor depth
 * sorting, so people actually pass behind trunks and canopies. */
import type {World} from './engine';
import {terrainDetailAt} from './terrainDetails';
import {topographyForWorld} from './topography';
import {visibleCoastTile} from './worldOutline';

export type AdventureTree={x:number;y:number;pine:boolean;variant:number};

export function nearbyAdventureTrees(world:World,x:number,y:number,
  radius=18):AdventureTree[]{
  const trees:AdventureTree[]=[],heights=topographyForWorld(world).heights;
  const minX=Math.max(0,Math.floor(x)-radius);
  const maxX=Math.min(world.width-1,Math.ceil(x)+radius);
  const minY=Math.max(0,Math.floor(y)-radius);
  const maxY=Math.min(world.height-1,Math.ceil(y)+radius);
  for(let row=minY;row<=maxY;row++)for(let col=minX;col<=maxX;col++){
    const index=row*world.width+col,biome=world.tiles[index].biome;
    if(!visibleCoastTile(col,row,world.width,world.height,biome,
      world.settings.seed))continue;
    const hash=(Math.imul(col+world.settings.seed,73856093)^
      Math.imul(row+world.settings.seed,19349663))>>>0;
    if(hash%7!==0)continue;
    const motif=terrainDetailAt(biome,col,row,world.settings.seed,
      heights[index]).motif;
    if(motif==='oak'||motif==='pine')trees.push({x:col,y:row,
      pine:motif==='pine',variant:(hash>>>5)%3});
  }
  return trees;
}
