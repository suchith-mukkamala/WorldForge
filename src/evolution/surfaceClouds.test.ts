import {expect,it} from 'vitest';
import {cloudPoses} from './surfaceClouds';

it('drifts and replaces translucent clouds on a repeatable seeded clock',()=>{
  const at=(time:number,seed=41)=>cloudPoses(seed,96,64,time);
  const first=at(0),drifting=at(1_000),later=at(68_000);
  expect(first.length).toBeGreaterThan(2);
  expect(first).toEqual(at(0));
  expect(first).not.toEqual(at(0,31));
  expect(drifting).not.toEqual(first);
  expect(later.map(cloud=>cloud.shape)).not.toEqual(first.map(cloud=>cloud.shape));
  expect([...first,...drifting,...later].every(cloud=>cloud.alpha>0&&cloud.alpha<.60)).toBe(true);
});
