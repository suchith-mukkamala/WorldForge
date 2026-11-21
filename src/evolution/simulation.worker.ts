/** CPU-heavy world ticks run off the React/rendering thread.
 * Simulates exactly the same calendar code as manual steps. No camera,
 * sprite, or DOM state enters the simulation, and requests are processed in
 * arrival order. The main thread enforces one outstanding request.
 */
import type {World} from './engine';
import type {SimulationRequest} from './simulationProtocol';
import {advanceSimulationRequest,deliverSimulationReply} from './simulationTurn';
let activeWorld:World|null=null;
self.onmessage=(event:MessageEvent<SimulationRequest>)=>{
  const request=event.data;
  if(!request||request.kind!=='advance'||!Number.isInteger(request.id))return;
  const result=advanceSimulationRequest(activeWorld,request);
  activeWorld=result.active;
  deliverSimulationReply(reply=>{self.postMessage(reply);},result.reply);
};
export {};
