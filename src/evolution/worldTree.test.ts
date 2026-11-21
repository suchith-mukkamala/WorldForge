import {describe,expect,it} from 'vitest';
import {adventureMapFor} from './adventureMap';
import {createWorld} from './engine';
import {createMortal} from './divineDescent';
import {compactWorld,readSavedWorld} from './storage';
import {Shore,surfaceGrid} from './surfaceGrid';
import {validWorldTree} from './worldTree';
import {WORLD_LAYOUTS} from './worldGeography';

describe('World Tree',()=>{
  it('generates a reproducible grove and a walkable route to the sea in every layout',()=>{
    for(const layout of WORLD_LAYOUTS){
      const settings={seed:321721,size:'small',layout,worldTree:true,regionalBiomes:true,
        regionalGeography:true,riverlands:true,climateEcology:true} as const;
      const world=createWorld(settings),tree=world.worldTree!;
      expect(tree).toBeDefined();
      expect(tree).toEqual(createWorld(settings).worldTree);
      expect(validWorldTree(tree,world.width,world.height)).toBe(true);
      expect(world.tiles[tree.y*world.width+tree.x].biome).not.toBe('water');
      const map=adventureMapFor(world);
      expect(map.open[tree.y*world.width+tree.x]).toBe(0);
      expect(tree.trail.every(i=>map.open[i])).toBe(true);
      const shore=tree.trail.at(-1)!;
      expect([shore-world.width,shore+world.width,shore-1,shore+1]
        .some(i=>world.tiles[i]?.biome==='water')).toBe(true);
      const base=createWorld({...settings,worldTree:false});
      expect(base.worldTree).toBeUndefined();
      expect(world.topography).not.toEqual(base.topography);
      expect(surfaceGrid(world).shore.includes(Shore.rootTrail)).toBe(true);
    }
  });

  it('saves the landmark and lets a new mortal start on its trail',()=>{
    const world=createWorld({seed:321721,layout:'continents',worldTree:true});
    const {agent,world:started}=createMortal(world,{name:'Root Walker',species:'human',background:'scout',
      appearance:{skin:0,hair:0,hairStyle:0,outfit:'wanderer'}},undefined,undefined,true);
    expect(world.worldTree!.trail.slice(0,4)).toContain(agent.y*world.width+agent.x);
    expect(readSavedWorld(compactWorld(started))?.worldTree).toEqual(world.worldTree);
    expect(validWorldTree({...world.worldTree,trail:[0]},world.width,world.height)).toBe(false);
  });
});
