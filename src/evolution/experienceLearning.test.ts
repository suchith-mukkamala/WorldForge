import {describe,expect,it} from 'vitest';
import {experiencePreference,stepExperiencePreference} from './experienceLearning';
import {initialCognition} from './mindII';

describe('Mind Engine III — experiential preferences',()=>{
  it('learns bounded preferences from actual outcomes without mutable state',()=>{
    const c=initialCognition();
    c.history=[
      {year:10,day:12,purpose:'explore',outcome:'completed',reason:'Found ruins'},
      {year:11,day:15,purpose:'explore',outcome:'completed',reason:'Returned'},
      {year:11,day:20,purpose:'create',outcome:'abandoned',reason:'No tools'},
    ];
    const before=JSON.stringify(c);
    expect(experiencePreference(c,'explore',11)).toBeGreaterThan(0);
    expect(experiencePreference(c,'create',11)).toBeLessThan(0);
    expect(experiencePreference(c,'connect',11)).toBe(0);
    expect(experiencePreference(c,'explore',50)).toBe(0);
    expect(JSON.stringify(c)).toBe(before);
  });
  it('caps repeated outcomes and does not change legacy lives',()=>{
    const c=initialCognition();
    expect(experiencePreference(undefined,'learn',20)).toBe(0);
    for(let i=0;i<14;i++)c.history.push({year:20,day:i,
      purpose:'learn',outcome:'completed',reason:'Practiced'});
    expect(experiencePreference(c,'learn',20)).toBe(12);
    c.history=c.history.map(h=>({...h,outcome:'abandoned'}));
    expect(experiencePreference(c,'learn',20)).toBe(-12);
  });
  it('remembers genuine completed and blocked steps with a bounded effect',()=>{
    const c=initialCognition();
    c.lessons=[
      {year:20,day:2,purpose:'learn',kind:'practice',result:'achieved'},
      {year:20,day:3,purpose:'learn',kind:'share',result:'blocked'},
      {year:20,day:5,purpose:'explore',kind:'travel',result:'achieved'},
    ];
    expect(stepExperiencePreference(c,'learn',20)).toBe(-1);
    expect(stepExperiencePreference(c,'explore',20)).toBe(1.5);
    expect(stepExperiencePreference(c,'learn',45)).toBe(0);
    expect(stepExperiencePreference(initialCognition(),'learn',20)).toBe(0);
  });
});
