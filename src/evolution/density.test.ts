import {describe,expect,it} from 'vitest';
import {createWorld,editWorld,isWorld,stepWorld,type Settlement} from './engine';
import {residentIndex,settlementSafetyLimit,tileCapacity} from './density';

describe('v1.2.1: physically bounded settlement density',()=>{
  it('allows several people at a settled location without allowing unlimited stacking',()=>{
    const origin=createWorld({seed:108,size:'small'});
    const founder=origin.agents.find(a=>a.species==='human')!;
    const town:Settlement={id:1,species:'human',name:'Newfield',
      x:founder.x,y:founder.y,founded:0,population:1,stores:20,emptyYears:0};
    const w={...origin,settlements:[town],nextSettlementId:2};
    const index=founder.y*w.width+founder.x;
    expect(tileCapacity(w)[index]).toBeGreaterThan(1);
    const added=editWorld(w,founder.x,founder.y,{kind:'spawn',species:'human'});
    expect(added).not.toBe(w);
    expect(residentIndex(added.agents,w.width).get(index)?.length).toBe(2);
    expect(isWorld(added)).toBe(true);
    const evolved=stepWorld(added);
    expect(isWorld(evolved)).toBe(true);
    let filled=added;
    while((residentIndex(filled.agents,w.width).get(index)?.length??0)<
      tileCapacity(filled)[index]){
      filled=editWorld(filled,founder.x,founder.y,{kind:'spawn',species:'human'});
    }
    expect(editWorld(filled,founder.x,founder.y,{kind:'spawn',species:'human'}))
      .toBe(filled);
    const outsider=filled.agents.find(a=>a.x!==founder.x||a.y!==founder.y)!;
    const tooCrowded={...filled,agents:filled.agents.map(a=>
      a.id===outsider.id?{...a,x:founder.x,y:founder.y}:a)};
    expect(isWorld(tooCrowded)).toBe(false);
  });

  it('retains one-person wilderness occupancy and scales settlements with map area',()=>{
    const small=createWorld({seed:49,size:'small'});
    const vast=createWorld({seed:49,size:'vast'});
    expect(new Set(tileCapacity(small))).toEqual(new Set([1]));
    expect(settlementSafetyLimit(vast)).toBeGreaterThan(54);
    expect(settlementSafetyLimit(vast)).toBeGreaterThan(settlementSafetyLimit(small));
    const a=small.agents[0];
    expect(editWorld(small,a.x,a.y,{kind:'spawn',species:'human'})).toBe(small);
  });
});
