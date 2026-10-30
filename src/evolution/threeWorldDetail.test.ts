import {describe,expect,it} from 'vitest';
import {sceneryDetailForZoom,sceneryVariation,threeWorldRasterScale} from './threeWorldDetail';

describe('WebGL scenery detail',()=>{
  it('adds scenery detail as zoom increases',()=>{
    expect([1,1.8,3,3.5,8].map(sceneryDetailForZoom)).toEqual([0,1,1,2,2]);
  });
  it('caps the GPU pixel budget instead of matching extreme magnification',()=>{
    expect(threeWorldRasterScale(0.5)).toBe(1);
    expect(threeWorldRasterScale(2)).toBe(2);
    expect(threeWorldRasterScale(8)).toBe(2.25);
    expect(threeWorldRasterScale(NaN)).toBe(1);
  });
  it('makes seeded decorative variation stable and coordinate dependent',()=>{
    expect(sceneryVariation(17,8,9)).toBe(sceneryVariation(17,8,9));
    expect(sceneryVariation(17,8,9)).not.toBe(sceneryVariation(18,8,9));
    expect(sceneryVariation(17,8,9)).not.toBe(sceneryVariation(17,8,10));
  });
});
