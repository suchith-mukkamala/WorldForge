import {describe,expect,it} from 'vitest';
import {boundedMapZoom,captureWorldZoomAnchor,gestureZoomFactor,
  restoreWorldZoomAnchor} from './mapGestures';

describe('v2.1.6 trackpad gestures',()=>{
  it('keeps the exact terrain point below the fingers after pinch zoom',()=>{
    const old={scrollLeft:470,scrollTop:155,scrollWidth:1600,scrollHeight:900};
    const cursor={x:185,y:207};
    const anchor=captureWorldZoomAnchor(old,cursor);
    const resized=restoreWorldZoomAnchor(anchor,{scrollWidth:3200,scrollHeight:1800});
    expect(resized.x).toBeCloseTo(1125);
    expect(resized.y).toBeCloseTo(517);
    const back=restoreWorldZoomAnchor(anchor,old);
    expect(back.x).toBeCloseTo(old.scrollLeft);
    expect(back.y).toBeCloseTo(old.scrollTop);
  });
  it('zoom factors respond to pixel, line and page gestures both ways',()=>{
    const closer=gestureZoomFactor(-40,0);
    const away=gestureZoomFactor(40,0);
    expect(closer).toBeGreaterThan(1);
    expect(away).toBeLessThan(1);
    expect(closer*away).toBeCloseTo(1);
    expect(gestureZoomFactor(-2,1)).toBeGreaterThan(1);
    expect(gestureZoomFactor(-1,2)).toBeGreaterThan(1);
  });
  it('bounds extreme pinches without allowing NaN or broken canvas sizes',()=>{
    expect(boundedMapZoom(-50)).toBe(1);
    expect(boundedMapZoom(99)).toBe(8);
    expect(boundedMapZoom(Infinity)).toBe(1);
    expect(boundedMapZoom(NaN)).toBe(1);
    expect(boundedMapZoom(2.12349)).toBe(2.123);
    expect(gestureZoomFactor(100000,0)).toBeGreaterThan(0);
  });
});
