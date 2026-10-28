/** CPU-heavy world ticks run off the React/rendering thread.
 * Simulates exactly the same calendar code as manual steps. No camera,
 * sprite, or DOM state enters the simulation, and requests are processed in
 * arrival order. The main thread enforces one outstanding request.
 */
import {advanceWorldDays} from './calendar';
import type {World} from './engine';
import type {SimulationRequest,SimulationReply} from './simulationProtocol';
let activeWorld:World|null=null;
self.onmessage=(event:MessageEvent<SimulationRequest>)=>{
  const request=event.data;
  if(!request||request.kind!=='advance')return;
  let reply:SimulationReply;
  try{
    if(request.world)activeWorld=request.world;
    if(!activeWorld)throw Error('Background world not initialized');
    const before=performance.now();
    const world=advanceWorldDays(activeWorld,request.days);
    activeWorld=world;
    reply={kind:'advanced',id:request.id,world,
      elapsedMs:Math.max(0,performance.now()-before)};
  }catch(error){
    reply={kind:'failed',id:request.id,
      message:error instanceof Error?error.message:String(error)};
  }
  self.postMessage(reply);
};
export {};
