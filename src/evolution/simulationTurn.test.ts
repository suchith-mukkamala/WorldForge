import {describe,expect,it,vi} from 'vitest';
import {advanceInBackground} from './advanceInBackground';
import {advanceWorldDays} from './calendar';
import {createWorld} from './engine';
import type {SimulationReply} from './simulationProtocol';
import {advanceSimulationRequest,deliverSimulationReply} from './simulationTurn';

describe('background simulation replies',()=>{
  it('yields on a browser without workers and can cancel an advance',async()=>{
    vi.stubGlobal('Worker',undefined);
    try{
      const world=createWorld({seed:345,size:'small'});
      const controller=new AbortController();
      const cancelled=advanceInBackground(world,3650,controller.signal);
      const failure=expect(cancelled).rejects.toMatchObject({name:'AbortError'});
      controller.abort();
      await failure;
      expect(await advanceInBackground(world,35)).toEqual(advanceWorldDays(world,35));
    }finally{vi.unstubAllGlobals();}
  });
  it('advances the supplied world and keeps that snapshot if the step throws',()=>{
    const world=createWorld({seed:344,size:'small'});
    const clock={t:10};
    const stepped=advanceSimulationRequest(null,
      {kind:'advance',id:3,days:1,world},()=>clock.t++);
    expect(stepped.reply.kind).toBe('advanced');
    if(stepped.reply.kind!=='advanced')return;
    expect(stepped.reply.id).toBe(3);
    expect(stepped.reply.elapsedMs).toBe(1);
    expect(stepped.active?.dayOfYear).toBe(1);
    const missing=advanceSimulationRequest(null,{kind:'advance',id:4,days:1});
    expect(missing).toEqual({active:null,reply:{kind:'failed',id:4,
      message:'Background world not initialized'}});
    const broken=advanceSimulationRequest(world,{kind:'advance',id:5,days:1,
      world:world},()=>{throw Error('clock failed');});
    expect(broken.active).toBe(world);
    expect(broken.reply).toEqual({kind:'failed',id:5,message:'clock failed'});
  });

  it('reports a small failure when the full reply cannot be posted',()=>{
    const posted:{kind:string;message?:string}[]=[];
    deliverSimulationReply(reply=>{
      posted.push(reply);
      if(reply.kind==='advanced')throw Error('could not clone');
    },{kind:'advanced',id:8,world:{},elapsedMs:4} as SimulationReply);
    expect(posted.map(reply=>reply.kind)).toEqual(['advanced','failed']);
    expect(posted[1]).toEqual({kind:'failed',id:8,
      message:'Unable to return the simulated world.'});
    expect(()=>deliverSimulationReply(()=>{throw Error('closed');},
      {kind:'failed',id:9,message:'already failed'})).not.toThrow();
  });
});
