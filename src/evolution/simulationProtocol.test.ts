import {describe,expect,it} from 'vitest';
import {createWorld} from './engine';
import {advanceWorldDays} from './calendar';
import {shouldAcceptSimulation,type SimulationReply} from './simulationProtocol';

describe('v1.8 background simulation safety',()=>{
  it('accepts only current, uninterrupted playback responses',()=>{
    const world=createWorld({seed:341,size:'small'});
    const result:SimulationReply={kind:'advanced',id:9,
      world:advanceWorldDays(world,7),elapsedMs:12};
    const pending={id:9,world,revision:3};
    expect(shouldAcceptSimulation(pending,result,3,true,world)).toBe(true);
    expect(shouldAcceptSimulation(pending,result,4,true,world)).toBe(false);
    expect(shouldAcceptSimulation(pending,result,3,false,world)).toBe(false);
    expect(shouldAcceptSimulation(pending,result,3,true,result.world)).toBe(false);
    expect(shouldAcceptSimulation({...pending,id:8},result,3,true,world)).toBe(false);
    expect(shouldAcceptSimulation(null,result,3,true,world)).toBe(false);
    expect(shouldAcceptSimulation(pending,{kind:'failed',id:9,message:'fail'},
      3,true,world)).toBe(false);
  });
  it('worker and manual play use the same deterministic calendar engine',()=>{
    const world=createWorld({seed:342,size:'small'});
    const play=advanceWorldDays(world,30);
    const manual=advanceWorldDays(advanceWorldDays(world,7),23);
    expect(play).toEqual(manual);
  });
});
