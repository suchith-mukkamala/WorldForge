import {describe,expect,it} from 'vitest';
import {
  SPECIES,SPECIES_INFO,createWorld,stepWorld,advanceWorld,editWorld,isWorld,
  type World,type Agent,
} from './engine';
import {
  pureAncestry,mixAncestry,traitProfile,dominantSpecies,hybridFraction,
  ancestryLabel,compatibility,isCloseFamily,growBonds,ecologicalBirthSupport,
} from './family';
import {residentIndex} from './density';
import {
  compactWorld,readSavedWorld,migrateLegacyWorld,loadBrowserWorld,
  WORLD_STORAGE_KEY,LEGACY_STORAGE_KEY,
} from './storage';

describe('Evolution Lab v0.2 · genetics and compatibility',()=>{
  it('reduces fertility pressure when people outgrow nearby food regeneration',()=>{
    const w=createWorld({seed:73,size:'small'}),a=w.agents[0];
    const sparse=residentIndex(w.agents,w.width);
    const base=ecologicalBirthSupport(w,a,sparse);
    const crowded=new Map([...sparse].map(([index,ids])=>[index,[...ids]]));
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=a.x+dx,y=a.y+dy;
      if(x<0||y<0||x>=w.width||y>=w.height)continue;
      const index=y*w.width+x;
      if(w.tiles[index].biome==='water')continue;
      crowded.set(index,[...(crowded.get(index)??[]),...Array(8).fill(-1)]);
    }
    expect(ecologicalBirthSupport(w,a,crowded)).toBeLessThan(base);
  });
  it('blends four-species ancestry recursively without losing percentages',()=>{
    const h=pureAncestry('human'),e=pureAncestry('elf');
    const first=mixAncestry(h,e);
    expect(first).toEqual({human:.5,elf:.5,dwarf:0,demon:0});
    const second=mixAncestry(first,h);
    expect(second.human).toBe(.75);
    expect(second.elf).toBe(.25);
    expect(dominantSpecies(second)).toBe('human');
    expect(hybridFraction(second)).toBe(.25);
    expect(ancestryLabel(first)).toContain('Mixed');
    expect(SPECIES.reduce((sum,s)=>sum+second[s],0)).toBe(1);
  });
  it('blends lifespan and maturity for mixed families',()=>{
    const mix=mixAncestry(pureAncestry('elf'),pureAncestry('human'));
    const profile=traitProfile(mix);
    expect(profile.lifespan).toBe((SPECIES_INFO.elf.lifespan+
      SPECIES_INFO.human.lifespan)/2);
    expect(profile.maturity).toBe((SPECIES_INFO.elf.maturity+
      SPECIES_INFO.human.maturity)/2);
    expect(profile.fertility).toBeGreaterThan(SPECIES_INFO.elf.fertility);
    expect(profile.fertility).toBeLessThan(SPECIES_INFO.human.fertility);
  });
  it('scores species-compatible adults and refuses forbidden hybrid bonds',()=>{
    const world=createWorld({starting:{human:1,elf:1,dwarf:0,demon:0}});
    const a=world.agents.find(v=>v.species==='human')!;
    const b=world.agents.find(v=>v.species==='elf')!;
    expect(compatibility(a,b,true)).toBeGreaterThan(.4);
    expect(compatibility(a,b,false)).toBe(0);
    expect(compatibility(a,a,true)).toBe(0);
    expect(compatibility(a,b,true)).toBe(compatibility(b,a,true));
  });
  it('rejects pairing close relatives, including siblings and grandparents',()=>{
    const world=createWorld({starting:{human:4,elf:0,dwarf:0,demon:0}});
    const [a,b,c,d]=world.agents;
    const world2:World={...world,lineage:world.lineage.map(r=>{
      if(r.id===c.id||r.id===d.id)return {...r,parents:[a.id,b.id] as [number,number]};
      return r;
    })};
    expect(isCloseFamily(world2,c.id,d.id)).toBe(true);
    expect(isCloseFamily(world2,a.id,c.id)).toBe(true);
    expect(isCloseFamily(world2,c.id,c.id)).toBe(true);
    expect(isCloseFamily(world2,a.id,b.id)).toBe(false);
  });
  it('establishes persistent mutual courtship and eventually a partnership',()=>{
    const w=createWorld({starting:{human:0,elf:0,dwarf:0,demon:0}});
    const x=12,y=12;
    const a=editWorld(w,x,y,{kind:'spawn',species:'human'});
    const b=editWorld(a,x+1,y,{kind:'spawn',species:'elf'});
    const ready:World={...b,agents:b.agents.map(agent=>({
      ...agent,energy:99,health:99,
      age:SPECIES_INFO[agent.species].maturity+5,
      genes:{...agent.genes,social:1.4},
    }))};
    // Force a meeting while keeping the actual engine path deterministic.
    const rand=()=>0;
    const before=ready.lineage.length;
    const next:World={...ready,agents:ready.agents.map(agent=>({...agent})),bonds:[]};
    growBonds(next,rand);
    expect(next.bonds.length).toBe(1);
    expect(next.bonds[0].stage).toBe('courting');
    for(let i=0;i<4;i++)growBonds(next,rand);
    expect(next.bonds[0].stage).toBe('partner');
    expect(next.agents[0].partnerId).toBe(next.agents[1].id);
    expect(next.agents[1].partnerId).toBe(next.agents[0].id);
    expect(next.lineage.length).toBe(before);
  });
  it('produces hybrid children through a valid bond with inherited records',()=>{
    const w=createWorld({seed:123,resourceLevel:1.8,
      starting:{human:0,elf:0,dwarf:0,demon:0},interbreeding:true});
    const index=w.tiles.findIndex((t,i)=>t.biome==='forest'&&i%w.width<w.width-3&&
      w.tiles[i+1].biome==='forest');
    const x=index%w.width,y=Math.floor(index/w.width);
    let world=editWorld(w,x,y,{kind:'spawn',species:'human'});
    world=editWorld(world,x+1,y,{kind:'spawn',species:'elf'});
    const [one,two]=world.agents;
    world={...world,
      agents:world.agents.map(a=>({...a,partnerId:a.id===one.id?two.id:one.id,
        age:a.species==='human'?23:55,health:100,energy:100})),
      bonds:[{id:1,a:one.id,b:two.id,since:0,stage:'partner',
        strength:1,children:[]}],nextBondId:2};
    const after=advanceWorld(world,20);
    const mixed=after.lineage.find(r=>r.generation===1&&
      hybridFraction(r.ancestry)>.01);
    expect(mixed).toBeDefined();
    expect(mixed?.parents).toEqual([one.id,two.id]);
    expect(mixed?.ancestry.human).toBe(.5);
    expect(mixed?.ancestry.elf).toBe(.5);
    expect(after.lineage.find(r=>r.id===one.id)?.children).toContain(mixed?.id);
    expect(after.lineage.find(r=>r.id===two.id)?.children).toContain(mixed?.id);
    expect(after.bonds[0].children).toContain(mixed?.id);
    expect(after.events.some(e=>e.type==='hybrid')).toBe(true);
    expect(isWorld(after)).toBe(true);
  });
  it('ends bonds when a partner dies and retains their lineage record',()=>{
    const world=createWorld();
    const a=world.agents[0],b=world.agents[1];
    const paired:World={...world,agents:world.agents.map(agent=>agent.id===a.id?
      {...agent,age:SPECIES_INFO.human.lifespan*2,partnerId:b.id}:
      agent.id===b.id?{...agent,partnerId:a.id}:agent),
      bonds:[{id:1,a:a.id,b:b.id,since:0,stage:'partner',
        strength:.9,children:[]}],nextBondId:2};
    const after=stepWorld(paired);
    expect(after.agents.find(x=>x.id===a.id)).toBeUndefined();
    expect(after.lineage.find(x=>x.id===a.id)?.died).toBe(1);
    expect(after.bonds[0].stage).toBe('ended');
    expect(after.agents.find(x=>x.id===b.id)?.partnerId).toBeUndefined();
  });
  it('supports much larger world options with tiny map markers and no overlap',()=>{
    for(const [size,width,height] of [
      ['small',96,64],['medium',160,104],
      ['large',256,160],['vast',320,208],
    ] as const){
      const world=createWorld({size,seed:342});
      expect([world.width,world.height]).toEqual([width,height]);
      expect(world.tiles.length).toBe(width*height);
      expect(world.agents.length).toBeGreaterThan(0);
      expect(isWorld(world)).toBe(true);
    }
  });
});
describe('portable worlds and v0.1 migration',()=>{
  it('round-trips packed tiles, genealogy, bonds and current world state',()=>{
    const world=advanceWorld(createWorld({seed:187,resourceLevel:1.6}),12);
    const raw=compactWorld(world),loaded=readSavedWorld(raw);
    expect(raw.length).toBeLessThan(JSON.stringify(world).length);
    expect(loaded).toEqual(world);
    expect(readSavedWorld(JSON.stringify(world))).toEqual(world);
    expect(isWorld(loaded)).toBe(true);
  });
  it('migrates old 44×30 worlds and preserves agents, seed, years and terrain',()=>{
    const modern=createWorld({size:'small',seed:72});
    const w=44,h=30,tiles=modern.tiles.slice(0,w*h);
    const old={
      ...modern,version:1,settings:{
        seed:modern.settings.seed,size:'small',starting:modern.settings.starting,
        resourceLevel:1,wandering:1,
      },width:w,height:h,
      tiles,agents:modern.agents.filter(a=>a.x<w&&a.y<h).map(a=>({
        id:a.id,species:a.species,x:a.x,y:a.y,age:a.age,energy:a.energy,
        health:a.health,born:a.born,parents:a.parents,
        genes:{vigor:a.genes.vigor,curiosity:a.genes.curiosity,
          fertility:a.genes.fertility},
      })),bonds:undefined,lineage:undefined,nextBondId:undefined,
    };
    // Recreate the historical sample totals after filtering.
    old.history=[{year:0,total:old.agents.length,
      ...{human:0,elf:0,dwarf:0,demon:0},
      births:0,deaths:0,settlements:0}];
    for(const a of old.agents)old.history[0][a.species]++;
    old.settlements=[];
    // v0.1 worlds placed no agents on water.
    old.tiles=old.tiles.map((t,i)=>old.agents.some(a=>a.x+a.y*w===i)?
      {...t,biome:'plains'}:t);
    const migrated=migrateLegacyWorld(JSON.parse(JSON.stringify(old)));
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(2);
    expect(migrated?.width).toBe(44);
    expect(migrated?.height).toBe(30);
    expect(migrated?.settings.interbreeding).toBe(true);
    expect(migrated?.lineage.length).toBe(old.agents.length);
    expect(migrated?.bonds).toHaveLength(0);
    expect(readSavedWorld(JSON.stringify(old))).not.toBeNull();
  });
  it('prioritizes v0.2 storage, falls back to v0.1, and refuses tampering',()=>{
    const modern=createWorld({seed:84});
    const legacy={...modern,version:1};
    const saved=compactWorld(modern);
    expect(loadBrowserWorld({getItem:key=>
      key===WORLD_STORAGE_KEY?saved:key===LEGACY_STORAGE_KEY?JSON.stringify(legacy):null}))
      .toEqual(modern);
    expect(readSavedWorld('bad')).toBeNull();
    expect(readSavedWorld(saved.replace('"evo-packed-v2"','"not-supported"')))
      .toBeNull();
    const invalid={...modern,agents:[modern.agents[0],modern.agents[0]]};
    expect(readSavedWorld(JSON.stringify(invalid))).toBeNull();
    expect(readSavedWorld(JSON.stringify({...modern,settings:{
      ...modern.settings,interbreeding:'yes'}}))).toBeNull();
    expect(readSavedWorld('x'.repeat(12000001))).toBeNull();
  });
});
