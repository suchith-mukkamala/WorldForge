import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorldDays} from './calendar';
import {advanceWeeklyLife,initialDailyLife,validDailyLife} from './dailyLife';
import {createWorld,isWorld,stepWorld} from './engine';
import {PeopleDirectory} from './PeopleDirectory';
import {compactWorld,readSavedWorld} from './storage';

describe('v1.6: living days, choices and actual social encounters',()=>{
  it('makes weekly choices without aging, births or imaginary production',()=>{
    const start=createWorld({seed:1402,size:'small'});
    const atDaySix=advanceWorldDays(start,6);
    expect(atDaySix.agents.every(a=>!a.dailyLife)).toBe(true);
    const firstWeek=advanceWorldDays(atDaySix,1);
    expect(firstWeek.year).toBe(0);
    expect(firstWeek.agents.every(a=>!!a.dailyLife)).toBe(true);
    expect(firstWeek.agents.every((a,i)=>a.age===start.agents[i].age)).toBe(true);
    expect(firstWeek.totalBirths).toBe(0);
    expect(firstWeek.shipments).toEqual(start.shipments);
    expect(firstWeek.settlements).toEqual(start.settlements);
    expect(firstWeek.tiles).toEqual(start.tiles);
    expect(firstWeek.history).toEqual(start.history);
    expect(firstWeek.rngState).toBe(start.rngState);
    expect(isWorld(firstWeek)).toBe(true);
    expect(start.agents.every(a=>a.dailyLife===undefined)).toBe(true);
  });

  it('makes calendar speed and chunk size irrelevant to routines and encounters',()=>{
    const start=createWorld({seed:2026,size:'small'});
    const once=advanceWorldDays(start,365+50);
    let days=start;
    for(let i=0;i<415;i++)days=advanceWorldDays(days,1);
    expect(days).toEqual(once);
    expect(isWorld(days)).toBe(true);
    expect(readSavedWorld(compactWorld(once))).toEqual(once);
  });

  it('allows conversations only with people who can really meet',()=>{
    const world=createWorld({seed:17,size:'small',
      starting:{human:2,elf:0,dwarf:0,demon:0}});
    const [a,b]=world.agents;
    expect(a).toBeDefined();expect(b).toBeDefined();
    const isolated=advanceWeeklyLife({...world,agents:[a]},7);
    expect(isolated.agents.every(p=>p.dailyLife?.encounters.length===0)).toBe(true);
    // Place the neighbors in a traversable square and make both willing.
    const location={x:a.x+1,y:a.y};
    if(world.tiles[location.y*world.width+location.x].biome==='water')location.x=a.x-1;
    const close={...world,agents:[
      {...a,energy:90,dailyLife:{...initialDailyLife(),socialNeed:90},
        mind:{...a.mind!,goal:'stay_together' as const},
        development:{...a.development!,trust:65}},
      {...b,...location,energy:90,dailyLife:{...initialDailyLife(),socialNeed:90},
        mind:{...b.mind!,goal:'stay_together' as const},
        development:{...b.development!,trust:65}},
    ]};
    expect(isWorld(close)).toBe(true);
    const next=advanceWeeklyLife(close,7);
    expect(next.agents[0].dailyLife!.encounters.at(-1)?.withId).toBe(b.id);
    expect(next.agents[1].dailyLife!.encounters.at(-1)?.withId).toBe(a.id);
    expect(next.agents[0].development!.languages.human).toBeGreaterThan(
      close.agents[0].development.languages.human);
    expect(close.agents[0].dailyLife!.encounters).toHaveLength(0);
    expect(isWorld(next)).toBe(true);
  });

  it('does not force sociability or erase autonomy',()=>{
    const world=createWorld({seed:144,size:'small',
      starting:{human:2,elf:0,dwarf:0,demon:0}});
    const [a,b]=world.agents;
    const unwilling={...world,agents:[
      {...a,dailyLife:{...initialDailyLife(),socialNeed:85},
        development:{...a.development!,trust:12}},
      {...b,dailyLife:{...initialDailyLife(),fatigue:90},
        development:{...b.development!,trust:80}},
    ]};
    const next=advanceWeeklyLife(unwilling,7);
    expect(next.agents[0].dailyLife?.encounters).toHaveLength(0);
    expect(next.agents[1].dailyLife?.activity).toBe('rest');
  });

  it('retains old saves, copies records safely and rejects malformed daily states',()=>{
    const legacy=stepWorld(createWorld({seed:2024,size:'small'}));
    expect(legacy.agents.every(a=>!a.dailyLife)).toBe(true);
    expect(readSavedWorld(JSON.stringify(legacy))).toEqual(legacy);
    const next=advanceWorldDays(legacy,7);
    expect(isWorld(next)).toBe(true);
    expect(validDailyLife(next.agents[0].dailyLife!,next.year)).toBe(true);
    const originalCount=next.agents[0].dailyLife!.encounters.length;
    const annual=stepWorld(next);
    annual.agents[0].dailyLife!.encounters.push({year:next.year,day:7,
      withId:next.agents[1].id,kind:'conversation',detail:'A test.'});
    expect(next.agents[0].dailyLife!.encounters).toHaveLength(originalCount);
    expect(isWorld({...next,agents:[{...next.agents[0],
      dailyLife:{...next.agents[0].dailyLife!,fatigue:NaN}},
      ...next.agents.slice(1)]})).toBe(false);
  });

  it('makes the social diary visible on an actual person profile',()=>{
    const w=advanceWorldDays(createWorld({seed:955,size:'small'}),7);
    const html=renderToStaticMarkup(<PeopleDirectory world={w}
      selectedId={w.agents[0].id} onOpen={()=>{}} onFavorite={()=>{}}
      onRename={()=>{}} onFindOnMap={()=>{}}/>);
    expect(html).toContain('A LIFE IN PROGRESS');
    expect(html).toContain('Need for company');
    expect(html).toContain('RECENT ENCOUNTERS');
  });
});
