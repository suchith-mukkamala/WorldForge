import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,type Agent} from './engine';
import {planCustoms,type SettlementCustom} from './customs';
import {initialDevelopment} from './development';

function adults(patch:Partial<NonNullable<Agent['development']>['values']>,
  skills:Partial<NonNullable<Agent['development']>['skills']>={}):Agent[]{
  return [1,2,3,4].map(id=>{
    const agent={id,species:'human',age:30,
      genes:{vigor:1,curiosity:1,fertility:1,social:1}} as Agent;
    const development=initialDevelopment(agent,'plains');
    development.values={...development.values,...patch};
    development.skills={...development.skills,...skills};
    agent.development=development;
    return agent;
  });
}

describe('settlement customs',()=>{
  it('gives different towns different customs from how their adults live',()=>{
    const reverent=adults({community:70,tradition:80,independence:30,discovery:40});
    const free=adults({community:30,tradition:20,independence:85,discovery:75},
      {craft:10});
    const next=planCustoms(12,[{id:1},{id:2}],new Map([[1,reverent],[2,free]]),
      undefined);
    expect(next.map(item=>item.custom)).toEqual(['ancestors','liberty']);
    expect(next.every(item=>item.since===12&&item.strength>=1&&item.strength<=100))
      .toBe(true);
  });
  it('holds a custom until a clearly stronger way of life has lasted',()=>{
    const previous:SettlementCustom[]=[{settlementId:1,custom:'ancestors',
      since:4,strength:60,voice:'Names and old promises are kept aloud.'}];
    const free=adults({community:20,tradition:15,independence:90,discovery:80});
    expect(planCustoms(8,[{id:1}],new Map([[1,free]]),previous)[0].custom)
      .toBe('ancestors');
    expect(planCustoms(12,[{id:1}],new Map([[1,free]]),previous)[0].custom)
      .toBe('liberty');
  });
  it('keeps a remembered custom when too few adults remain',()=>{
    const previous:SettlementCustom[]=[{settlementId:1,custom:'hearth',since:4,
      strength:40,voice:'Neighbors are expected to share food, shelter and care.'}];
    const next=planCustoms(20,[{id:1}],new Map([[1,[]]]),previous);
    expect(next).toEqual(previous);
  });
});

describe('old worlds without customs',()=>{
  it('still validates and does not invent a custom field at creation',()=>{
    const world=createWorld({seed:42,size:'small',
      starting:{human:4,elf:0,dwarf:0,demon:0}});
    expect(world.culture?.customs).toBeUndefined();
    expect(isWorld(world)).toBe(true);
  });
});
