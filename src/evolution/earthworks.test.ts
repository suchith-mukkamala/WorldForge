import {describe,expect,it} from 'vitest';
import {advanceWorld,createWorld,isWorld,type Settlement,type World} from './engine';
import {advanceEarthworks,validEarthworks} from './earthworks';
import {topographyForWorld} from './topography';
import {compactWorld,readSavedWorld} from './storage';

function townWithSlope():World{
  const w=createWorld({size:'small',seed:414});
  const builder=w.agents.find(a=>a.x<w.width-1&&
    w.tiles[a.y*w.width+a.x+1].biome!=='water')!;
  const cut=builder.y*w.width+builder.x,fill=cut+1;
  builder.energy=90;builder.health=95;
  const s:Settlement={id:w.nextSettlementId++,name:'Cutbank',
    species:builder.species,x:builder.x,y:builder.y,founded:0,
    population:3,stores:12,emptyYears:0,
    infrastructure:{land:[cut,fill],roads:[cut],buildings:[],
      stock:{wood:6,stone:3,clay:4},nextBuildingId:1,
      foundedWithResidents:3}};
  w.settlements=[s];
  builder.work={job:'builder',settlementId:s.id};
  w.topography={version:1,heights:[...topographyForWorld(w).heights]};
  w.topography.heights[cut]=140;w.topography.heights[fill]=90;
  w.year=4;
  w.history=[{...w.history[0],year:4}];
  return w;
}

describe('v2.4 autonomous settlement earthworks',()=>{
  it('requires real nearby builders and appropriate years',()=>{
    const w=townWithSlope(),builder=w.agents.find(a=>a.work?.job==='builder')!;
    w.year=3;
    expect(advanceEarthworks(w)).toBe(0);
    w.year=4;builder.energy=20;
    expect(advanceEarthworks(w)).toBe(0);
    builder.energy=90;
    builder.work=undefined;
    expect(advanceEarthworks(w)).toBe(0);
    builder.work={job:'builder',settlementId:w.settlements[0].id};
    expect(advanceEarthworks(w)).toBe(1);
  });
  it('moves soil between adjacent tiles, preserving mass and old snapshots',()=>{
    const w=townWithSlope(),before=w.topography!;
    const cut=w.settlements[0].infrastructure!.land[0];
    const fill=w.settlements[0].infrastructure!.land[1];
    const original=before.heights[cut]+before.heights[fill];
    expect(advanceEarthworks(w)).toBe(1);
    expect(w.topography).not.toBe(before);
    expect(before.heights[cut]).toBe(140);
    expect(before.heights[fill]).toBe(90);
    expect(w.topography!.heights[cut]).toBe(138);
    expect(w.topography!.heights[fill]).toBe(92);
    expect(w.topography!.heights[cut]+w.topography!.heights[fill]).toBe(original);
    expect(w.earthworks).toEqual([{year:4,settlementId:1,
      cut,fill,volume:2}]);
  });
  it('round-trips earthworks through real world saves and rejects tampering',()=>{
    const w=townWithSlope();
    advanceEarthworks(w);
    expect(validEarthworks(w)).toBe(true);
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const invalid={...w,earthworks:[{...w.earthworks![0],fill:-1}]};
    expect(isWorld(invalid)).toBe(false);
    expect(readSavedWorld(compactWorld(invalid))).toBeNull();
  });
  it('keeps a long-running autonomous world valid with evolving terrain',()=>{
    const developed=advanceWorld(createWorld({size:'small',seed:405,
      resourceLevel:1.5}),120);
    expect(developed.year).toBe(120);
    expect(isWorld(developed)).toBe(true);
    expect(validEarthworks(developed)).toBe(true);
    expect(developed.earthworks?.length??0).toBeGreaterThan(0);
    expect(readSavedWorld(compactWorld(developed))).toEqual(developed);
  },30000);
});
