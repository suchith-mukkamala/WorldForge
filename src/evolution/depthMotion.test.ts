import {describe,expect,it} from 'vitest';
import {createDepthProjector,interpolatedGroundHeight} from './depthProjection';

describe('v2.5.1.2 — sub-tile mortal travel on sloped terrain',()=>{
  it('interpolates terrain height at fractional visual positions',()=>{
    const heights=Uint8Array.from([0,100,100,200]);
    expect(interpolatedGroundHeight(heights,2,2,0,0)).toBe(0);
    expect(interpolatedGroundHeight(heights,2,2,1,1)).toBe(200);
    expect(interpolatedGroundHeight(heights,2,2,.5,.5)).toBe(100);
    expect(interpolatedGroundHeight(heights,2,2,.25,.25)).toBe(50);
    expect(interpolatedGroundHeight(heights,2,2,-5,0)).toBe(0);
    expect(interpolatedGroundHeight(heights,2,2,5,5)).toBe(200);
  });

  it('projects fractional height without rounding away movement frames',()=>{
    const projection=createDepthProjector({width:8,height:8},2.5);
    const from=projection.projectSmooth(2.25,3.5,100);
    const to=projection.projectSmooth(2.25,3.5,100.5);
    expect(to.y).toBeLessThan(from.y);
    expect(to.x).toBe(from.x);
    expect(Math.abs(projection.project(2.25,3.5,100).y-from.y))
      .toBeLessThanOrEqual(.5);
  });
});
