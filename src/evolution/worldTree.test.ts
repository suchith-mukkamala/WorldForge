import {describe,expect,it} from 'vitest';
import {adventureMapFor} from './adventureMap';
import {createWorld} from './engine';
import {createMortal} from './divineDescent';
import {compactWorld,readSavedWorld} from './storage';
import {MAX_LANDING_RISE,seaNeighbors} from './shipSave';
import {topographyForWorld} from './topography';
import {Shore,surfaceGrid} from './surfaceGrid';
import {validWorldTree,worldTreeBlocksBuilding} from './worldTree';
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
      expect(world.tiles[tree.y*world.width+tree.x].biome==='water').toBe(tree.approach!==undefined);
      expect(world.ancientSites?.every(site=>!worldTreeBlocksBuilding(tree,site.x,site.y))).toBe(true);
      const map=adventureMapFor(world);
      expect(map.open[tree.y*world.width+tree.x]).toBe(0);
      expect(tree.trail.every(i=>map.open[i])).toBe(true);
      const shore=tree.trail.at(-1)!;
      const {heights}=topographyForWorld(world);
      expect(seaNeighbors(shore,world.width,world.tiles.length)
        .some(i=>world.tiles[i]?.biome==='water'&&
          Math.abs(heights[shore]-heights[i])<=MAX_LANDING_RISE)).toBe(true);
      const base=createWorld({...settings,worldTree:false});
      expect(base.worldTree).toBeUndefined();
      expect(world.topography).not.toEqual(base.topography);
      expect(surfaceGrid(world).shore.includes(Shore.rootTrail)).toBe(true);
    }
  });

  it('spawns offshore for some seeds and keeps a dry approach and landing',()=>{
    let offshore=0,land=0;
    for(let seed=1;seed<=20;seed++){
      const world=createWorld({seed,layout:'archipelago',worldTree:true});
      const tree=world.worldTree!;
      if(tree.approach===undefined){land++;continue;}
      offshore++;
      expect(world.tiles[tree.y*world.width+tree.x].biome).toBe('water');
      expect(world.tiles[tree.approach].biome).not.toBe('water');
      expect(tree.trail.every(i=>world.tiles[i].biome!=='water')).toBe(true);
      expect(readSavedWorld(compactWorld(world))?.worldTree).toEqual(tree);
    }
    expect(offshore).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(0);
  });

  it('saves the landmark and lets a new mortal start on its trail',()=>{
    const world=createWorld({seed:321721,layout:'continents',worldTree:true});
    const {agent,world:started}=createMortal(world,{name:'Root Walker',species:'human',background:'scout',
      appearance:{skin:0,hair:0,hairStyle:0,outfit:'wanderer'}},undefined,undefined,true);
    const tree=world.worldTree!;
    const radius=Math.hypot(agent.x-tree.x,agent.y-tree.y);
    expect(radius>=12||tree.trail.includes(agent.y*world.width+agent.x)).toBe(true);
    expect(adventureMapFor(world).open[agent.y*world.width+agent.x]).toBe(1);
    expect(readSavedWorld(compactWorld(started))?.worldTree).toEqual(world.worldTree);
    expect(validWorldTree({...world.worldTree,trail:[0]},world.width,world.height)).toBe(false);
  });
});
