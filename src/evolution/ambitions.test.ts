import {describe,expect,it} from 'vitest';
import {developAmbition} from './ambitions';
import {initialCognition,cloneCognition} from './mindII';

describe('Mind Engine III long-term ambitions',()=>{
  it('requires sustained actual success and adult agency',()=>{
    const c=initialCognition(),at={year:12,day:7};
    c.history=[{year:11,day:1,purpose:'explore',outcome:'completed',reason:'Trip'},
      {year:12,day:2,purpose:'explore',outcome:'completed',reason:'Discovery'}];
    expect(developAmbition(c,at,false)).toBeUndefined();
    const ambition=developAmbition(c,at,true);
    expect(ambition?.purpose).toBe('explore');
    expect(ambition?.commitment).toBe(8);
    c.ambition=ambition;
    expect(cloneCognition(c).ambition).toEqual(ambition);
    expect(cloneCognition(c).ambition).not.toBe(ambition);
  });
  it('does not mistake emergencies or one-off success for destiny',()=>{
    const c=initialCognition();
    c.history=[{year:11,day:1,purpose:'survive',outcome:'completed',reason:'Food'},
      {year:11,day:2,purpose:'learn',outcome:'completed',reason:'Study'}];
    expect(developAmbition(c,{year:12,day:1},true)).toBeUndefined();
  });
  it('keeps an ambition stable until stronger life evidence arrives',()=>{
    const c=initialCognition();
    c.history=[
      ...[1,2].map(day=>({year:12,day,purpose:'learn' as const,
        outcome:'completed' as const,reason:'Studied'})),
    ];
    const first=developAmbition(c,{year:12,day:4},true)!;
    c.ambition=first;
    c.history.push(...[3,4,5,6].map(day=>({year:13,day,
      purpose:'create' as const,outcome:'completed' as const,reason:'Created'})));
    expect(developAmbition(c,{year:13,day:8},true)).toBe(first);
    expect(developAmbition(c,{year:18,day:8},true)?.purpose).toBe('create');
  });
});
