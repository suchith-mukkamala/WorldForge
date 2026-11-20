import type {World} from './engine';
import type {Point} from './motion';
import {terrainCellsIn,type TerrainCell,type TerrainMaterial} from './terrainCells';

const tones:Record<TerrainMaterial,readonly string[]>={
  stone:['#74838e','#85929b','#7d8892'],
  soil:['#527960','#658564','#58795c'],
  sand:['#ac8e65','#bd9f72','#b69a6f'],
};

export function terrainCellColor(cell:TerrainCell):string{
  if(cell.waterDepth>0)return cell.waterDepth>=3?'#3b7899':cell.waterDepth>=1?'#4b96a7':'#69b0b0';
  const palette=tones[cell.material];
  return palette[Math.floor(cell.height*4)%palette.length];
}

/** Render the fine terrain around the inspected place. The rest of the atlas
 * can use its cached overview art even on the largest maps. */
export function terrainCellPatch(w:World,focus:Point):Map<number,TerrainCell[]>{
  const patch=new Map<number,TerrainCell[]>();
  if(!w.terrainCells)return patch;
  const radius=Math.min(16,Math.ceil(Math.max(w.width,w.height)/8));
  for(let y=Math.max(0,focus.y-radius);y<=Math.min(w.height-1,focus.y+radius);y++){
    for(let x=Math.max(0,focus.x-radius);x<=Math.min(w.width-1,focus.x+radius);x++){
      const index=y*w.width+x;
      // A lake or sea has one rendered surface. Its bed and depth are inspectable.
      if(w.tiles[index].biome==='water')continue;
      patch.set(index,terrainCellsIn(w,index)!);
    }
  }
  return patch;
}
