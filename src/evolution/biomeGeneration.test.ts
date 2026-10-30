import {describe,expect,it} from 'vitest';
import {seededBiome,biomeHome} from './biomeGeneration';
import {BIOMES} from './engine';

const layout=(seed:number)=>Array.from({length:64*64},(_,i)=>
  seededBiome(i%64,Math.floor(i/64),64,64,seed));
describe('seeded geography',()=>{
  it('repeats deterministically for a saved world seed',()=>{
    expect(layout(1234)).toEqual(layout(1234));
  });
  it('moves entire forest, mountain and volcanic homelands between seeds',()=>{
    const a=layout(1234),b=layout(9441);
    const changed=a.filter((value,i)=>value!==b[i]).length;
    expect(changed).toBeGreaterThan(64*64*.3);
    expect(biomeHome(1234,'demon')).not.toEqual(biomeHome(9441,'demon'));
  });
  it('preserves every habitat needed by the four founding races',()=>{
    for(const seed of [73,1234,9441,18001]){
      const biomes=new Set(layout(seed));
      for(const biome of BIOMES)expect(biomes.has(biome)).toBe(true);
    }
  });
});
