/** Ordered one-flight simulation requests. World snapshots are immutable.
 * Discarding a response after a player edit is essential: a late worker must
 * never replace a new world, divine intervention, import, or paint operation.
 */
import type {Tile,World} from './engine';
/** Supply world only when UI has changed it. Otherwise the worker keeps the
 * last successfully computed state, saving one structured clone per tick. */
export type SimulationRequest={kind:'advance';id:number;days:number;world?:World};
const reusableFields=['settings','tiles','topography','terrainCells','skylands','worldTree','tidalSites','volcanicLayout','volcanism','underworld','settlements','transport',
  'ancientSites','ruins','trails','deposits','bonds','codex','descent','fruitHarvest'] as const;
type RetainedField=typeof reusableFields[number];
type SimulationSnapshot=Omit<World,RetainedField>&Partial<Pick<World,RetainedField>>;
type TileEdit=[index:number,tile:Tile];
export type SimulationReply=
  |{kind:'advanced';id:number;world:SimulationSnapshot;retained?:RetainedField[];
    tileEdits?:TileEdit[];elapsedMs:number}
  |{kind:'failed';id:number;message:string};
export type PendingSimulation={id:number;revision:number;world:World};

/** Identical immutable data can stay on the presentation thread. It keeps
 * renderer caches alive and avoids cloning the same map every calendar tick. */
export function packSimulationWorld(before:World,next:World){
  const world:SimulationSnapshot={...next};
  let geographyChanged=false,tileEdits:TileEdit[]|undefined;
  if(next.tiles!==before.tiles){
    const limit=Math.min(2048,Math.floor(next.tiles.length/8));
    if(next.width===before.width&&next.height===before.height&&next.tiles.length===before.tiles.length)
      tileEdits=[];
    for(let i=0;i<next.tiles.length;i++){
      const tile=next.tiles[i],previous=before.tiles[i];
      if(tile===previous)continue;
      if(tile.biome!==previous?.biome)geographyChanged=true;
      if(tileEdits){
        if(tileEdits.length<limit)tileEdits.push([i,tile]);
        else tileEdits=undefined;
      }
      if(!tileEdits&&geographyChanged)break;
    }
  }
  const retained=reusableFields.filter(key=>before[key]!==undefined&&before[key]===next[key]&&
    (key!=='topography'||!geographyChanged));
  for(const key of retained)delete world[key];
  if(tileEdits)delete world.tiles;
  return {world,retained,...(tileEdits?{tileEdits}:{})};
}

export function receiveSimulationWorld(before:World,reply:Extract<SimulationReply,{kind:'advanced'}>):World{
  const world={...reply.world};
  for(const key of reply.retained??[])Object.assign(world,{[key]:before[key]});
  if(reply.tileEdits){
    world.tiles=before.tiles.slice();
    for(const [index,tile] of reply.tileEdits)world.tiles[index]=tile;
  }
  // Population can change on a new year while the same passages and
  // causeways still describe the same underground geography.
  const oldRealm=before.underworld,realm=world.underworld;
  if(oldRealm&&realm&&realm!==oldRealm){
    const links=oldRealm.links.length===realm.links.length&&oldRealm.links.every((link,i)=>{
      const next=realm.links[i];
      return link.surface===next.surface&&link.cell===next.cell&&link.kind===next.kind;
    })?oldRealm.links:realm.links;
    const oldTerraces=oldRealm.terraces,terraces=realm.terraces;
    const sameTerraces=oldTerraces?.length===terraces?.length&&
      (!oldTerraces||oldTerraces.every((cell,i)=>cell===terraces?.[i]));
    world.underworld={...realm,links,terraces:sameTerraces?oldTerraces:terraces};
  }
  return world as World;
}
export function shouldAcceptSimulation(
  pending:PendingSimulation|null,reply:SimulationReply,
  revision:number,playing:boolean,current:World,
):boolean{
  return !!pending&&reply.id===pending.id&&reply.kind==='advanced'&&
    pending.revision===revision&&playing&&pending.world===current;
}
