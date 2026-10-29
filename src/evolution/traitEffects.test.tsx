import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld} from './engine';
import {advanceWeeklyLife,initialDailyLife} from './dailyLife';
import {RankProfile} from './RankProfile';
import {INNATE_TRAIT_CATALOG} from './innateTraits';
import {TRAIT_EFFECT_KIND,TRAIT_EFFECT_KINDS,activeTraitBonus,
  activeTraitEffect,activeTraitPurposeBonus} from './traitEffects';
import {sceneAtmosphere,visualSeason,paintSceneAtmosphere} from './sceneAtmosphere';
import {compactWorld,readSavedWorld} from './storage';

describe('v2.1.5 — earned effects and scenic overhaul',()=>{
  it('gives each of the 48 gifts a supported specialization',()=>{
    expect(Object.keys(TRAIT_EFFECT_KIND)).toHaveLength(48);
    for(const gift of INNATE_TRAIT_CATALOG){
      expect(TRAIT_EFFECT_KINDS).toContain(TRAIT_EFFECT_KIND[gift.id]);
    }
  });
  it('keeps dormant gifts entirely inactive, and rank benefits bounded',()=>{
    const world=createWorld({seed:21515,size:'small'});
    const person=world.agents[0];
    expect(activeTraitEffect(world.settings.seed,person)).toBeNull();
    for(const kind of TRAIT_EFFECT_KINDS)
      expect(activeTraitBonus(world.settings.seed,person,kind)).toBe(0);
    const awakened={...person,innateTrait:'pathfinder' as const,
      awakening:{kind:'natural' as const,age:person.age,year:world.year},
      potentialRank:'F' as const};
    const stronger={...awakened,potentialRank:'SSS' as const};
    const low=activeTraitEffect(world.settings.seed,awakened)!;
    const high=activeTraitEffect(world.settings.seed,stronger)!;
    expect(low.kind).toBe('movement');
    expect(low.strength).toBeGreaterThan(0);
    expect(high.strength).toBeGreaterThan(low.strength);
    expect(high.strength).toBeLessThanOrEqual(.14);
    expect(activeTraitBonus(world.settings.seed,awakened,'learning')).toBe(0);
    expect(activeTraitPurposeBonus(world.settings.seed,awakened,'explore'))
      .toBeGreaterThan(0);
    expect(activeTraitPurposeBonus(world.settings.seed,awakened,'work')).toBe(0);
  });
  it('lets awakening influence a weekly decision and visibly explains it',()=>{
    const world=createWorld({seed:21516,size:'small'});
    const base=world.agents[0];
    const adult={...base,age:45,health:100,energy:95,work:undefined,
      innateTrait:'pattern_seeker' as const,
      awakening:{kind:'natural' as const,age:22,year:0},
      dailyLife:{...initialDailyLife(),fatigue:0,socialNeed:0}};
    const withGift={...world,agents:[adult],
      lineage:world.lineage.filter(r=>r.id===adult.id)};
    const week=(4-adult.id%4)%4;
    const changed=advanceWeeklyLife(withGift,week*7).agents[0];
    expect(changed.dailyLife?.activity).toBe('study');
    expect(changed.dailyLife?.reason).toContain('awakened Pattern Seeker');
    expect(renderToStaticMarkup(createElement(RankProfile,{
      seed:world.settings.seed,person:adult}))).toContain('ACTIVE GIFT');
    const dormant=advanceWeeklyLife({...withGift,
      agents:[{...adult,awakening:undefined}]},week*7).agents[0];
    expect(dormant.dailyLife?.reason).not.toContain('awakened Pattern Seeker');
  });
  it('survives yearly advancement and legacy saves',()=>{
    const w=createWorld({seed:21517,size:'small'});
    const a=w.agents[0];
    const awakened={...a,innateTrait:'deep_breath' as const,
      awakening:{kind:'natural' as const,age:Math.max(1,a.age),year:0}};
    const world={...w,agents:w.agents.map(p=>p.id===a.id?awakened:p),
      lineage:w.lineage.map(r=>r.id===a.id?{...r,awakening:awakened.awakening,
        innateTrait:awakened.innateTrait}:r)};
    expect(isWorld(world)).toBe(true);
    const cloned=readSavedWorld(compactWorld(world));
    expect(cloned).not.toBeNull();
    expect(activeTraitEffect(world.settings.seed,cloned!.agents[0])).not.toBeNull();
    expect(isWorld(stepWorld(cloned!))).toBe(true);
    expect(activeTraitEffect(world.settings.seed,a)).toBeNull();
  });
  it('supplies four deterministic seasons without changing game RNG',()=>{
    expect([0,100,195,300,365,730].map(visualSeason)).toEqual([
      'Bloom','Highsun','Harvest','Frost','Bloom','Bloom']);
    expect(sceneAtmosphere(300).season).toBe('Frost');
    expect(sceneAtmosphere(100).wash).not.toBe(sceneAtmosphere(300).wash);
    const world=createWorld({seed:21518,size:'small'});
    let rectangles=0,gradients=0;
    const gradient={addColorStop:()=>{}};
    const ctx={
      canvas:{width:480,height:280},fillStyle:'',
      save:()=>{},restore:()=>{},
      createLinearGradient:()=>{gradients++;return gradient;},
      fillRect:()=>{rectangles++;},
    } as unknown as CanvasRenderingContext2D;
    paintSceneAtmosphere(ctx,world.settings.seed,world.year,90,'overhead');
    paintSceneAtmosphere(ctx,world.settings.seed,world.year,271,'depth');
    expect(gradients).toBe(2);
    expect(rectangles).toBeGreaterThan(100);
    expect(world.rngState).toBe(createWorld({seed:21518,size:'small'}).rngState);
  });
});
