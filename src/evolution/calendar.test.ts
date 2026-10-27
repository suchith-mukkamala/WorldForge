import {describe,expect,it} from 'vitest';
import {advanceWorldDays,calendarDate,MONTH_NAMES} from './calendar';
import {createWorld,isWorld,stepWorld} from './engine';
import {compactWorld,readSavedWorld} from './storage';

describe('v1.2.1: day, week and month pacing',()=>{
  it('uses a real, saveable 365-day calendar without aging a year each day',()=>{
    const start=createWorld({seed:441,size:'small'});
    const next=advanceWorldDays(start,31);
    expect(calendarDate(start)).toEqual({year:0,month:0,day:1});
    expect(calendarDate(next)).toEqual({year:0,month:1,day:1});
    expect(MONTH_NAMES[calendarDate(next).month]).toBe('February');
    expect(next.year).toBe(0);
    expect(next.history).toEqual(start.history);
    expect(next.totalBirths).toBe(0);
    expect(next.agents.map(a=>a.age)).toEqual(start.agents.map(a=>a.age));
    expect(next.agents.some((a,i)=>a.x!==start.agents[i].x||
      a.y!==start.agents[i].y)).toBe(true);
    expect(isWorld(next)).toBe(true);
    expect(readSavedWorld(compactWorld(next))).toEqual(next);
  });

  it('advances annual biology only when a full year has passed',()=>{
    const w=createWorld({seed:24,size:'small'});
    const almost=advanceWorldDays(w,364);
    expect(almost.year).toBe(0);
    expect(almost.dayOfYear).toBe(364);
    const newYear=advanceWorldDays(almost,1);
    expect(newYear.year).toBe(1);
    expect(newYear.dayOfYear).toBe(0);
    expect(newYear.history.at(-1)?.year).toBe(1);
    expect(isWorld(newYear)).toBe(true);
  });

  it('preserves world outcomes across small or large calendar increments',()=>{
    const w=createWorld({seed:1001,size:'small'});
    const single=advanceWorldDays(w,365+31+7);
    let chunks=w;
    for(const days of [7,24,30,90,183,69])chunks=advanceWorldDays(chunks,days);
    expect(7+24+30+90+183+69).toBe(403);
    expect(chunks).toEqual(single);
    expect(advanceWorldDays(w,0)).toBe(w);
  });

  it('accepts legacy annual saves without a calendar field',()=>{
    const w=stepWorld(createWorld({seed:221,size:'small'}));
    const {dayOfYear:_,...legacy}=w;
    expect(isWorld(legacy)).toBe(true);
    expect(readSavedWorld(JSON.stringify(legacy))).toEqual(legacy);
    const next=advanceWorldDays(legacy,7);
    expect(next.dayOfYear).toBe(7);
    expect(calendarDate(next)).toEqual({year:1,month:0,day:8});
    expect(isWorld({...next,dayOfYear:365})).toBe(false);
  });
});
