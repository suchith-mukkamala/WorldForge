import {describe,expect,it} from 'vitest';
import {createWorld} from './engine';
import {advanceWorldDays} from './calendar';
import {packSimulationWorld,receiveSimulationWorld,shouldAcceptSimulation,type SimulationReply} from './simulationProtocol';
import {underworldMap} from './underworld';

describe('v1.8 background simulation safety',()=>{
  it('accepts only current, uninterrupted playback responses',()=>{
    const world=createWorld({seed:341,size:'small'});
    const result:SimulationReply={kind:'advanced',id:9,
      world:advanceWorldDays(world,7),elapsedMs:12};
    const pending={id:9,world,revision:3};
    expect(shouldAcceptSimulation(pending,result,3,true,world)).toBe(true);
    expect(shouldAcceptSimulation(pending,result,4,true,world)).toBe(false);
    expect(shouldAcceptSimulation(pending,result,3,false,world)).toBe(false);
    expect(shouldAcceptSimulation(pending,result,3,true,receiveSimulationWorld(world,result))).toBe(false);
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
  it('retains the presented geography and restores tick data exactly',()=>{
    const world=createWorld({seed:343,size:'small',terrainCells:true});
    const next=advanceWorldDays(world,1),packet=packSimulationWorld(world,next);
    expect(packet.world.tiles).toBeUndefined();
    const accepted=receiveSimulationWorld(world,structuredClone({kind:'advanced',id:1,elapsedMs:0,...packet}));
    expect(accepted).toEqual(next);
    expect(accepted.tiles).toBe(world.tiles);
    expect(accepted.topography).toBe(world.topography);
    const edited={...next,tiles:next.tiles.map((tile,i)=>i===0?{...tile,biome:'volcanic' as const}:tile)};
    expect(packSimulationWorld(next,edited).retained).not.toContain('topography');
  });
  it('retains the underground map when its population changes and refreshes it for a new causeway',()=>{
    const world=createWorld({seed:41,size:'small',volcanicWorld:true});
    const state=world.underworld!,map=underworldMap(world);
    expect(map).toBeDefined();
    const population=state.population.map(group=>({...group,demons:group.demons+1}));
    const next={...world,underworld:{...state,population}};
    const hydrate=(a:typeof world,b:typeof world)=>receiveSimulationWorld(a,structuredClone({
      kind:'advanced' as const,id:1,elapsedMs:0,...packSimulationWorld(a,b),
    }));
    const accepted=hydrate(world,next);
    expect(accepted).toEqual(next);
    expect(underworldMap(accepted)).toBe(map);
    const terraces=[...state.terraces??[],0];
    const built=hydrate(accepted,{...next,underworld:{...next.underworld,terraces}});
    expect(built.underworld?.terraces).toEqual(terraces);
    expect(underworldMap(built)).not.toBe(map);
  });
});
