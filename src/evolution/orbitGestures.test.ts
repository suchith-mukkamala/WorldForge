import {describe,expect,it} from 'vitest';
import {yawForRightDrag} from './orbitGestures';

describe('2.5D right-button orbit drag',()=>{
  it('rotates in stable 15-degree steps without tiny jitter',()=>{
    expect(yawForRightDrag(30,5)).toBe(30);
    expect(yawForRightDrag(30,25)).toBe(45);
    expect(yawForRightDrag(30,50)).toBe(60);
    expect(yawForRightDrag(30,-25)).toBe(15);
  });
  it('wraps in both directions through north',()=>{
    expect(yawForRightDrag(345,24)).toBe(0);
    expect(yawForRightDrag(0,-24)).toBe(345);
  });
});
