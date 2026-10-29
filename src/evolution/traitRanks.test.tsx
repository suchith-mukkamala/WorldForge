import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld} from './engine';
import {RankProfile} from './RankProfile';
import {birthPotentialRank,potentialRank,proficiencyRank,rankForRoll,
  TRAIT_RANKS,TRAIT_RANK_INFO,traitPotency} from './traitRanks';

describe('v2.1.1 — potential is rare, fixed and separate from real training',()=>{
  it('defines the complete ordered ladder with meaningful power differences',()=>{
    expect(TRAIT_RANKS).toEqual([
      'F','E','D','C','B','A','S','S+','SS','SS+','SSS']);
    expect(TRAIT_RANKS.reduce((n,r)=>n+TRAIT_RANK_INFO[r].birthRate,0))
      .toBeCloseTo(100,8);
    for(let i=1;i<TRAIT_RANKS.length;i++){
      expect(TRAIT_RANK_INFO[TRAIT_RANKS[i]].potency).toBeGreaterThan(
        TRAIT_RANK_INFO[TRAIT_RANKS[i-1]].potency);
      expect(TRAIT_RANK_INFO[TRAIT_RANKS[i]].birthRate).toBeLessThan(
        TRAIT_RANK_INFO[TRAIT_RANKS[i-1]].birthRate);
    }
    expect(rankForRoll(0)).toBe('F');
    expect(rankForRoll(.5)).toBe('D');
    expect(rankForRoll(.985)).toBe('SS');
    expect(rankForRoll(.9999)).toBe('SSS');
    expect(proficiencyRank(0)).toBe('F');
    expect(proficiencyRank(67)).toBe('S');
    expect(proficiencyRank(100)).toBe('SSS');
    expect(traitPotency('F',100)).toBeGreaterThan(traitPotency('F',10));
    expect(traitPotency('F',100)).toBeLessThan(traitPotency('S',100));
    expect(traitPotency('F',100)).toBeGreaterThan(traitPotency('S',0));
    const early=traitPotency('B',30)-traitPotency('B',20);
    const late=traitPotency('B',90)-traitPotency('B',80);
    expect(early).toBeGreaterThan(late); // diminishing returns
  });

  it('makes exceptional birth potential uncommon without species privilege',()=>{
    const genes={vigor:1,curiosity:1,fertility:1,social:1};
    const counts=Object.fromEntries(TRAIT_RANKS.map(r=>[r,0])) as
      Record<(typeof TRAIT_RANKS)[number],number>;
    for(let id=1;id<=20000;id++)counts[birthPotentialRank(514,id,genes)]++;
    expect(counts.F).toBeGreaterThan(4500);
    expect(counts.F).toBeLessThan(6800);
    expect(counts.SSS).toBeGreaterThan(10);
    expect(counts.SSS).toBeLessThan(55);
    expect(counts.SSS).toBeLessThan(counts.SS);
    expect(counts['S+']).toBeLessThan(counts.S);
  });

  it('assigns a permanent seed-derived potential to founders and their archive',()=>{
    const world=createWorld({seed:21011,size:'small'});
    for(const a of world.agents){
      expect(a.potentialRank).toBe(birthPotentialRank(world.settings.seed,
        a.id,a.genes));
      expect(world.lineage.find(r=>r.id===a.id)?.potentialRank)
        .toBe(a.potentialRank);
    }
    expect(isWorld(world)).toBe(true);
    const copy=JSON.parse(JSON.stringify(world));
    expect(isWorld(copy)).toBe(true);
    const before=world.rngState;
    for(const a of world.agents)potentialRank(world.settings.seed,a);
    expect(world.rngState).toBe(before);
    const next=stepWorld(world);
    expect(next.agents.every(a=>a.potentialRank===
      world.agents.find(p=>p.id===a.id)?.potentialRank)).toBe(true);
  });

  it('assigns the same permanent rank to real children and their lineage records',()=>{
    let world=createWorld({seed:212121,size:'small'});
    for(let i=0;i<40&&!world.lineage.some(r=>r.generation>0);i++)
      world=stepWorld(world);
    const child=world.lineage.find(r=>r.generation>0);
    expect(child).toBeDefined();
    expect(child!.potentialRank).toBe(birthPotentialRank(world.settings.seed,
      child!.id,child!.genes));
    const alive=world.agents.find(a=>a.id===child!.id);
    if(alive)expect(alive.potentialRank).toBe(child!.potentialRank);
  });

  it('gives legacy characters a stable fallback and validates optional ranks',()=>{
    const original=createWorld({seed:21121,size:'small'});
    const older={...original,
      agents:original.agents.map(a=>({...a,potentialRank:undefined})),
      lineage:original.lineage.map(a=>({...a,potentialRank:undefined}))};
    expect(isWorld(older)).toBe(true);
    for(const a of older.agents)expect(potentialRank(older.settings.seed,a))
      .toBe(original.agents.find(p=>p.id===a.id)?.potentialRank);
    const stepped=stepWorld(older);
    expect(stepped.agents.every(a=>a.potentialRank!==undefined)).toBe(true);
    expect(stepped.lineage.every(a=>a.potentialRank!==undefined)).toBe(true);
    expect(isWorld(stepped)).toBe(true);
    const badAgent={...original,agents:[{...original.agents[0],
      potentialRank:'SSSS' as 'SSS'},...original.agents.slice(1)]};
    expect(isWorld(badAgent)).toBe(false);
    const badArchive={...original,lineage:[{...original.lineage[0],
      potentialRank:'X' as 'F'},...original.lineage.slice(1)]};
    expect(isWorld(badArchive)).toBe(false);
  });

  it('shows birth potential separately from genuine skill experience',()=>{
    const w=createWorld({seed:21212,size:'small'}),a=w.agents[0];
    const html=renderToStaticMarkup(createElement(RankProfile,{
      seed:w.settings.seed,person:a,
    }));
    expect(html).toContain('LATENT POTENTIAL');
    expect(html).toContain('STRONGEST TRAINING');
    expect(html).toContain('Potential is not destiny');
    expect(html).toContain('Foraging');
    expect(html).toContain('RANKS');
    const trained={...a,development:{...a.development!,skills:{
      ...a.development!.skills,navigation:70}}};
    const practiced=renderToStaticMarkup(createElement(RankProfile,{
      seed:w.settings.seed,person:trained,
    }));
    expect(practiced).toContain('Navigation');
    expect(practiced).toContain('70/100');
    expect(practiced).toContain('Expert');
    const archive=renderToStaticMarkup(createElement(RankProfile,{
      seed:w.settings.seed,person:w.lineage[0],
    }));
    expect(archive).toContain('Not recorded');
    expect(archive).toContain(a.potentialRank!);
  });
});
