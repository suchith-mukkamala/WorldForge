import {describe,expect,it} from 'vitest';
import {createWorld,type World} from './engine';
import {surfaceGrid,VISUAL_TERRAIN_SIDE as SIDE} from './surfaceGrid';
import {worldTreeModel} from './worldTreeArt';

const world=createWorld({seed:321721,layout:'continents',worldTree:true,regionalGeography:true});

describe('World Tree scenery',()=>{
  it('varies foliage by local biome on the same saved site',()=>{
    const inBiome=(biome:World['tiles'][number]['biome'])=>({
      ...world,tiles:world.tiles.map(tile=>tile.biome==='water'?tile:{...tile,biome}),
    });
    const forest=worldTreeModel(inBiome('forest')).model;
    const taiga=worldTreeModel(inBiome('taiga')).model;
    const wetland=worldTreeModel(inBiome('wetland')).model;
    expect(new Set([forest.key,taiga.key,wetland.key]).size).toBe(3);
    expect(taiga.faces.some(face=>face.color==='#487064')).toBe(true);
    expect(wetland.faces.some(face=>face.color==='#638256')).toBe(true);
    expect(taiga.faces.every(face=>face.x>=-15&&face.x<=14&&face.y>=-15&&face.y<=14)).toBe(true);
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
