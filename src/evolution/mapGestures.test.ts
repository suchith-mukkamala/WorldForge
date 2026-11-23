import {describe,expect,it} from 'vitest';
import {boundedMapZoom,captureWorldZoomAnchor,gestureZoomFactor,MAX_ATLAS_ZOOM,stepAtlasZoom,
  isMapPanDrag,mapScrollForDrag,restoreWorldZoomAnchor} from './mapGestures';

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
    expect(boundedMapZoom(99)).toBe(MAX_ATLAS_ZOOM);
    expect(boundedMapZoom(Infinity)).toBe(1);
    expect(boundedMapZoom(NaN)).toBe(1);
    expect(boundedMapZoom(2.12349)).toBe(2.123);
    expect(gestureZoomFactor(100000,0)).toBeGreaterThan(0);
  });
  it('steps quickly through high zoom and caps at 24×',()=>{
    expect(stepAtlasZoom(1,1)).toBe(1.5);
    expect(stepAtlasZoom(8,1)).toBe(10);
    expect(stepAtlasZoom(10,-1)).toBe(8);
    expect(stepAtlasZoom(23,1)).toBe(24);
  });
  it('treats small movements as inspection clicks and longer drags as panning',()=>{
    expect(isMapPanDrag(0,0)).toBe(false);
    expect(isMapPanDrag(3,4)).toBe(false);
    expect(isMapPanDrag(6,0)).toBe(true);
    expect(isMapPanDrag(-12,8)).toBe(true);
    expect(mapScrollForDrag({scrollLeft:320,scrollTop:175},
      {x:40,y:-20})).toEqual({x:280,y:195});
  });
});
