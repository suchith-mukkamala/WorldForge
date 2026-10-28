import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorldDays} from './calendar';
import {residentIndex,tileCapacity} from './density';
import {advanceWeeklyLife,initialDailyLife,validDailyLife} from './dailyLife';
import {createWorld,isWorld,stepWorld,type World} from './engine';
import {LifeViewer} from './LifeViewer';
import {cloneCognition,findMortalRoute,initialCognition,
  type MortalPlan} from './mindII';
import {actionPose,motionFrame} from './motion';
import {pixelRectsFor} from './pixelArt';
import {compactWorld,readSavedWorld} from './storage';

const fresh=()=>createWorld({seed:429,size:'small',
  starting:{human:12,elf:8,dwarf:6,demon:5}});

describe('v1.7 — persistent, explainable Mind Engine II',()=>{
  it('creates distinct multi-step agendas instead of a single universal action',()=>{
    const w=advanceWorldDays(fresh(),21);
    const cognitions=w.agents.map(a=>a.cognition).filter(Boolean);
    expect(cognitions.length).toBeGreaterThan(16);
    expect(cognitions.some(c=>c!.agenda.some(p=>p.steps.length>=3))).toBe(true);
    expect(new Set(cognitions.flatMap(c=>c!.decisions.map(p=>p.purpose))).size)
      .toBeGreaterThan(1);
    expect(cognitions.some(c=>c!.decisions.some(d=>
      d.explanation.includes('value')||d.explanation.includes('Energy')||
      d.explanation.includes('Curiosity')))).toBe(true);
    expect(w.agents.some(a=>a.cognition?.agenda.length===0)).toBe(true);
    expect(isWorld(w)).toBe(true);
  });

  it('interrupts a lower-priority plan for real hunger and can remember it',()=>{
    const w=advanceWorldDays(fresh(),4);
    const chosen=w.agents.find(a=>a.cognition?.agenda.some(p=>p.status==='active'&&
      !['survive','recover'].includes(p.purpose)));
    expect(chosen).toBeDefined();
    const original=chosen!.cognition!.agenda.find(p=>p.status==='active')!;
    const changed:World={...w,agents:w.agents.map(a=>a.id===chosen!.id?
      {...a,energy:24}:a)};
    const next=advanceWorldDays(changed,1);
    const c=next.agents.find(a=>a.id===chosen!.id)!.cognition!;
    expect(c.agenda.some(p=>p.id===original.id&&p.status==='paused')).toBe(true);
    expect(c.agenda.some(p=>p.purpose==='survive')).toBe(true);
    expect(c.decisions.some(d=>d.decision==='paused'&&
      d.explanation.toLowerCase().includes('hunger'))).toBe(true);
    expect(c.history.some(h=>h.outcome==='interrupted')).toBe(true);
    expect(isWorld(next)).toBe(true);
  });

  it('abandons impossible social plans if the intended person disappears',()=>{
    const w=fresh(),a=w.agents[0];
    const plan:MortalPlan={id:1,purpose:'connect',priority:88,
      created:{year:0,day:0},motives:['Misses a friend'],status:'active',
      cursor:0,steps:[{kind:'talk',reason:'Find the friend.',
        personId:999999,needed:3,done:0}]};
    const c={...initialCognition(),nextId:2,agenda:[plan]};
    const changed={...w,agents:[{...a,cognition:c},...w.agents.slice(1)]};
    expect(isWorld(changed)).toBe(true);
    const next=advanceWorldDays(changed,1);
    const thoughts=next.agents[0].cognition!;
    expect(thoughts.history.some(h=>h.outcome==='abandoned')).toBe(true);
    expect(thoughts.decisions.some(d=>d.decision==='changed')).toBe(true);
    expect(isWorld(next)).toBe(true);
  });

  it('pauses impossible travel instead of stepping through water',()=>{
    const w=createWorld({seed:9201,size:'small',
      starting:{human:1,elf:0,dwarf:0,demon:0}});
    const a=w.agents[0],tiles=w.tiles.map(tile=>({...tile}));
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const x=a.x+dx,y=a.y+dy;
      if(x>=0&&y>=0&&x<w.width&&y<w.height)
        tiles[y*w.width+x]={biome:'water',food:0};
    }
    const target={x:a.x+4,y:a.y+4};
    const c=initialCognition(),plan:MortalPlan={id:1,purpose:'explore',
      status:'active',priority:100,motives:['Wants to go east'],
      created:{year:0,day:0},cursor:0,steps:[{kind:'travel',
        reason:'Cross an impassable ring.',needed:1,done:0,target}]};
    c.nextId=2;c.agenda=[plan];
    const changed={...w,tiles,agents:[{...a,cognition:c}]};
    const next=advanceWorldDays(changed,30),person=next.agents[0];
    expect(person.x).toBe(a.x);expect(person.y).toBe(a.y);
    expect(person.cognition!.history.some(h=>h.outcome==='interrupted'&&
      h.reason.includes('blocked'))).toBe(true);
  });

  it('calculates safe adjacent routes and records actual traversed tiles',()=>{
    const w=fresh();
    const occupied=residentIndex(w.agents,w.width),capacities=tileCapacity(w);
    const bridges=new Set(w.transport?.bridges.map(b=>b.index)??[]);
    let route:number[]=[];
    let a=w.agents[0];
    for(const person of w.agents){
      if(route.length)break;
      for(let dy=-4;dy<=4&&!route.length;dy++)
        for(let dx=-4;dx<=4&&!route.length;dx++){
          if(Math.max(Math.abs(dx),Math.abs(dy))<3)continue;
          const x=person.x+dx,y=person.y+dy;
          if(x<0||y<0||x>=w.width||y>=w.height||
            w.tiles[y*w.width+x].biome==='water')continue;
          const candidate=findMortalRoute(w,person,{x,y},occupied,capacities,bridges);
          if(candidate.length>2){route=candidate;a=person;}
        }
    }
    expect(route.length).toBeGreaterThan(2);
    for(let i=1;i<route.length;i++){
      const before={x:route[i-1]%w.width,y:Math.floor(route[i-1]/w.width)};
      const after={x:route[i]%w.width,y:Math.floor(route[i]/w.width)};
      expect(Math.max(Math.abs(before.x-after.x),Math.abs(before.y-after.y)))
        .toBe(1);
      expect(w.tiles[route[i]].biome==='water'&&!bridges.has(route[i])).toBe(false);
    }
    // Use the known reachable route's end as a deliberately chosen target.
    const end=route.at(-1)!;
    const plan:MortalPlan={id:1,purpose:'explore',priority:100,
      created:{year:0,day:0},motives:['An accessible nearby landmark'],
      status:'active',cursor:0,steps:[{kind:'travel',
        reason:'Walking toward the landmark.',needed:1,done:0,
        target:{x:end%w.width,y:Math.floor(end/w.width)}}]};
    const changed={...w,agents:w.agents.map(person=>person.id===a.id?
      {...person,cognition:{...initialCognition(),nextId:2,agenda:[plan]}}:person)};
    const next=advanceWorldDays(changed,18),traveler=next.agents.find(p=>p.id===a.id)!;
    expect(traveler.cognition?.trail.length).toBeGreaterThan(1);
    for(const idx of traveler.cognition!.trail){
      expect(w.tiles[idx].biome==='water'&&!bridges.has(idx)).toBe(false);
    }
    expect(isWorld(next)).toBe(true);
  });

  it('survives old saves, deep clones and rejects corrupted thought records',()=>{
    const legacy=stepWorld(fresh());
    expect(legacy.agents.some(a=>a.cognition)).toBe(false);
    expect(readSavedWorld(JSON.stringify(legacy))).toEqual(legacy);
    const w=advanceWorldDays(legacy,15),c=w.agents[0].cognition!;
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const copy=cloneCognition(c);
    copy.emotions.hope=1;copy.decisions.push({year:w.year,day:15,
      purpose:'learn',decision:'began',explanation:'Test',alternatives:[]});
    expect(c.emotions.hope).not.toBe(1);
    expect(copy.decisions.length).toBe(c.decisions.length+1);
    const broken={...w,agents:[{...w.agents[0],
      cognition:{...c,agenda:[{...c.agenda[0],cursor:500}]}},
      ...w.agents.slice(1)]};
    expect(isWorld(broken)).toBe(false);
  });

  it('lets beliefs and experiences change the subjects and outcomes of talk',()=>{
    const w=createWorld({seed:17,size:'small',
      starting:{human:2,elf:0,dwarf:0,demon:0}});
    const [a,b]=w.agents,nearby={x:a.x+1,y:a.y};
    const altered={...w,agents:[
      {...a,belief:{faithId:1,conviction:90,since:0},
        mind:{...a.mind!,goal:'stay_together' as const},
        dailyLife:{...initialDailyLife(),socialNeed:90},
        development:{...a.development!,trust:70,values:{...a.development!.values,
          tradition:85}}},
      {...b,...nearby,belief:{faithId:2,conviction:90,since:0},
        mind:{...b.mind!,goal:'stay_together' as const},
        dailyLife:{...initialDailyLife(),socialNeed:90},
        development:{...b.development!,trust:70,values:{...b.development!.values,
          tradition:85}}},
    ]};
    const next=advanceWeeklyLife(altered,7);
    expect(next.agents[0].dailyLife!.encounters.at(-1)?.topic).toBe('belief');
    expect(['disagreement','debate']).toContain(
      next.agents[0].dailyLife!.encounters.at(-1)?.kind);
    expect(next.agents[0].dailyLife!.acquaintances[0].regard).toBeDefined();
    expect(validDailyLife(next.agents[0].dailyLife!,0)).toBe(true);
  });

  it('exposes honest decisions and gives sprites more animation frames',()=>{
    const w=advanceWorldDays(fresh(),12),a=w.agents[0];
    const html=renderToStaticMarkup(<LifeViewer world={w} person={a}/>);
    expect(html).toContain('LIFE VIEWER / MIND ENGINE II');
    expect(html).toContain('INTENTIONS &amp; NEXT STEPS');
    expect(html).toContain('HOW DECISIONS WERE MADE');
    expect(html).toContain('TODAY');
    expect(actionPose('work')).toBe('work');
    expect(actionPose('talk')).toBe('talk');
    const movement={from:{x:1,y:1},to:{x:2,y:1},
      start:0,duration:400,facing:'east' as const};
    expect(motionFrame(movement,250).stride).toBe(2);
    expect(pixelRectsFor(a,'east',2,'work')).not.toEqual(
      pixelRectsFor(a,'east',3,'talk'));
  });

  it('remains deterministic across time-jump sizes with real daily planning',()=>{
    const start=fresh();
    const whole=advanceWorldDays(start,98);
    let stepped=start;
    for(let i=0;i<98;i++)stepped=advanceWorldDays(stepped,1);
    expect(stepped).toEqual(whole);
    expect(isWorld(whole)).toBe(true);
    expect(start.agents.every(a=>!a.cognition)).toBe(true);
  });
});
