import {describe,expect,it} from 'vitest';
import {createDepthProjector} from './depthProjection';
import {depthTileQuarters,pickTerrainFace,rasterFace,terrainRiverEdge} from './depthTerrain';

describe('raised atlas terrain',()=>{
  it('splits each raised tile into four equal squares at every camera angle',()=>{
    for(const yaw of [0,85,135,225,310]){
      const projector=createDepthProjector({width:3,height:2},2.5,{yaw,pitch:30});
      const squares=depthTileQuarters(projector.tileCorners(1,0,65));
      const bounds=[[.5,1,-.5,0],[1,1.5,-.5,0],[.5,1,0,.5],[1,1.5,0,.5]];
      for(const [i,[left,right,top,bottom]] of bounds.entries()){
        const expected=[projector.project(left,top,65),projector.project(right,top,65),
          projector.project(right,bottom,65),projector.project(left,bottom,65)];
        squares[i].forEach((p,j)=>{
          expect(p.x).toBeCloseTo(expected[j].x,8);
          expect(p.y).toBeCloseTo(expected[j].y,8);
        });
      }
    }
  });

  it('puts each end of a river drop on its own tile edge',()=>{
    const projector=createDepthProjector({width:2,height:1},2.5);
    const upstream=terrainRiverEdge([68,39],projector,2,0,1);
    const downstream=terrainRiverEdge([68,39],projector,2,1,0);
    expect(upstream).toEqual(projector.project(.5,0,68));
    expect(downstream).toEqual(projector.project(.5,0,39));
    expect(upstream.y).toBeLessThan(downstream.y);
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

  it('joins two crisp colors along a shared diagonal on pixel centers',()=>{
    const size={width:6,height:4},pixels=new Uint32Array(24);
    const top={x:1,y:0},bottom={x:5,y:4};
    rasterFace(size,[{x:0,y:0},top,bottom,{x:0,y:4}],pixels,0xff00cfff);
    rasterFace(size,[top,{x:6,y:0},{x:6,y:4},bottom],pixels,0xffffb600);
    expect([...pixels]).toEqual([1,2,3,4].flatMap(n=>[
      ...new Array(n).fill(0xff00cfff),...new Array(6-n).fill(0xffffb600),
    ]));
  });

  it('keeps clipped convex faces at the same pixels in either winding',()=>{
    const size={width:5,height:4};
    const face=[{x:0,y:-2},{x:2,y:-2},{x:4,y:2},{x:4,y:3.5},{x:0,y:3.5}];
    for(const points of [face,[...face].reverse()]){
      const pixels=new Uint32Array(size.width*size.height);
      rasterFace(size,points,pixels,9);
      expect([...pixels]).toEqual([
        9,9,9,0,0,
        9,9,9,9,0,
        9,9,9,9,0,
        0,0,0,0,0,
      ]);
    }
  });
});
