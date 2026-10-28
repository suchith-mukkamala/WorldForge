/** CPU-heavy world ticks run off the React/rendering thread.
 * Simulates exactly the same calendar code as manual steps. No camera,
 * sprite, or DOM state enters the simulation, and requests are processed in
 * arrival order. The main thread enforces one outstanding request.
 */
import {advanceWorldDays} from './calendar';
import type {SimulationRequest,SimulationReply} from './simulationProtocol';
self.onmessage=(event:MessageEvent<SimulationRequest>)=>{
  const request=event.data;
  if(!request||request.kind!=='advance')return;
  let reply:SimulationReply;
  try{
    const before=performance.now();
    const world=advanceWorldDays(request.world,request.days);
    reply={kind:'advanced',id:request.id,world,
      elapsedMs:Math.max(0,performance.now()-before)};
  }catch(error){
    reply={kind:'failed',id:request.id,
      message:error instanceof Error?error.message:String(error)};
  }
  self.postMessage(reply);
};
export {};
