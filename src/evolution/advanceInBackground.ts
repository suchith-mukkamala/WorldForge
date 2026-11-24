import {advanceWorldDays,DAYS_PER_YEAR} from './calendar';
import type {World} from './engine';
import {receiveSimulationWorld,type SimulationReply,type SimulationRequest} from './simulationProtocol';

function checkCancelled(signal?:AbortSignal):void{
  if(signal?.aborted)throw signal.reason??new DOMException('Advance cancelled','AbortError');
}

export async function advanceInSlices(start:World,days:number,signal?:AbortSignal):Promise<World>{
  checkCancelled(signal);
  let world=start,remaining=Math.min(DAYS_PER_YEAR*200,Math.trunc(days));
  while(remaining>0&&world.year<9999){
    // Give input, paint and cancellation a chance between calendar chunks.
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    checkCancelled(signal);
    const batch=Math.min(remaining,28);
    world=advanceWorldDays(world,batch);
    remaining-=batch;
  }
  return world;
}

/** One manual command owns a worker until it completes or the player edits
 * or cancels the source snapshot. Use the same calendar in either browser path. */
export async function advanceInBackground(world:World,days:number,signal?:AbortSignal):Promise<World>{
  checkCancelled(signal);
  let worker:Worker|undefined,onAbort:(()=>void)|undefined;
  try{
    worker=new Worker(new URL('./simulation.worker.ts',import.meta.url),{type:'module'});
    const session=worker;
    return await new Promise<World>((resolve,reject)=>{
      onAbort=()=>reject(signal?.reason??new DOMException('Advance cancelled','AbortError'));
      signal?.addEventListener('abort',onAbort,{once:true});
      session.onmessage=({data:reply}:MessageEvent<SimulationReply>)=>{
        if(reply?.id!==1)return;
        if(reply.kind==='advanced')resolve(receiveSimulationWorld(world,reply));
        else reject(Error(reply.message));
      };
      session.onerror=()=>reject(Error('Background simulation unavailable'));
      session.onmessageerror=()=>reject(Error('Background simulation could not return the world'));
      const request:SimulationRequest={kind:'advance',id:1,world,days};
      session.postMessage(request);
    });
  }catch{
    checkCancelled(signal);
    return advanceInSlices(world,days,signal);
  }finally{
    if(onAbort)signal?.removeEventListener('abort',onAbort);
    worker?.terminate();
  }
}
