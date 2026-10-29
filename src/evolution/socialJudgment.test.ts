import {describe,it,expect} from 'vitest';
import {relationshipScore,refusesConversation} from './socialJudgment';

describe('individual social judgment',()=>{
  it('values mutual long-term positive experience',()=>{
    const a=[{personId:2,meetings:10,regard:20}];
    const b=[{personId:1,meetings:10,regard:17}];
    expect(relationshipScore(a,b,1,2)).toBeGreaterThan(10);
    expect(refusesConversation(a,b,1,2)).toBe(false);
  });
  it('does not presume that one-sided affection is mutual',()=>{
    const a=[{personId:2,meetings:5,regard:20}];
    const b=[{personId:1,meetings:5,regard:-30}];
    expect(relationshipScore(a,b,1,2)).toBeLessThan(0);
    expect(refusesConversation(a,b,1,2)).toBe(true);
  });
  it('treats strangers neutrally and keeps judgment bounded',()=>{
    expect(relationshipScore([],[],1,2)).toBe(0);
    expect(relationshipScore([{personId:2,meetings:999,regard:100}],
      [{personId:1,meetings:999,regard:100}],1,2)).toBeLessThanOrEqual(25);
  });
});
