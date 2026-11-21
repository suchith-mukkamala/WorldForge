/** One background calendar step and the reply posted back to the page.
 * The worker keeps no DOM or camera state. A reply that cannot be cloned
 * still reports failure so playback can continue on the main thread.
 */
import {advanceWorldDays} from './calendar';
import type {World} from './engine';
import {packSimulationWorld,type SimulationReply,type SimulationRequest} from './simulationProtocol';

export function advanceSimulationRequest(active:World|null,request:SimulationRequest,
  now:()=>number=()=>performance.now()):{active:World|null;reply:SimulationReply}{
  // Adopt the page's snapshot even if this step throws, matching the worker's
  // previous order: the request world replaces the cached one before the tick.
  const current=request.world??active;
  if(!current)return {active,reply:{kind:'failed',id:request.id,
    message:'Background world not initialized'}};
  try{
    const start=now();
    const next=advanceWorldDays(current,request.days);
    return {active:next,reply:{kind:'advanced',id:request.id,
      ...packSimulationWorld(current,next),
      elapsedMs:Math.max(0,now()-start)}};
  }catch(error){
    return {active:current,reply:{kind:'failed',id:request.id,
      message:error instanceof Error?error.message:String(error)}};
  }
}

export function deliverSimulationReply(post:(reply:SimulationReply)=>void,
  reply:SimulationReply):void{
  try{post(reply);}
  catch{
    try{post({kind:'failed',id:reply.id,
      message:'Unable to return the simulated world.'});}
    catch{/* The page keeps the world it already showed. */}
  }
}
