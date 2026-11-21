import {describe,expect,it} from 'vitest';
import {createWorld,type World} from './engine';
import {Shore,surfaceGrid,VISUAL_TERRAIN_SIDE as SIDE} from './surfaceGrid';
import {worldTreeModel} from './worldTreeArt';
import {WORLD_TREE_BLOCK,WORLD_TREE_CROWN_RADIUS} from './worldTree';
import {TREE_SUBDIVISIONS} from './worldTreeModel';

const world=createWorld({seed:321721,layout:'continents',worldTree:true,regionalGeography:true});
world.ancientSites=[];

describe('World Tree scenery',()=>{
  it('varies foliage by local biome on the same saved site',()=>{
    const inBiome=(biome:World['tiles'][number]['biome'])=>({
      ...world,tiles:world.tiles.map(tile=>tile.biome==='water'?tile:{...tile,biome}),
    });
    const forest=worldTreeModel(inBiome('forest')).model;
    const taiga=worldTreeModel(inBiome('taiga')).model;
    const wetland=worldTreeModel(inBiome('wetland')).model;
    expect(new Set([forest.key,taiga.key,wetland.key]).size).toBe(3);
    const foliageColors=({faces}:typeof forest)=>new Set(faces
      .filter(face=>face.z>20*TREE_SUBDIVISIONS).map(face=>face.color));
    const cool=foliageColors(taiga),leaves=foliageColors(forest);
    expect(cool.size).toBeGreaterThan(20);
    expect([...cool].some(color=>!leaves.has(color))).toBe(true);
    expect(taiga.faces.every(face=>Math.abs(face.x)*WORLD_TREE_BLOCK/TREE_SUBDIVISIONS<=WORLD_TREE_CROWN_RADIUS&&
      Math.abs(face.y)*WORLD_TREE_BLOCK/TREE_SUBDIVISIONS<=WORLD_TREE_CROWN_RADIUS)).toBe(true);
  });

  it('uses finer voxels while keeping the tree at three times its original size',()=>{
    const exact=worldTreeModel(world),draft=worldTreeModel(world,undefined,0,true);
    expect(WORLD_TREE_BLOCK).toBe(.25*3);
    expect(exact.unitScale*WORLD_TREE_BLOCK).toBeLessThan(.25);
    expect(exact.model.faces.length).toBeGreaterThan(draft.model.faces.length*2);
    expect(worldTreeModel(world).model).toBe(exact.model);
  });

  it('raises long roots with gaps and clears existing structures and their approaches',()=>{
    const tree=world.worldTree!,grid=surfaceGrid(world);
    const columns=grid.columns,middleX=(tree.x+.5)*SIDE,middleY=(tree.y+.5)*SIDE;
    const endpoint=grid.rootRise!.findIndex((rise,i)=>rise>0&&
      Math.hypot(i%columns-middleX,Math.floor(i/columns)-middleY)>16*SIDE);
    expect(endpoint).toBeGreaterThanOrEqual(0);
    const x=Math.floor(endpoint%columns/SIDE),y=Math.floor(Math.floor(endpoint/columns)/SIDE);
    expect(grid.treeCover?.has(tree.y*world.width+tree.x+2)).toBe(true);
    expect(grid.treeCover?.has(0)).toBe(false);
    expect([...grid.treeCover!].some(tile=>Math.hypot(tile%world.width-tree.x,
      Math.floor(tile/world.width)-tree.y)>8)).toBe(true);
    const nearStructure=surfaceGrid({...world,ruins:[{x,y} as NonNullable<World['ruins']>[number]]});
    expect(nearStructure.rootRise![endpoint]).toBe(0);
    expect(nearStructure.shore[endpoint]).not.toBe(Shore.rootBark);
    expect(nearStructure.ground[endpoint]).toBe(grid.ground[endpoint]);
  });

  it('fits roots to terrain and keeps shade near the tree',()=>{
    const tree=world.worldTree!;
    const grid=surfaceGrid(world),ground=grid.ground.slice();
    const column=Math.floor((tree.x+.5)*SIDE);
    for(let y=0;y<grid.rows;y++)for(let x=0;x<column;x++){
      const i=y*grid.columns+x;
      ground[i]=Math.max(0,ground[i]-70);
    }
    const fitted=worldTreeModel(world,{...grid,ground},.4).model;
    const flat=worldTreeModel(world,grid).model;
    expect(fitted.faces.some(face=>face.z< -1)).toBe(true);
    expect(flat.faces.every(face=>face.z>=-1)).toBe(true);
    expect(grid.shadow?.some(shade=>shade===3)).toBe(true);
    expect(grid.shadow?.[0]).toBe(0);
  });
});
