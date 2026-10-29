import {describe,expect,it} from 'vitest';
import {project3DScreen} from './world3DProjection';

describe('3D camera viewport alignment',()=>{
  it('centers a world midpoint in its WebGL viewport at any orbit',()=>{
    for(const yaw of [0,90,180,270]){
      const center=project3DScreen(100,100,49.5,49.5,48,
        {yaw,pitch:30},2.5);
      expect(center.x).toBeCloseTo(.5,3);
      // The camera aims two world-units above sea level, so water sits just
      // below the visual center rather than exactly at the center.
      expect(Math.abs(center.y-.5)).toBeLessThan(.025);
    }
  });
  it('projects distant corners distinctly so scrolling can track a person',()=>{
    const a=project3DScreen(100,100,10,10,70,{yaw:30,pitch:30},2.5);
    const b=project3DScreen(100,100,85,80,70,{yaw:30,pitch:30},2.5);
    expect(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)).toBeGreaterThan(.1);
  });
});
