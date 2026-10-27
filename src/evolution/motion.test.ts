import {describe,expect,it} from 'vitest';
import {cameraScrollTarget,canAnimate,directionBetween,motionFrame,
  visualMotionDuration} from './motion';
import {createWorld,isWorld} from './engine';
import {pixelRectsFor} from './pixelArt';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorldforgeApp} from './WorldforgeApp';

describe('WorldForge v1.2 — motion belongs to presentation, never simulation',()=>{
  it('maps actual movement in all four directions, with reproducible diagonal facing',()=>{
    const p={x:8,y:8};
    expect(directionBetween(p,{x:8,y:7})).toBe('north');
    expect(directionBetween(p,{x:8,y:9})).toBe('south');
    expect(directionBetween(p,{x:9,y:8})).toBe('east');
    expect(directionBetween(p,{x:7,y:8})).toBe('west');
    expect(directionBetween(p,{x:10,y:9})).toBe('east');
    expect(directionBetween(p,{x:7,y:7})).toBe('north');
    expect(directionBetween(p,p,'west')).toBe('west');
  });
  it('interpolates positions and footfalls without changing source coordinates',()=>{
    const movement={from:{x:7,y:9},to:{x:10,y:8},
      start:1000,duration:400,facing:'east' as const};
    const before=JSON.stringify(movement);
    expect(motionFrame(movement,1000)).toMatchObject({x:7,y:9,
      walking:true,stride:0,facing:'east'});
    expect(motionFrame(movement,1150)).toMatchObject({x:8.125,y:8.625,
      walking:true,stride:1});
    expect(motionFrame(movement,1400)).toMatchObject({x:10,y:8,
      walking:false,stride:0});
    expect(motionFrame(movement,2000).x).toBe(10);
    expect(JSON.stringify(movement)).toBe(before);
  });
  it('snaps spawn and distant jumps and scales animation to play speed',()=>{
    expect(canAnimate({x:1,y:1},{x:2,y:2})).toBe(true);
    expect(canAnimate({x:1,y:1},{x:1,y:1})).toBe(false);
    expect(canAnimate({x:1,y:1},{x:10,y:10})).toBe(false);
    expect(visualMotionDuration(16)).toBeLessThan(visualMotionDuration(1));
  });
  it('centers and clamps tracking without moving or changing an actual person',()=>{
    const w=createWorld({size:'small',seed:162});
    const person=w.agents[0];const original=JSON.stringify(w);
    const world={x:w.width,y:w.height},content={x:1920,y:1280};
    const viewport={x:640,y:400};
    const target=cameraScrollTarget(person,world,content,viewport);
    expect(target.left).toBeGreaterThanOrEqual(0);
    expect(target.top).toBeGreaterThanOrEqual(0);
    expect(cameraScrollTarget({x:0,y:0},world,content,viewport))
      .toEqual({left:0,top:0});
    expect(cameraScrollTarget({x:w.width-1,y:w.height-1},world,content,viewport))
      .toEqual({left:1280,top:880});
    expect(JSON.stringify(w)).toBe(original);
    expect(isWorld(w)).toBe(true);
  });
  it('shows visibly different directions and walking frames for one identity',()=>{
    const person=createWorld({size:'small',seed:301}).agents[0];
    const south=pixelRectsFor(person,'south',0);
    const north=pixelRectsFor(person,'north',0);
    const east=pixelRectsFor(person,'east',0);
    const west=pixelRectsFor(person,'west',0);
    expect(new Set([JSON.stringify(south),JSON.stringify(north),
      JSON.stringify(east),JSON.stringify(west)]).size).toBe(4);
    expect(pixelRectsFor(person,'east',1)).not.toEqual(east);
  });
  it('offers an accessible follow control without requiring a god command',()=>{
    const markup=renderToStaticMarkup(createElement(WorldforgeApp));
    expect(markup).toContain('⌖ FOLLOW');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('FOLLOW A SELECTED PERSON');
  });
});
