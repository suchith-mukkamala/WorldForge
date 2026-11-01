import {describe,expect,it} from 'vitest';
import {personSpriteSize} from './personSpriteScale';

describe('person map detail tiers',()=>{
  it('preserves compact characters until close zoom',()=>{
    expect(personSpriteSize(3,false)).toEqual({width:2,height:3,detailed:false});
    expect(personSpriteSize(4.5,true).detailed).toBe(false);
  });
  it('never inflates a mortal just because the camera gets closer',()=>{
    const medium=personSpriteSize(5,false);
    const close=personSpriteSize(7,false);
    expect(medium).toEqual({width:2,height:3,detailed:true});
    expect(close).toEqual({width:2,height:3,detailed:true});
    expect(personSpriteSize(8,true)).toEqual({width:2,height:3,detailed:true});
  });
});
