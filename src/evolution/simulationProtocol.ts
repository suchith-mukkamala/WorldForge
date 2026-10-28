/** Ordered one-flight simulation requests. World snapshots are immutable.
 * Discarding a response after a player edit is essential: a late worker must
 * never replace a new world, divine intervention, import, or paint operation.
 */
import type {World} from './engine';
/** Supply world only when UI has changed it. Otherwise the worker keeps the
 * last successfully computed state, saving one structured clone per tick. */
export type SimulationRequest={kind:'advance';id:number;days:number;world?:World};
export type SimulationReply=
  |{kind:'advanced';id:number;world:World;elapsedMs:number}
  |{kind:'failed';id:number;message:string};
export type PendingSimulation={id:number;revision:number;world:World};
export function shouldAcceptSimulation(
  pending:PendingSimulation|null,reply:SimulationReply,
  revision:number,playing:boolean,current:World,
):boolean{
  return !!pending&&reply.id===pending.id&&reply.kind==='advanced'&&
    pending.revision===revision&&playing&&pending.world===current;
}
