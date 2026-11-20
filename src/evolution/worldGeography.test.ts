import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,population,WORLD_SIZES} from './engine';
import {generateSeedTerrain,geographyForSeed,landmassCount} from './worldGeography';
import {compactWorld,readSavedWorld} from './storage';
import {coastalDepth} from './oceanDepth';
import {generateWorldLandscape} from './worldLandscape';

describe('seeded world geography',()=>{
  const [width,height]=WORLD_SIZES.small;
  it('produces distinct continents and archipelagos across seeds',()=>{
    const layouts=new Set<string>();
    for(const seed of [1,7,43,66,4099,9441,33091,2147483647]){
      const continents=generateSeedTerrain(width,height,seed,'continents');
      const islands=generateSeedTerrain(width,height,seed,'archipelago');
      expect(landmassCount(width,height,continents.biomes)).toBe(2);
      const count=landmassCount(width,height,islands.biomes);
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(6);
      expect(new Set(islands.biomes).size).toBe(7);
      const edge=islands.biomes.filter((_,i)=>i<width||i>=width*(height-1)||
        i%width===0||i%width===width-1);
      expect(edge.every(b=>b==='water')).toBe(true);
      layouts.add(geographyForSeed(seed,'varied'));
    }
    expect(layouts.size).toBe(2);
    const a=generateSeedTerrain(width,height,4099,'archipelago');
    expect(generateSeedTerrain(width,height,4099,'archipelago')).toEqual(a);
    const b=generateSeedTerrain(width,height,9441,'archipelago');
    expect(a.biomes.filter((biome,i)=>biome!==b.biomes[i]).length)
      .toBeGreaterThan(width*height*.25);
  });

  it('starts the requested populations on the previewed terrain and saves the layout',()=>{
    const starting={human:75,elf:75,dwarf:75,demon:75};
    const world=createWorld({seed:4099,size:'small',layout:'archipelago',starting});
    expect(population(world)).toEqual(starting);
    expect(world.agents.every(a=>world.tiles[a.y*width+a.x].biome!=='water')).toBe(true);
    expect(world.tiles.map(tile=>tile.biome)).toEqual(
      generateSeedTerrain(width,height,4099,'archipelago').biomes);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
    expect(createWorld(world.settings)).toEqual(world);
    expect(isWorld({...world,settings:{...world.settings,layout:'unknown'}})).toBe(false);
  });

  it('preserves classic replay for saves without a geography setting',()=>{
    const legacy=createWorld({seed:8191,size:'small'});
    const classic=createWorld({...legacy.settings,layout:'classic'});
    expect(classic.tiles).toEqual(legacy.tiles);
    expect(classic.agents).toEqual(legacy.agents);
    expect(classic.rngState).toBe(legacy.rngState);
    expect(readSavedWorld(compactWorld(legacy))).toEqual(legacy);
  });

  it('previews, generates and saves regional habitats and their landmarks',()=>{
    const settings={seed:321721,size:'small',layout:'continents',landforms:'varied',
      regionalGeography:true,regionalBiomes:true,livingBiomes:true,terrainCells:true} as const;
    const preview=generateWorldLandscape(width,height,settings),world=createWorld(settings);
    const legacy=generateWorldLandscape(width,height,{...settings,regionalBiomes:false});
    expect(world.tiles.map(tile=>tile.biome)).toEqual(preview.biomes);
    expect(world.topography).toEqual(legacy.topography);
    for(const biome of ['taiga','wetland','savanna']){
      expect(preview.biomes.filter(b=>b===biome).length).toBeGreaterThan(50);
      expect(legacy.biomes).not.toContain(biome);
    }
    for(const kind of ['watchtower','standing-stones'])
      expect(world.ancientSites?.some(site=>site.kind===kind)).toBe(true);
    const restored=readSavedWorld(compactWorld(world));
    expect(restored?.settings.regionalBiomes).toBe(true);
    expect(restored?.tiles).toEqual(world.tiles);
    expect(restored?.ancientSites).toEqual(world.ancientSites);
    expect(restored?.terrainCells).toEqual(world.terrainCells);
  });

  it('shades open water by its real distance from land without wrapping map edges',()=>{
    const width=7,height=3,land=width+1;
    const depth=coastalDepth(width,height,i=>i!==land);
    expect(depth[land]).toBe(0);
    expect(depth[land+1]).toBe(1);
    expect(depth[land+2]).toBe(2);
    expect(depth[width-1]).toBe(5);
  });
});
