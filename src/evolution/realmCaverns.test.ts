import {describe,expect,it} from 'vitest';
import {createWorld} from './engine';
import {hydrologyForWorld} from './hydrology';
import {caveConnections,realmCaverns} from './realmCaverns';
import {realmWildlife} from './realmWildlife';
import {seaNeighbors} from './shipSave';
import {compactWorld,readSavedWorld} from './storage';
import {projectWorldLayer,RealmBiome,realmWalkable,underworldMap} from './underworld';

const worldFor=(seed:number)=>createWorld({seed,size:'small',layout:'archipelago',volcanicWorld:true,
  worldTree:true,riverlands:true,regionalGeography:true,floatingIslands:true,starting:{human:0,elf:0,dwarf:0,demon:0}});

describe('Underworld caverns',()=>{
  it('rebuilds the same vaults on reload, with low passages on the existing floor',()=>{
    const world=worldFor(41),map=underworldMap(world)!;
    const plan=realmCaverns(map),restored=readSavedWorld(compactWorld(world))!;
    expect(realmCaverns(underworldMap(restored)!)).toEqual(plan);
    expect(realmCaverns(underworldMap(worldFor(42))!).clearance).not.toEqual(plan.clearance);
    expect(Math.min(...plan.clearance)).toBeLessThan(25);
    expect(plan.chambers.length).toBeGreaterThanOrEqual(3);
    expect(plan.galleries.length).toBeGreaterThan(1);
    for(const chamber of plan.chambers){
      expect(plan.clearance[chamber.cell]).toBeGreaterThan(66);
      expect(plan.chambers[plan.room[chamber.cell]]?.cell).toBe(chamber.cell);
    }
    for(const path of plan.galleries){
      expect(path[0]).not.toBe(path.at(-1));
      expect(path.at(-1)).toBe(map.towns.find(town=>town.berth!==undefined)?.index);
      expect(path.every((cell,i)=>realmWalkable(map,cell,0)&&!map.fords.has(cell)&&
        (i===0||seaNeighbors(cell,map.width,map.biomes.length).includes(path[i-1])))).toBe(true);
    }
  });

  it('aligns river seeps and skylights with the matching terrain in both layers',()=>{
    const found=new Set<string>();
    for(const seed of [1,2,3,41]){
      const world=worldFor(seed),map=underworldMap(world)!,plan=realmCaverns(map);
      const drainage=hydrologyForWorld(world);
      for(const {kind,surface,cell} of caveConnections(world,map,plan)){
        found.add(kind);
        if(kind==='fault'){
          expect(map.links.some(link=>link.surface===surface&&link.kind==='crater')).toBe(true);
          continue;
        }
        const projected=projectWorldLayer(surface,world,map);
        if(kind==='seep'){
          expect(drainage.channel[surface]>0||map.links.some(link=>link.surface===surface&&link.kind==='falls')).toBe(true);
          expect([projected,...seaNeighbors(projected,map.width,map.biomes.length)]).toContain(cell);
          expect(map.biomes[cell]).toBe(RealmBiome.sea);
        }else{
          expect(projected).toBe(cell);
          expect(world.tiles[surface].biome).not.toBe('water');
          expect(plan.clearance[cell]).toBeGreaterThanOrEqual(42);
          expect(drainage.channel[surface]).toBe(0);
        }
      }
    }
    expect(found).toEqual(new Set(['fault','seep','skylight']));
  });

  it('keeps wildlife paths contiguous and within their seeded habitats',()=>{
    const map=underworldMap(worldFor(41))!,tracks=realmWildlife(map);
    expect(tracks).toEqual(realmWildlife(underworldMap(worldFor(41))!));
    expect(new Set(tracks.map(track=>track.kind))).toEqual(new Set(['fish','glowfly','bat']));
    expect(tracks.length).toBeLessThanOrEqual(24);
    for(const {kind,cells} of tracks){
      expect(cells.length).toBeGreaterThanOrEqual(4);
      for(const [i,cell] of cells.entries()){
        if(i>0)expect(seaNeighbors(cell,map.width,map.biomes.length)).toContain(cells[i-1]);
        if(kind==='fish')expect(map.biomes[cell]).toBe(RealmBiome.sea);
        else if(kind==='glowfly')expect([RealmBiome.glowroot,RealmBiome.steam]).toContain(map.biomes[cell]);
        else expect(realmWalkable(map,cell,0)).toBe(true);
      }
    }
  });
});
