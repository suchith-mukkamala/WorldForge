import {describe,it,expect} from 'vitest';
import {visibleCoastTile} from './worldOutline';
import {createWorld} from './engine';

describe('world silhouette',()=>{
  it('removes square ocean corners without hiding any simulated land',()=>{
    expect(visibleCoastTile(0,0,100,100,'water',43)).toBe(false);
    expect(visibleCoastTile(50,50,100,100,'water',43)).toBe(true);
    expect(visibleCoastTile(0,0,100,100,'forest',43)).toBe(true);
  });
  it('produces a deterministic uneven shoreline and remains pure',()=>{
    const contour=Array.from({length:100},(_,x)=>
      visibleCoastTile(x,7,100,100,'water',71));
    expect(contour).toEqual(Array.from({length:100},(_,x)=>
      visibleCoastTile(x,7,100,100,'water',71)));
    expect(contour.some(v=>!v)).toBe(true);
  });
  it('generates inhabitable island worlds without a square land boundary',()=>{
    const world=createWorld({seed:293,size:'small'});
    const w=world.width,h=world.height;
    for(const i of [0,w-1,w*(h-1),w*h-1])
      expect(world.tiles[i].biome).toBe('water');
    expect(world.agents.length).toBeGreaterThan(0);
    expect(world.agents.every(a=>world.tiles[a.y*w+a.x].biome!=='water'))
      .toBe(true);
  });
});
