import {describe,expect,it} from 'vitest';
import {createWorld,type Biome,type World} from './engine';
import {createDepthProjector} from './depthProjection';
import {depthGroundHeight,depthTerrain,pickTerrainFace,projectedTerrainCorners} from './depthTerrain';

function terrain(heights:number[],biomes:Biome[]=heights.map(()=>'plains')):World{
  return {...createWorld({size:'small',starting:{human:0,elf:0,dwarf:0,demon:0}}),
    width:heights.length,height:1,
    tiles:biomes.map(biome=>({biome,food:0})),topography:{version:1,heights}};
}

describe('raised atlas terrain',()=>{
  it('joins gentle neighbors while preserving true rock faces as the camera orbits',()=>{
    const world=terrain([54,65,140]);
    const mesh=depthTerrain(world);
    for(const yaw of [0,85,135,225,310]){
      const projector=createDepthProjector(world,2.5,{yaw,pitch:30});
      const a=projectedTerrainCorners(mesh,projector,world.width,0);
      const b=projectedTerrainCorners(mesh,projector,world.width,1);
      const c=projectedTerrainCorners(mesh,projector,world.width,2);
      expect(a[1]).toEqual(b[0]);expect(a[2]).toEqual(b[3]);
      expect(c[0].y).toBeLessThan(b[1].y);
    }
    expect(depthGroundHeight(world,.499,0)).toBeCloseTo(depthGroundHeight(world,.501,0),1);
    expect(depthGroundHeight(world,2,0)).toBe(140);
  });

  it('keeps water level and slopes a gentle bank to the shore',()=>{
    const world=terrain([39,60],['water','plains']);
    expect([...depthTerrain(world).corners.slice(0,4)]).toEqual([39,39,39,39]);
    expect(depthGroundHeight(world,.5,0)).toBe(39);
    expect(depthGroundHeight(world,.75,0)).toBeGreaterThan(39);
  });

  it('picks the topmost rendered face exactly where two faces overlap',()=>{
    const hit={width:8,height:6,ids:new Uint32Array(48)};
    pickTerrainFace(hit,[{x:1.2,y:1.2},{x:6.7,y:1.2},
      {x:6.7,y:5.1},{x:1.2,y:5.1}],708);
    pickTerrainFace(hit,[{x:3.9,y:0},{x:7.1,y:0},{x:7.1,y:3.4},{x:3.9,y:3.4}],1664);
    expect(hit.ids[2*hit.width+2]).toBe(709);
    expect(hit.ids[2*hit.width+4]).toBe(1665);
    expect(hit.ids[4*hit.width+4]).toBe(709);
    expect(hit.ids[0]).toBe(0);
  });
});
