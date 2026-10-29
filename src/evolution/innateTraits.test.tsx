import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createWorld,editWorld,isWorld,stepWorld} from './engine';
import {intervene} from './divine';
import {PeopleDirectory} from './PeopleDirectory';
import {RankProfile} from './RankProfile';
import {compactWorld,readSavedWorld} from './storage';
import {birthInnateTrait,innateTrait,INNATE_TRAIT_CATALOG,
  INNATE_TRAIT_INFO,isInnateTrait,TRAIT_DOMAINS,TRAIT_DOMAIN_INFO,
  traitDomainWeight} from './innateTraits';

describe('v2.1.2 — one distinct birth gift per person',()=>{
  it('offers 48 valid, distinct gifts across eight open-ended families',()=>{
    expect(INNATE_TRAIT_CATALOG).toHaveLength(48);
    expect(new Set(INNATE_TRAIT_CATALOG.map(t=>t.id)).size).toBe(48);
    expect(TRAIT_DOMAINS).toHaveLength(8);
    for(const domain of TRAIT_DOMAINS){
      expect(INNATE_TRAIT_CATALOG.filter(t=>t.domain===domain)).toHaveLength(6);
      expect(TRAIT_DOMAIN_INFO[domain].name).toBeTruthy();
    }
    for(const spec of INNATE_TRAIT_CATALOG){
      expect(spec.name.length).toBeGreaterThan(4);
      expect(spec.possibility.length).toBeGreaterThan(15);
      expect(isInnateTrait(spec.id)).toBe(true);
    }
    expect(isInnateTrait('unlisted_trait')).toBe(false);
  });

  it('is deterministic, diverse and independent of simulation randomness',()=>{
    const genes={vigor:1,curiosity:1,fertility:1,social:1};
    const seen=new Set<string>();
    for(let id=1;id<=20000;id++){
      const trait=birthInnateTrait(851,id,genes);
      expect(birthInnateTrait(851,id,genes)).toBe(trait);
      seen.add(trait);
    }
    expect(seen.size).toBe(48);
    const sturdy={...genes,vigor:1.4,curiosity:.7};
    const thoughtful={...genes,vigor:.7,curiosity:1.4};
    expect(traitDomainWeight('body',sturdy)).toBeGreaterThan(
      traitDomainWeight('body',thoughtful));
    expect(traitDomainWeight('mind',thoughtful)).toBeGreaterThan(
      traitDomainWeight('mind',sturdy));
    expect(birthInnateTrait(851,100,genes)).toBe(
      birthInnateTrait(851,100,genes));
  });

  it('makes founders and their lineage agree on one immutable identity',()=>{
    const world=createWorld({seed:21212,size:'small'});
    for(const person of world.agents){
      expect(person.innateTrait).toBe(birthInnateTrait(world.settings.seed,
        person.id,person.genes));
      expect(world.lineage.find(r=>r.id===person.id)?.innateTrait)
        .toBe(person.innateTrait);
      expect(INNATE_TRAIT_INFO[person.innateTrait!]).toBeDefined();
    }
    const rng=world.rngState;
    world.agents.forEach(a=>innateTrait(world.settings.seed,a));
    expect(world.rngState).toBe(rng);
    const next=stepWorld(world);
    for(const a of next.agents)expect(a.innateTrait)
      .toBe(world.agents.find(p=>p.id===a.id)?.innateTrait);
    expect(readSavedWorld(compactWorld(next))).toEqual(next);
  });

  it('assigns a stable gift to an actual newborn and records it permanently',()=>{
    let world=createWorld({seed:212121,size:'small'});
    for(let i=0;i<40&&!world.lineage.some(r=>r.generation>0);i++)
      world=stepWorld(world);
    const child=world.lineage.find(r=>r.generation>0);
    expect(child).toBeDefined();
    expect(child!.innateTrait).toBe(birthInnateTrait(world.settings.seed,
      child!.id,child!.genes,child!.traitHeritage));
    const living=world.agents.find(a=>a.id===child!.id);
    if(living)expect(living.innateTrait).toBe(child!.innateTrait);
  });

  it('gives brush-created and divinely summoned people a gift at creation',()=>{
    const world=createWorld({seed:212121,size:'small'});
    const index=world.tiles.findIndex((tile,i)=>tile.biome!=='water'&&
      !world.agents.some(a=>a.y*world.width+a.x===i));
    expect(index).toBeGreaterThan(-1);
    const edited=editWorld(world,index%world.width,Math.floor(index/world.width),
      {kind:'spawn',species:'elf'});
    const arrival=edited.agents.find(a=>a.id===world.nextAgentId);
    expect(arrival).toBeDefined();
    expect(arrival!.innateTrait).toBe(birthInnateTrait(world.settings.seed,
      arrival!.id,arrival!.genes));
    const summoned=intervene(edited,{kind:'summon',species:'dwarf',
      x:index%world.width,y:Math.floor(index/world.width)});
    const newPerson=summoned.agents.find(a=>a.id===edited.nextAgentId);
    expect(newPerson).toBeDefined();
    expect(newPerson!.innateTrait).toBe(birthInnateTrait(world.settings.seed,
      newPerson!.id,newPerson!.genes));
    expect(summoned.lineage.find(r=>r.id===newPerson!.id)?.innateTrait)
      .toBe(newPerson!.innateTrait);
    expect(isWorld(summoned)).toBe(true);
  });

  it('keeps the original gift and potential when someone is resurrected',()=>{
    const world=createWorld({seed:1266,size:'small'});
    const subject=world.agents[0];
    const afterDeath={...world,
      agents:world.agents.filter(a=>a.id!==subject.id),
      lineage:world.lineage.map(r=>r.id===subject.id?{...r,died:world.year}:r)};
    const restored=intervene(afterDeath,{kind:'resurrect',personId:subject.id});
    const returned=restored.agents.find(a=>a.id===subject.id)!;
    expect(returned.innateTrait).toBe(subject.innateTrait);
    expect(returned.potentialRank).toBe(subject.potentialRank);
    expect(restored.lineage.find(r=>r.id===subject.id)?.innateTrait)
      .toBe(subject.innateTrait);
    expect(isWorld(restored)).toBe(true);
  });

  it('gives pre-v2.1.2 saves a deterministic fallback and rejects unknown gifts',()=>{
    const original=createWorld({seed:21121,size:'small'});
    const older={...original,
      agents:original.agents.map(a=>({...a,innateTrait:undefined})),
      lineage:original.lineage.map(r=>({...r,innateTrait:undefined}))};
    expect(isWorld(older)).toBe(true);
    for(const a of older.agents)expect(innateTrait(older.settings.seed,a))
      .toBe(original.agents.find(p=>p.id===a.id)?.innateTrait);
    const stepped=stepWorld(older);
    expect(stepped.agents.every(a=>isInnateTrait(a.innateTrait))).toBe(true);
    expect(stepped.lineage.every(a=>isInnateTrait(a.innateTrait))).toBe(true);
    expect(isWorld(stepped)).toBe(true);
    const corruptAgent={...original,agents:[{...original.agents[0],
      innateTrait:'false_gift' as 'steady_footing'},...original.agents.slice(1)]};
    const corruptArchive={...original,lineage:[{...original.lineage[0],
      innateTrait:'false_gift' as 'steady_footing'},...original.lineage.slice(1)]};
    expect(isWorld(corruptAgent)).toBe(false);
    expect(isWorld(corruptArchive)).toBe(false);
  });

  it('shows the actual gift, its possible affinity and discoverable family',()=>{
    const world=createWorld({seed:9021,size:'small'}),a=world.agents[0];
    const trait=INNATE_TRAIT_INFO[a.innateTrait!];
    const profile=renderToStaticMarkup(createElement(RankProfile,{
      seed:world.settings.seed,person:a,
    }));
    expect(profile).toContain('ONE INNATE GIFT');
    expect(profile).toContain(trait.name);
    expect(profile).toContain(trait.possibility);
    expect(profile).toContain('LATENT AT BIRTH');
    expect(profile).toContain('Dormant gifts grant no bonuses');
    const directory=renderToStaticMarkup(createElement(PeopleDirectory,{
      world,selectedId:a.id,onOpen:()=>{},onFavorite:()=>{},
      onRename:()=>{},onFindOnMap:()=>{},
    }));
    expect(directory).toContain('INNATE GIFT FAMILY');
    expect(directory).toContain('evo-people-domain');
    expect(directory).toContain(trait.name);
    expect(directory).toContain('48');
  });
});
