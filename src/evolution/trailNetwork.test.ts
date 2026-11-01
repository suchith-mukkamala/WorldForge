import {describe,expect,it} from 'vitest';
import {VISIBLE_TRAIL_WEAR,wornPathTiles} from './trailNetwork';

describe('v2.4.5 — only meaningful, narrow travel paths appear',()=>{
  const width=24,height=24;
  const index=(x:number,y:number)=>y*width+x;

  it('ignores one-off steps and disconnected scars',()=>{
    const worn=wornPathTiles([
      {index:index(3,3),wear:100},
      {index:index(10,10),wear:VISIBLE_TRAIL_WEAR-1},
      {index:index(18,12),wear:80},
    ],width,height);
    expect(worn.size).toBe(0);
  });

  it('retains a real corridor of repeated walking and is order-independent',()=>{
    const corridor=Array.from({length:9},(_,i)=>({index:index(i+3,8),wear:24}));
    const output=wornPathTiles(corridor,width,height);
    expect([...output].sort((a,b)=>a-b)).toEqual(
      corridor.map(t=>t.index).sort((a,b)=>a-b));
    expect([...wornPathTiles([...corridor].reverse(),width,height)].sort())
      .toEqual([...output].sort());
  });

  it('thins a packed settlement square instead of filling it with roads',()=>{
    const block=Array.from({length:10*10},(_,i)=>({
      index:index(4+i%10,4+Math.floor(i/10)),wear:99,
    }));
    const output=wornPathTiles(block,width,height);
    expect(output.size).toBeLessThan(block.length/4);
  });

  it('never connects around the left or right edge of the world',()=>{
    const segments=[index(0,3),index(23,2),index(0,4),index(23,3)];
    expect(wornPathTiles(segments.map(i=>({index:i,wear:50})),width,height).size)
      .toBe(0);
  });
});
