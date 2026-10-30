import {describe,expect,it} from 'vitest';
import {depthStructureSignature} from './depthPerformance';
import {DEPTH_PERSON_SIZE,depthArtDetail} from './depthSprites';
import type {Settlement} from './engine';

describe('2.5D structure layer caching',()=>{
  const home: Settlement={id:1,species:'human',name:'Willow',x:12,y:9,
    founded:0,population:15,stores:5,emptyYears:0,
    infrastructure:{land:[],roads:[],stock:{wood:0,stone:0,clay:0},
      nextBuildingId:2,foundedWithResidents:3,buildings:[{
        id:1,type:'house',culture:'human',x:12,y:9,stage:'complete',
        progress:100,condition:100,started:0,
        spent:{wood:0,stone:0,clay:0},labor:0,
      }]},
  };
  it('ignores changing economy data without suppressing visual changes',()=>{
    const baseline=depthStructureSignature([home]);
    expect(depthStructureSignature([{...home,population:100,stores:80}]))
      .toBe(baseline);
    expect(depthStructureSignature([{...home,x:13}])).not.toBe(baseline);
    const building=home.infrastructure!.buildings[0];
    expect(depthStructureSignature([{...home,infrastructure:{
      ...home.infrastructure!,buildings:[{...building,stage:'ruin'}],
    }}])).not.toBe(baseline);
  });
  it('adds sprite details only at discrete close zoom levels',()=>{
    expect(depthArtDetail(1)).toBe(0);
    expect(depthArtDetail(1.99)).toBe(0);
    expect(depthArtDetail(2)).toBe(1);
    expect(depthArtDetail(3.99)).toBe(1);
    expect(depthArtDetail(4)).toBe(2);
    // The detail tiers now affect the landscape, never mortal scale.
    expect(DEPTH_PERSON_SIZE).toEqual({width:3,height:5});
  });
});
