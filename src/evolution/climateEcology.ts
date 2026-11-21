/** Yearly habitat succession. Geology, settlements and paved roads stay put.
 * Canopy glyphs move with the new biome so living-woodland saves remain valid.
 */
import {climateField,successionBiome} from './climate';
import type {Biome,World} from './engine';
import {roadTiles} from './transport';
import {topographyForWorld} from './topography';
import {rewriteWoodland} from './woodland';
import {seedWildlife} from './wildlife';

function managedTiles(world:World):Set<number>{
  const blocked=new Set<number>();
  for(const settlement of world.settlements){
    blocked.add(settlement.y*world.width+settlement.x);
    for(const building of settlement.infrastructure?.buildings??[]){
      if(building.stage!=='ruin'&&building.stage!=='abandoned')
        blocked.add(building.y*world.width+building.x);
    }
  }
  for(const index of roadTiles(world))blocked.add(index);
  return blocked;
}

/** Returns tiles that gained a closed canopy and may need a timber deposit. */
export function advanceClimateEcology(world:World):number[]{
  const field=climateField(world);
  const heights=topographyForWorld(world).heights;
  const blocked=managedTiles(world);
  const {width,height,year}=world;
  const candidates:{index:number;biome:Biome;margin:number}[]=[];
  for(let index=0;index<world.tiles.length;index++){
    if(index%5!==year%5||blocked.has(index))continue;
    const next=successionBiome(world.tiles[index].biome,field,index,width,height,heights);
    if(next)candidates.push({index,...next});
  }
  candidates.sort((a,b)=>b.margin-a.margin||a.index-b.index);
  const limit=Math.max(8,Math.floor(world.tiles.length*.012));
  const timber:number[]=[];
  const edits:[number,Biome][]=[];
  for(const change of candidates.slice(0,limit)){
    const tile=world.tiles[change.index];
    const wooded=change.biome==='forest'||change.biome==='taiga';
    const wasWooded=tile.biome==='forest'||tile.biome==='taiga';
    world.tiles[change.index]={...tile,biome:change.biome};
    edits.push([change.index,change.biome]);
    if(wooded&&!wasWooded)timber.push(change.index);
  }
  if(world.woodland&&edits.length)world.woodland=rewriteWoodland(world.woodland,edits);
  return timber;
}

/** Turn climate on without repainting a map people already live on. */
export function enableClimateEcology(world:World):World{
  if(world.settings.climateEcology&&world.wildlife)return world;
  const next:World={...world,settings:{...world.settings,climateEcology:true}};
  next.wildlife??=seedWildlife(next);
  return next;
}
