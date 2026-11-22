/** Ordered one-flight simulation requests. World snapshots are immutable.
 * Discarding a response after a player edit is essential: a late worker must
 * never replace a new world, divine intervention, import, or paint operation.
 */
import type {World} from './engine';
/** Supply world only when UI has changed it. Otherwise the worker keeps the
 * last successfully computed state, saving one structured clone per tick. */
export type SimulationRequest={kind:'advance';id:number;days:number;world?:World};
const reusableFields=['settings','tiles','topography','terrainCells','skylands','worldTree','tidalSites','volcanicLayout','volcanism','underworld','settlements','transport',
  'ancientSites','ruins','trails','deposits','bonds','codex','descent'] as const;
type RetainedField=typeof reusableFields[number];
type SimulationSnapshot=Omit<World,RetainedField>&Partial<Pick<World,RetainedField>>;
export type SimulationReply=
  |{kind:'advanced';id:number;world:SimulationSnapshot;retained?:RetainedField[];elapsedMs:number}
  |{kind:'failed';id:number;message:string};
export type PendingSimulation={id:number;revision:number;world:World};

/** Identical immutable data can stay on the presentation thread. It keeps
 * renderer caches alive and avoids cloning the same map every calendar tick. */
export function packSimulationWorld(before:World,next:World){
  const world:SimulationSnapshot={...next};
  const geographyChanged=next.tiles!==before.tiles&&next.tiles.some((tile,i)=>
    tile.biome!==before.tiles[i]?.biome);
  const retained=reusableFields.filter(key=>before[key]!==undefined&&before[key]===next[key]&&
    (key!=='topography'||!geographyChanged));
  for(const key of retained)delete world[key];
  return {world,retained};
}

export function receiveSimulationWorld(before:World,reply:Extract<SimulationReply,{kind:'advanced'}>):World{
  const world={...reply.world};
  for(const key of reply.retained??[])Object.assign(world,{[key]:before[key]});
  return world as World;
}
export function shouldAcceptSimulation(
  pending:PendingSimulation|null,reply:SimulationReply,
  revision:number,playing:boolean,current:World,
):boolean{
  return !!pending&&reply.id===pending.id&&reply.kind==='advanced'&&
    pending.revision===revision&&playing&&pending.world===current;
}
