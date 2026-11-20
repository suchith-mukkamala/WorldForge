import {describe,expect,it} from 'vitest';
import {coastalLife,fishPose} from './coastalLife';
import {createWorld} from './engine';
import {hydrologyForWorld} from './hydrology';
import {coastalDepth} from './oceanDepth';
import {oceanBasins} from './regionalGeography';
import {compactWorld,readSavedWorld} from './storage';
import {Shore,surfaceGrid,VISUAL_TERRAIN_SIDE} from './surfaceGrid';

const world=createWorld({size:'small',seed:321721,layout:'continents',riverlands:true,
  regionalGeography:true,regionalBiomes:true,landforms:'varied',
  starting:{human:0,elf:0,dwarf:0,demon:0}});

describe('Coastal life',()=>{
  it('paints coral in shallow seawater and derives the same reefs from an existing save',()=>{
    const save=compactWorld(world),before=surfaceGrid(world);
    const {width,height,tiles}=world,drainage=hydrologyForWorld(world);
    const depths=coastalDepth(width,height,i=>tiles[i].biome==='water');
    const ocean=oceanBasins(world,drainage);
    let corals=0;
    before.shore.forEach((shore,i)=>{
      if(shore<Shore.reefBase)return;
      corals++;
      const x=Math.floor((i%before.columns)/VISUAL_TERRAIN_SIDE);
      const y=Math.floor(i/before.columns/VISUAL_TERRAIN_SIDE);
      const tile=y*width+x;
      expect(tiles[tile].biome).toBe('water');
      expect(depths[tile]).toBeLessThanOrEqual(2);
      expect(ocean.has(drainage.basin[tile])).toBe(true);
    });
    expect(corals).toBeGreaterThan(0);
    const restored=surfaceGrid(readSavedWorld(save)!).shore;
    expect(before.shore.every((square,i)=>square===restored[i])).toBe(true);
    expect(compactWorld(world)).toBe(save);
  });

  it('wanders and jumps without leaving actual water tiles',()=>{
    const {fish}=coastalLife(world);
    expect(fish.length).toBeGreaterThan(0);
    for(const swimmer of fish){
      const positions=Array.from({length:161},(_,i)=>fishPose(swimmer,i*200));
      expect(new Set(positions.map(p=>p.x+','+p.y)).size).toBeGreaterThan(2);
      expect(positions.some(p=>p.lift>0)).toBe(true);
      expect(positions.some(p=>p.lift===0)).toBe(true);
      for(const p of positions)
        expect(world.tiles[Math.floor(p.y)*world.width+Math.floor(p.x)].biome).toBe('water');
    }
  });
});
