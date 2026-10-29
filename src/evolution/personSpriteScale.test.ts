import {describe,expect,it} from 'vitest';
import {personSpriteSize} from './personSpriteScale';

describe('person map detail tiers',()=>{
  it('preserves compact characters until close zoom',()=>{
    expect(personSpriteSize(3,false)).toEqual({width:3,height:5,detailed:false});
    expect(personSpriteSize(4.5,true).detailed).toBe(false);
  });
  it('reveals the native sprite as the camera gets closer',()=>{
    const medium=personSpriteSize(5,false);
    const close=personSpriteSize(7,false);
    expect(medium).toEqual({width:9,height:13,detailed:true});
    expect(close).toEqual({width:13,height:18,detailed:true});
    expect(personSpriteSize(8,true)).toEqual({width:15,height:21,detailed:true});
  });
});
