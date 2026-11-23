import {describe,expect,it} from 'vitest';
import {createWorld} from './engine';
import {compactWorld,readSavedWorld} from './storage';
import {seaNeighbors} from './shipSave';
import {RealmBiome,realmWalkable,underworldMap} from './underworld';

const make=(seed:number)=>createWorld({seed,size:'small',layout:'archipelago',
  volcanicWorld:true,worldTree:true,floatingIslands:true,
  starting:{human:0,elf:0,dwarf:0,demon:0}});

describe('Seeded Underworld geography',()=>{
  it('recreates the same geography and coordinates from the seed and saved world',()=>{
    const world=make(41),map=underworldMap(world)!;
    expect(world.underworld?.geography).toBe(1);
    expect(underworldMap(make(41))).toEqual(map);
    const restored=readSavedWorld(compactWorld(world))!;
    expect(restored.underworld?.geography).toBe(1);
    expect(underworldMap(restored)).toEqual(map);
  });

  it('changes the landscape across and within layout families while keeping usable ports and paths',()=>{
    const maps=[1,2,3,4].map(seed=>underworldMap(make(seed))!);
    expect(maps.map(map=>map.layout)).toEqual(['rift','isles','lakes','rift']);
    expect(maps[0].heights).not.toEqual(maps[3].heights);
    for(const flipX of [false,true])for(const flipY of [false,true]){
      const {width,height}=maps[0];
      const differs=maps[0].biomes.some((biome,i)=>{
        const u=i%width,v=Math.floor(i/width);
        const x=flipX?width-1-u:u,y=flipY?height-1-v:v;
        return (biome===RealmBiome.sea)!==(maps[3].biomes[y*width+x]===RealmBiome.sea);
      });
      expect(differs).toBe(true);
    }
    for(const map of maps){
      const reach=(start:number,pass:(i:number)=>boolean)=>{
        const seen=new Set([start]),queue=[start];
        for(const i of queue)for(const j of seaNeighbors(i,map.width,map.biomes.length)){
          if(j>=0&&!seen.has(j)&&pass(j)){seen.add(j);queue.push(j);}
        }
        return seen;
      };
      const walkable=(i:number)=>realmWalkable(map,i,0);
      const land=reach(map.links[0].cell,walkable);
      expect([...map.links.map(link=>link.cell),...map.towns.map(town=>town.index)]
        .every(i=>land.has(i))).toBe(true);
      const port=map.towns.find(town=>town.berth!==undefined)!;
      const water=reach(port.berth!,i=>map.biomes[i]===RealmBiome.sea);
      expect(water.size).toBeGreaterThan(30);
      expect([...water].some(i=>seaNeighbors(i,map.width,map.biomes.length)
        .some(j=>!land.has(j)&&walkable(j)))).toBe(true);
    }
  });
});
