import {describe,expect,it} from 'vitest';
import {heardReputation,rememberSocialEpisode} from './socialMemory';
import {initialDevelopment} from './development';
import {createWorld} from './engine';

describe('v2.2.6 social memory and local reputation',()=>{
  it('requires a trusted personal friend with firsthand evidence',()=>{
    const own=[{personId:2,meetings:5,regard:18}];
    const reports=(id:number)=>id===2?[{personId:3,meetings:5,regard:-60}]:[];
    expect(heardReputation(1,3,own,[2],reports)).toBeLessThan(-8);
    expect(heardReputation(1,3,own,[],reports)).toBe(0);
    expect(heardReputation(1,3,[{personId:2,meetings:5,regard:-5}],
      [2],reports)).toBe(0);
    expect(heardReputation(1,4,own,[2],reports)).toBe(0);
  });
  it('bounds hearsay and does not invent a global reputation',()=>{
    const own=[{personId:2,meetings:5,regard:10}];
    expect(heardReputation(1,3,own,[2],()=>
      [{personId:3,meetings:20,regard:100}])).toBe(10);
  });
  it('remembers significant real encounters sparingly and compatibly',()=>{
    const w=createWorld({seed:6});
    const a=w.agents[0];
    const d=initialDevelopment(a,w.tiles[a.y*w.width+a.x].biome);
    rememberSocialEpisode(d,'conversation',2,10);
    expect(d.memories).toHaveLength(0);
    rememberSocialEpisode(d,'comfort',2,10);
    rememberSocialEpisode(d,'comfort',2,11);
    expect(d.memories).toHaveLength(1);
    expect(d.memories[0].kind).toBe('support');
    rememberSocialEpisode(d,'disagreement',2,11);
    rememberSocialEpisode(d,'reconciliation',2,12);
    expect(d.memories.map(m=>m.kind)).toEqual([
      'support','conflict','reconciliation']);
  });
});
