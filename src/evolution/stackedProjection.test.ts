import {describe,expect,it} from 'vitest';
import {REALM_RISE,stackedProjection,STACKED_SEA} from './stackedProjection';
import {DEPTH_RISE} from './depthProjection';
import {exposedRock,hangingVines} from './strataRock';

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

  it('keeps the lower render coordinates when the Surface gains skyland headroom',()=>{
    const world={width:96,height:64},realm={width:60,height:40};
    const camera={yaw:45,pitch:42};
    const before=stackedProjection(world,realm,camera,20);
    const skylands=[{id:0,spill:0,islands:[{x:12,y:12,rx:4,ry:3,height:484,depth:40,seed:1,terrain:'grove' as const}]}];
    const after=stackedProjection({...world,skylands},realm,camera,20);
    expect(after.lowerTop).toBeGreaterThan(before.lowerTop);
    expect(after.lower).toEqual(before.lower);
  });

  it('draws uneven walls and leaves a gap below the hanging vines at each orbit angle',()=>{
    const world={width:96,height:64},realm={width:60,height:40};
    for(const pitch of [24,42])for(let yaw=0;yaw<360;yaw+=45){
      const p=stackedProjection(world,realm,{yaw,pitch},20);
      const upper=exposedRock(world,p.surface.frontX,p.surface.frontY,p.upperCrust,41,'surface',
        (x,y)=>p.surface.projectSmooth(x,y,STACKED_SEA));
      const lower=exposedRock(realm,p.lower.frontX,p.lower.frontY,p.lowerCrust,72332,'underworld',
        (x,y)=>p.underneath(x,y,0));
      for(const edges of [upper,lower]){
        const depths=edges.flatMap(edge=>edge.columns.map(col=>col.depth));
        expect(new Set(depths).size).toBeGreaterThan(3);
        expect(Math.max(...depths)-Math.min(...depths)).toBeGreaterThanOrEqual(12);
      }
      const vines=hangingVines(upper,p.lowerTop,41);
      expect(vines.length).toBeGreaterThan(2);
      expect(hangingVines(upper,p.lowerTop,41)).toEqual(vines);
      for(const vine of vines){
        expect(vine.tip-vine.root.y).toBeGreaterThanOrEqual(13);
        expect(vine.tip).toBeLessThanOrEqual(p.lowerTop-13);
      }
    }
  });
});
