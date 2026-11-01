import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,isWorld,stepWorld,type WorldSettings} from './engine';
import {birthPotentialRank} from './traitRanks';
import {birthInnateTrait} from './innateTraits';
import {appearanceFor,spriteKey} from './pixelArt';
import {createMortal,mortalArrivalSite,setDescentMode,
  type MortalCreation} from './divineDescent';
import {DivineDescentCreator} from './DivineDescentCreator';
import {compactWorld,readSavedWorld} from './storage';
import {personName} from './identity';

const settings:Partial<WorldSettings>={seed:5174,size:'small',
  starting:{human:8,elf:5,dwarf:5,demon:5}};
const options:MortalCreation={name:'Aster Vale',species:'elf',
  background:'scholar',appearance:{skin:2,hair:3,hairStyle:2,outfit:'scholar'}};

describe('v2.5.0 — divine descent foundations',()=>{
  it('creates an actual simulation resident with lineage and honest potential',()=>{
    const start=createWorld(settings);
    const {world,agent}=createMortal(start,options);
    expect(world).not.toBe(start);
    expect(world.agents).toHaveLength(start.agents.length+1);
    expect(world.descent).toEqual({agentId:agent.id,mode:'mortal',createdYear:0});
    expect(agent.species).toBe('elf');
    expect(agent.appearance).toEqual(options.appearance);
    expect(agent.development?.career).toBe('scholar');
    expect(agent.potentialRank).toBe(birthPotentialRank(world.settings.seed,
      agent.id,agent.genes));
    expect(agent.innateTrait).toBe(birthInnateTrait(world.settings.seed,
      agent.id,agent.genes));
    const record=world.lineage.find(r=>r.id===agent.id)!;
    expect(personName(world,record)).toBe(options.name);
    expect(record.appearance).toEqual(options.appearance);
    expect(record.moments?.some(m=>m.kind==='divine')).toBe(true);
    expect(isWorld(world)).toBe(true);
    expect(isWorld(start)).toBe(true);
  });

  it('uses a safe deterministic arrival site, not a water or full tile',()=>{
    const world=createWorld(settings);
    const location=mortalArrivalSite(world,'dwarf');
    expect(location).not.toBeNull();
    expect(mortalArrivalSite(world,'dwarf')).toEqual(location);
    const index=location!.y*world.width+location!.x;
    expect(world.tiles[index].biome).not.toBe('water');
  });

  it('preserves the chosen appearance and mode through save/load and god mode',()=>{
    const {world,agent}=createMortal(createWorld(settings),options);
    const exported=readSavedWorld(compactWorld(world))!;
    expect(exported).toEqual(world);
    expect(exported.agents.find(a=>a.id===agent.id)?.appearance)
      .toEqual(options.appearance);
    const divine=setDescentMode(exported,'divine');
    expect(divine.descent?.mode).toBe('divine');
    expect(isWorld(divine)).toBe(true);
    expect(setDescentMode(divine,'mortal').descent?.mode).toBe('mortal');
    expect(divine.agents).toHaveLength(world.agents.length);
  });

  it('won’t spawn duplicate mortals or accept invalid character details',()=>{
    const start=createWorld(settings);
    const created=createMortal(start,options).world;
    expect(()=>createMortal(created,options)).toThrow(/already have/i);
    expect(()=>createMortal(start,{...options,name:'!'})).toThrow(/name/i);
    expect(()=>createMortal(start,{...options,
      appearance:{...options.appearance,skin:10}})).toThrow(/appearance/i);
  });

  it('keeps a mortal attached through a normal autonomous world tick',()=>{
    const {world,agent}=createMortal(createWorld(settings),options);
    const next=stepWorld(world);
    expect(next.descent?.agentId).toBe(agent.id);
    expect(isWorld(next)).toBe(true);
  });

  it('reuses the normal detailed pixel art rather than a special oversized avatar',()=>{
    const {agent}=createMortal(createWorld(settings),options);
    const alternate={...agent,appearance:{...options.appearance,skin:0}};
    expect(appearanceFor(agent).skin).not.toBe(appearanceFor(alternate).skin);
    expect(spriteKey(agent)).not.toBe(spriteKey(alternate));
  });

  it('renders the creator and clear controls for an existing mortal',()=>{
    const world=createWorld(settings);
    const screen=renderToStaticMarkup(createElement(DivineDescentCreator,{
      world,onCreate:()=>{},onResume:()=>{},onReturn:()=>{},
    }));
    expect(screen).toContain('Mortal name');
    expect(screen).toContain('BEGIN MORTAL LIFE');
    expect(screen).toContain('Skin tone');
    const existing=createMortal(world,options).world;
    const returnView=renderToStaticMarkup(createElement(DivineDescentCreator,{
      world:existing,onCreate:()=>{},onResume:()=>{},onReturn:()=>{},
    }));
    expect(returnView).toContain('VIEW YOUR MORTAL');
    expect(returnView).toContain('RETURN TO GOD MODE');
  });
});
