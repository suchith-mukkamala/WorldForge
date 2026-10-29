import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld} from './engine';
import {birthInnateTrait,INNATE_TRAIT_INFO} from './innateTraits';
import {inheritedTraitHeritage,inheritedPotentialUpgrade,isTraitHeritage,
  traitResonance} from './traitHeritage';
import {RankProfile} from './RankProfile';
import {compactWorld,readSavedWorld} from './storage';

describe('v2.1.4 — family affinities and non-deterministic outcomes',()=>{
  const genes={vigor:1,curiosity:1,fertility:1,social:1};
  const first={id:1,genes,innateTrait:'steady_footing' as const,
    potentialRank:'S' as const};
  const second={id:2,genes,innateTrait:'pathfinder' as const,
    potentialRank:'C' as const};
  it('classifies aligned, complementary and diverse families',()=>{
    expect(traitResonance('mind','mind')).toBe('aligned');
    expect(traitResonance('body','survival')).toBe('complementary');
    expect(traitResonance('body','craft')).toBe('diverse');
  });
  it('rolls bounded deterministic heritage without consuming shared RNG',()=>{
    const h=inheritedTraitHeritage(214,42,genes,first,second);
    expect(h).toEqual(inheritedTraitHeritage(214,42,genes,first,second));
    expect(h.parentDomains).toEqual(['body','survival']);
    expect(h.resonance).toBe('complementary');
    expect(isTraitHeritage(h)).toBe(true);
    expect(isTraitHeritage({...h,potentialEcho:200})).toBe(false);
  });
  it('permits both parental and novel gift domains',()=>{
    const seen=new Set<string>();
    for(let id=3;id<1500;id++){
      const heritage=inheritedTraitHeritage(214,id,genes,first,second);
      seen.add(INNATE_TRAIT_INFO[birthInnateTrait(214,id,genes,heritage)].domain);
    }
    expect(seen.has('body')).toBe(true);
    expect(seen.has('survival')).toBe(true);
    expect(seen.has('mind')).toBe(true);
  });
  it('never upgrades into the exceptional tail and leaves many ranks unchanged',()=>{
    const heritage=inheritedTraitHeritage(214,42,genes,first,second);
    expect(inheritedPotentialUpgrade(214,42,'SSS',heritage)).toBe('SSS');
    expect(inheritedPotentialUpgrade(214,42,'A',heritage)).toBe('A');
    let unchanged=0;
    for(let id=3;id<500;id++){
      if(inheritedPotentialUpgrade(214,id,'F',heritage)==='F')unchanged++;
    }
    expect(unchanged).toBeGreaterThan(250);
  });
  it('preserves founders, archives, future births, save round trips and UI',()=>{
    let world=createWorld({seed:214214,size:'small'});
    expect(world.agents.every(a=>a.traitHeritage===undefined)).toBe(true);
    for(let i=0;i<45&&!world.lineage.some(a=>a.traitHeritage);i++)
      world=stepWorld(world);
    const child=world.lineage.find(r=>r.traitHeritage);
    expect(child).toBeDefined();
    expect(isTraitHeritage(child?.traitHeritage)).toBe(true);
    expect(child!.innateTrait).toBe(birthInnateTrait(world.settings.seed,
      child!.id,child!.genes,child!.traitHeritage));
    const ui=renderToStaticMarkup(createElement(RankProfile,{
      seed:world.settings.seed,person:child!}));
    expect(ui).toContain('INHERITED AFFINITY');
    expect(ui).toContain('RESONANCE');
    expect(isWorld(world)).toBe(true);
    const saved=readSavedWorld(compactWorld(world));
    expect(saved).not.toBeNull();
    expect(saved!.lineage.find(r=>r.id===child!.id)?.traitHeritage)
      .toEqual(child!.traitHeritage);
    const next=stepWorld(saved!);
    expect(next.lineage.find(r=>r.id===child!.id)?.traitHeritage)
      .toEqual(child!.traitHeritage);
  });
});
