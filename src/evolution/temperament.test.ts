import {describe,expect,it} from 'vitest';
import {ambitionLean,birthTemperament,spareLean,temperamentNudge,
  temperamentPhrase} from './temperament';

const genes=(social:number,curiosity=1,vigor=1)=>({
  vigor,curiosity,fertility:1,social,
});

describe('birth temperaments',()=>{
  it('is stable for a seed and identity and ignores the world RNG',()=>{
    const first=birthTemperament(90,7,genes(1.1));
    expect(birthTemperament(90,7,genes(1.1))).toEqual(first);
    expect(birthTemperament(90,8,genes(1.1))).not.toEqual(first);
    expect(birthTemperament(91,7,genes(1.1))).not.toEqual(first);
  });
  it('lets sociability and curiosity pull warmth and openness',()=>{
    let warm=0,cool=0,open=0,rooted=0;
    for(let id=1;id<=240;id++){
      warm+=birthTemperament(3,id,genes(1.35)).warmth;
      cool+=birthTemperament(3,id,genes(.7)).warmth;
      open+=birthTemperament(3,id,genes(1,1.35)).openness;
      rooted+=birthTemperament(3,id,genes(1,.7)).openness;
    }
    expect(warm).toBeGreaterThan(cool);
    expect(open).toBeGreaterThan(rooted);
  });
  it('keeps every axis inside the recorded range',()=>{
    for(let id=1;id<=40;id++){
      const t=birthTemperament(id*17,id,genes(.65+id%10*.07,1.2,.8));
      for(const value of Object.values(t)){
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
  it('names a readable leaning and withholds a nudge from survival',()=>{
    const extreme={warmth:80,drive:20,openness:10,steadiness:75};
    expect(temperamentPhrase(extreme)).toContain('warm');
    expect(temperamentPhrase({warmth:50,drive:50,openness:50,steadiness:50}))
      .toBe('even-tempered');
    expect(temperamentNudge(extreme,'survive')).toBe(0);
    expect(temperamentNudge(extreme,'connect')).toBeGreaterThan(1);
    expect(ambitionLean(extreme).connect).toBeGreaterThan(ambitionLean(extreme).explore);
  });
  it('spends a free hour in a way that matches the leaning or the town',()=>{
    expect(spareLean({warmth:80,drive:40,openness:40,steadiness:50})?.activity)
      .toBe('socialize');
    expect(spareLean({warmth:50,drive:80,openness:55,steadiness:70})?.activity)
      .toBe('craft');
    const cared=spareLean({warmth:50,drive:40,openness:50,steadiness:50},
      {custom:'hearth',canCare:false});
    expect(cared?.activity).toBe('socialize');
    expect(spareLean({warmth:50,drive:40,openness:50,steadiness:50},
      {custom:'archive'})?.activity).toBe('study');
    expect(spareLean({warmth:50,drive:40,openness:50,steadiness:50})).toBeNull();
  });
});
