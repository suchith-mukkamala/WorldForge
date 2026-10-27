import {describe,expect,it} from 'vitest';
import {createWorld,editWorld,isWorld,stepWorld,type World} from './engine';
import {prepareInfrastructure,advanceConstruction} from './construction';
import {createDeposits,harvestDeposit,RESOURCE_KINDS,
  REGENERATION,regrowDeposits} from './resources';
import {compactWorld,readSavedWorld} from './storage';
import {dominantSpecies,mixAncestry,pureAncestry} from './family';

describe('v0.7.1 renewable trees and mineral resources',()=>{
  it('generates deterministic physical deposits, with stone as the common mineral',()=>{
    const w=createWorld({size:'small',seed:918});
    expect(w.deposits).toEqual(createDeposits(w));
    expect(w.deposits?.length).toBeGreaterThan(300);
    expect(new Set(w.deposits?.map(d=>d.index)).size).toBe(w.deposits?.length);
    expect(w.deposits?.every(d=>w.tiles[d.index].biome!=='water')).toBe(true);
    const count=(k:string)=>w.deposits!.filter(d=>d.kind===k).length;
    expect(count('stone')).toBeGreaterThan(count('iron'));
    expect(count('stone')).toBeGreaterThan(count('gold'));
    expect(count('tree')).toBeGreaterThan(100);
    for(const kind of RESOURCE_KINDS)expect(count(kind)).toBeGreaterThan(0);
    expect(isWorld(w)).toBe(true);
  });

  it('harvests finite quantities and regrows trees faster than precious ore',()=>{
    const w=createWorld({seed:143,size:'small'});
    const tree=w.deposits!.find(d=>d.kind==='tree')!;
    const gold=w.deposits!.find(d=>d.kind==='gold')!;
    expect(harvestDeposit(tree,100)).toBeGreaterThan(0);
    expect(harvestDeposit(gold,100)).toBeGreaterThan(0);
    expect(tree.amount).toBe(0);
    expect(gold.amount).toBe(0);
    expect(REGENERATION.tree).toBeGreaterThan(REGENERATION.gold);
    regrowDeposits(w);
    expect(tree.amount).toBeGreaterThan(gold.amount);
    for(let i=0;i<2000;i++)regrowDeposits(w);
    expect(tree.amount).toBe(tree.capacity);
    expect(gold.amount).toBe(gold.capacity);
    expect(isWorld(w)).toBe(true);
  });

  it('tracks direct mining without inventing materials or extracting from water',()=>{
    const w=createWorld({size:'small',seed:310});
    const center=w.agents.find(a=>a.species==='human'&&a.age>=16)!;
    center.development!.career='forager';
    const s={id:w.nextSettlementId++,name:'Orewatch',species:'human' as const,
      x:center.x,y:center.y,founded:w.year,population:6,stores:20,emptyYears:0};
    w.settlements.push(s);
    prepareInfrastructure(w);
    const infra=w.settlements[0].infrastructure!;
    const snapshot=new Map(w.deposits!.map(d=>[d.index,d.amount]));
    advanceConstruction(w,[]);
    expect(w.deposits!.every(d=>d.amount<=snapshot.get(d.index)!)).toBe(true);
    const extracted=w.deposits!.some(d=>d.amount<snapshot.get(d.index)!);
    expect(extracted).toBe(true);
    expect(infra.oreStock).toBeDefined();
    expect(isWorld(w)).toBe(true);
  });

  it('updates deposits when terrain changes and preserves old saves',()=>{
    const w=createWorld({seed:62,size:'small'});
    const d=w.deposits!.find(d=>d.kind==='stone')!;
    const edited=editWorld(w,d.index%w.width,Math.floor(d.index/w.width),
      {kind:'terrain',biome:'water'});
    expect(edited.deposits?.some(v=>v.index===d.index)).toBe(false);
    expect(w.deposits?.some(v=>v.index===d.index)).toBe(true);
    const legacy:World={...w,deposits:undefined};
    expect(isWorld(legacy)).toBe(true);
    const upgraded=stepWorld(legacy);
    expect(upgraded.deposits?.length).toBeGreaterThan(0);
    expect(readSavedWorld(compactWorld(upgraded))).toEqual(upgraded);
  });

  it('initializes the new mineral inventory when loading v0.7 settlements',()=>{
    const w=createWorld({seed:90,size:'small'});
    const a=w.agents.find(a=>a.species==='elf')!;
    w.settlements.push({id:w.nextSettlementId++,name:'Old Grove',species:'elf',
      x:a.x,y:a.y,founded:0,population:8,stores:30,emptyYears:0});
    prepareInfrastructure(w);
    w.settlements[0].infrastructure!.oreStock=undefined;
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const upgraded=stepWorld(w);
    expect(upgraded.settlements[0].infrastructure?.oreStock).toEqual({
      coal:expect.any(Number),copper:expect.any(Number),
      iron:expect.any(Number),gold:expect.any(Number)});
    expect(isWorld(upgraded)).toBe(true);
  });

  it('uses a seeded tie breaker rather than always classifying mixed children as human',()=>{
    const half=mixAncestry(pureAncestry('human'),pureAncestry('demon'));
    expect(dominantSpecies(half,.1)).toBe('human');
    expect(dominantSpecies(half,.9)).toBe('demon');
    expect(dominantSpecies(pureAncestry('elf'),.9)).toBe('elf');
  });

  it('allows more than 850 living people if free habitable tiles exist',()=>{
    let w=createWorld({seed:19,size:'small',starting:{human:0,elf:0,dwarf:0,demon:0}});
    const candidates=w.tiles.flatMap((tile,index)=>tile.biome==='water'?[]:[index]);
    for(const index of candidates.slice(0,865))
      w=editWorld(w,index%w.width,Math.floor(index/w.width),
        {kind:'spawn',species:'human'});
    expect(w.agents.length).toBe(865);
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))?.agents).toHaveLength(865);
  },30000);
});
