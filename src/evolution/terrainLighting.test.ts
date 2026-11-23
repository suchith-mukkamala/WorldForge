import {describe,expect,it} from 'vitest';
import {coastalLife,wavePose} from './coastalLife';
import {DEFAULT_SETTINGS} from './engine';
import {RealmBiome} from './realmGeography';
import {litCavernPixel,realmLight} from './realmLight';
import {LEVEL_LIGHT,surfaceLight} from './surfaceLight';
import {terrainPixel} from './terrainCellArt';
import type {TerrainSource} from './terrainCells';
import type {RealmMap} from './underworld';

describe('Terrain lighting',()=>{
  it('casts ridge shadows to the south-east on land and water',()=>{
    const width=8,height=8,center=3*width+3,heights=Array(width*height).fill(60);
    heights[center]=144;
    const world:TerrainSource={width,height,settings:DEFAULT_SETTINGS,
      tiles:heights.map((_,i)=>({biome:i===center+width+1?'water':'plains',food:0})),
      topography:{version:1,heights}};
    const light=surfaceLight(world);
    expect(light[center-1]).toBeGreaterThan(LEVEL_LIGHT);
    expect(light[center+width+1]).toBeLessThan(LEVEL_LIGHT);
    expect(light[0]).toBe(LEVEL_LIGHT);
    expect(surfaceLight(world)).toBe(light);
  });

  it('lights the floor beside a lava bank and samples its square edges continuously',()=>{
    const width=9,height=9,biomes=new Uint8Array(width*height).fill(RealmBiome.basalt);
    biomes[4*width+4]=RealmBiome.lava;
    const map:RealmMap={width,height,biomes,heights:new Uint8Array(biomes.length).fill(5),
      seed:41,towns:[],roads:new Set(),bridges:new Set(),fords:new Set(),houses:new Map(),links:[]};
    const light=realmLight(map),stone=terrainPixel('#4e455c');
    const warm=litCavernPixel(light,stone,5,4,.5,.5);
    expect(warm&255).toBeGreaterThan(stone&255);
    expect(litCavernPixel(light,stone,0,0,.5,.5)).toBe(stone);
    expect(litCavernPixel(light,stone,4,4,1,.5)).toBe(litCavernPixel(light,stone,5,4,0,.5));
    expect(realmLight(map)).toBe(light);
  });

  it('keeps seeded animated crests within actual water squares',()=>{
    const width=12,height=12;
    const world:TerrainSource={width,height,settings:DEFAULT_SETTINGS,
      tiles:Array.from({length:width*height},(_,i)=>({biome:i<6*width?'water':'plains',food:0}))};
    const {waves}=coastalLife(world);
    expect(waves.length).toBeGreaterThan(0);
    for(const wave of waves)for(const time of [0,1000,4400]){
      const pose=wavePose(wave,time);
      expect(Math.floor(pose.x)).toBe(wave.x);
      expect(Math.floor(pose.y)).toBe(wave.y);
      expect(world.tiles[wave.y*width+wave.x].biome).toBe('water');
    }
  });
});
