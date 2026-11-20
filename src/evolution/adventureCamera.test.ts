import {describe,expect,it} from 'vitest';
import {adventureCamera,adventureFrameSize,facingActions} from './adventureCamera';

describe('the adventure view',()=>{
  it('scrolls by one tile while keeping the player framed on both viewport sizes',()=>{
    for(const size of [adventureFrameSize(810,480),adventureFrameSize(375,330)]){
      const bounds={width:1920,height:1920};
      const feet={x:780,y:450},origin=adventureCamera(feet,size,bounds);
      expect(feet.x-origin.x).toBe(size.width/2);
      expect(feet.y-origin.y).toBeCloseTo(size.height*.57,0);
      expect(adventureCamera({x:feet.x+24,y:feet.y},size,bounds).x-origin.x).toBe(24);
    }
    expect(adventureCamera({x:10,y:8},{width:312,height:184},
      {width:360,height:300})).toEqual({x:0,y:0});
  });

  it('puts the target one tile in front first and preserves the nearby fallback',()=>{
    const actions=[{label:'Trail',point:{x:5,y:9}},
      {label:'Door',point:{x:6,y:9}},{label:'Resident',point:{x:4,y:8}}];
    expect(facingActions(actions,{x:5,y:9},'east').map(a=>a.label))
      .toEqual(['Door','Trail','Resident']);
    expect(facingActions(actions,{x:5,y:9},'north')).toBe(actions);
  });
});
