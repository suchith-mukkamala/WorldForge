import {describe,expect,it} from 'vitest';
import {createWorld,DEFAULT_SETTINGS} from './engine';
import {freshWorldSeed} from './worldSeeds';

describe('v2.4.1 new-world seeds',()=>{
  it('chooses valid seeds and never silently repeats the current world',()=>{
    expect(freshWorldSeed(1,()=>0)).toBe(2);
    expect(freshWorldSeed(2147483647,()=>1)).toBe(1);
    expect(freshWorldSeed(42,()=>.5)).toBeGreaterThan(1);
    for(let i=0;i<30;i++){
      const seed=freshWorldSeed(DEFAULT_SETTINGS.seed);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(2147483647);
      expect(seed).not.toBe(DEFAULT_SETTINGS.seed);
    }
  });
  it('generates different geography but preserves replay for chosen seeds',()=>{
    const a=createWorld({size:'small',seed:1234});
    const b=createWorld({size:'small',seed:9441});
    const changed=a.tiles.filter((tile,i)=>tile.biome!==b.tiles[i].biome).length;
    expect(changed).toBeGreaterThan(a.tiles.length*.25);
    expect(createWorld({size:'small',seed:1234})).toEqual(a);
  });
});
