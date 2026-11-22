import {describe,expect,it} from 'vitest';
import {REALM_RISE,stackedProjection,STACKED_SEA} from './stackedProjection';
import {DEPTH_RISE} from './depthProjection';

describe('Stacked world projection',()=>{
  it('puts both grids on the same footprint with a negative Underworld elevation',()=>{
    const world={width:160,height:104},realm={width:99,height:64};
    for(const yaw of [0,45,135,225,315]){
      const p=stackedProjection(world,realm,{yaw,pitch:24},19);
      expect(p.datum).toBeLessThan(STACKED_SEA);
      for(const [x,y] of [[-.5,-.5],[world.width-.5,-.5],
        [world.width-.5,world.height-.5],[-.5,world.height-.5],[24,38]]){
        const rx=(x+.5)*realm.width/world.width-.5;
        const ry=(y+.5)*realm.height/world.height-.5;
        const a=p.surface.projectSmooth(x,y,STACKED_SEA);
        const b=p.underneath(rx,ry,0);
        expect(b.x).toBeCloseTo(a.x,8);
        expect(b.y+p.lowerTop-a.y).toBeCloseTo((STACKED_SEA-p.datum)*p.surface.riseScale/DEPTH_RISE,8);
      }
    }
  });

  it('fits the rock relief below the upper canvas at every tilt',()=>{
    for(const pitch of [24,42])for(const yaw of [0,90,180,270]){
      const world={width:96,height:64},realm={width:60,height:40};
      const p=stackedProjection(world,realm,{yaw,pitch},20);
      expect(p.lowerTop).toBeGreaterThan(p.surface.size.height);
      const p0=p.underneath(2,3,0),p1=p.underneath(2,3,9);
      expect(p0.x).toBeCloseTo(p1.x,8);
      expect(p0.y-p1.y).toBeCloseTo(9*REALM_RISE*p.surface.riseScale/DEPTH_RISE,8);
      for(const [x,y] of [[-.5,-.5],[realm.width-.5,-.5],
        [realm.width-.5,realm.height-.5],[-.5,realm.height-.5]]){
        expect(p.underneath(x,y,20).y).toBeGreaterThan(0);
        expect(p.underneath(x,y,0).y+p.lowerCrust).toBeLessThan(p.lowerHeight);
      }
    }
  });
});
