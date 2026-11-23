import {expect,it} from 'vitest';
import {paintCaveRoof} from './caveCutawayArt';
import type {Point} from './motion';
import {stackedProjection} from './stackedProjection';

it('keeps ceiling rock shallow and entirely above the Underworld view at every angle',()=>{
  const world={width:96,height:64},map={width:60,height:40,seed:72332};
  const plan={clearance:Uint8Array.from({length:map.width*map.height},(_,i)=>24+i%59)};
  for(const pitch of [24,42])for(let yaw=0;yaw<360;yaw+=45){
    const view=stackedProjection(world,map,{yaw,pitch},28);
    const faces:Point[][]=[];
    const vertex=(x:number,y:number)=>faces.at(-1)!.push({x,y});
    const context={beginPath:()=>faces.push([]),moveTo:vertex,lineTo:vertex,closePath(){},fill(){}};
    paintCaveRoof(context as unknown as CanvasRenderingContext2D,view,map,plan,world);

    expect(faces.length).toBeGreaterThan(100);
    const vertices=faces.flat();
    expect(Math.max(...vertices.map(point=>point.y))).toBeLessThanOrEqual(view.lowerTop-13.9);
    expect(Math.max(...faces.map(face=>{
      const heights=face.map(point=>point.y);
      return Math.max(...heights)-Math.min(...heights);
    }))).toBeLessThan(view.upperCrust*1.65);
  }
});
