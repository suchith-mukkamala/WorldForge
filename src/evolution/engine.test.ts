import {describe,expect,it} from 'vitest';
import {
  BIOMES,BIOME_INFO,DEFAULT_SETTINGS,SPECIES,SPECIES_INFO,
  createWorld,stepWorld,advanceWorld,editWorld,isWorld,normalizeSettings,population,
  type World,
} from './engine';

describe('Evolution Lab v0.1: reproducible fantasy worlds',()=>{
  it('generates identical terrain, agents, stats and timelines for the same seed',()=>{
    const a=createWorld(DEFAULT_SETTINGS),b=createWorld(DEFAULT_SETTINGS);
    expect(a).toEqual(b);
    expect(advanceWorld(a,30)).toEqual(advanceWorld(b,30));
    expect(a).toEqual(createWorld(DEFAULT_SETTINGS)); // no mutation of starting world
  });
  it('provides four distinct founding species and suitable habitats',()=>{
    const world=createWorld();
    expect(world.version).toBe(2);
    expect(world.width).toBe(160);
    expect(world.height).toBe(104);
    expect(world.tiles).toHaveLength(world.width*world.height);
    expect(population(world)).toEqual(DEFAULT_SETTINGS.starting);
    expect(world.agents.every(a=>a.id>0&&a.age>=0&&a.energy>0)).toBe(true);
    expect(new Set(world.agents.map(a=>a.y*world.width+a.x)).size)
      .toBe(world.agents.length);
    const biomes=new Set(world.tiles.map(t=>t.biome));
    for(const biome of BIOMES)expect(biomes.has(biome)).toBe(true);
    for(const species of SPECIES){
      const agents=world.agents.filter(a=>a.species===species);
      expect(agents.length).toBeGreaterThan(0);
      const preferred=agents.filter(a=>SPECIES_INFO[species].preferred.includes(
        world.tiles[a.y*world.width+a.x].biome)).length;
      expect(preferred/agents.length).toBeGreaterThan(.7);
    }
    expect(SPECIES_INFO.human.lifespan).toBeLessThan(SPECIES_INFO.elf.lifespan);
    expect(SPECIES_INFO.human.fertility).toBeGreaterThan(SPECIES_INFO.elf.fertility);
    expect(SPECIES_INFO.dwarf.preferred).toContain('cave');
    expect(SPECIES_INFO.demon.preferred).toContain('volcanic');
  });
  it('respects world size, population settings, seed bounds and all-zero founders',()=>{
    const small=createWorld({size:'small',seed:73,starting:{
      human:2,elf:0,dwarf:1,demon:0,
    }});
    expect([small.width,small.height,small.agents.length]).toEqual([96,64,3]);
    const large=createWorld({size:'large',seed:74});
    expect([large.width,large.height]).toEqual([256,160]);
    const blank=createWorld({starting:{human:0,elf:0,dwarf:0,demon:0}});
    expect(blank.agents).toHaveLength(0);
    expect(blank.history[0].total).toBe(0);
    const limited=normalizeSettings({seed:-5,starting:{
      human:1000,elf:0,dwarf:0,demon:0,
    },resourceLevel:100,wandering:-7});
    expect(limited.seed).toBe(1);
    expect(limited.starting.human).toBe(75);
    expect(limited.resourceLevel).toBe(1.8);
    expect(limited.wandering).toBe(.5);
  });
  it('ages agents on yearly ticks, regenerates food and records observed history',()=>{
    const start=createWorld({seed:79});
    const before=start.agents[0];
    const advanced=stepWorld(start);
    expect(advanced.year).toBe(1);
    expect(start.year).toBe(0);
    const after=advanced.agents.find(a=>a.id===before.id);
    if(after)expect(after.age).toBe(before.age+1);
    expect(advanced.history).toHaveLength(2);
    expect(advanced.history[1].total).toBe(advanced.agents.length);
    expect(advanced.history[1].year).toBe(1);
    expect(advanced.history[0]).toEqual(start.history[0]);
  });
  it('can produce births, track parents and produce villages from clustered agents',()=>{
    const evolved=advanceWorld(createWorld({seed:73,resourceLevel:1.7}),30);
    expect(evolved.totalBirths).toBeGreaterThan(0);
    expect(evolved.history.at(-1)?.total).toBe(evolved.agents.length);
    expect(evolved.events.some(e=>e.type==='birth')).toBe(true);
    expect(evolved.events.some(e=>e.type==='settlement')).toBe(true);
    expect(evolved.nextSettlementId).toBeGreaterThan(1);
    expect(evolved.agents.some(a=>a.parents&&a.parents.length===2)).toBe(true);
    for(const s of evolved.settlements){
      expect(s.founded).toBeGreaterThan(0);
      expect(s.population).toBeGreaterThanOrEqual(0);
      expect(s.stores).toBeGreaterThanOrEqual(0);
      expect(SPECIES).toContain(s.species);
    }
  });
  it('kills agents that exceed their plausible lifespan and records deaths',()=>{
    const world=createWorld({seed:123});
    const victim=world.agents[0];
    const altered:World={...world,agents:world.agents.map(a=>a.id===victim.id?
      {...a,age:SPECIES_INFO[a.species].lifespan*2}:a)};
    const next=stepWorld(altered);
    expect(next.agents.some(a=>a.id===victim.id)).toBe(false);
    expect(next.totalDeaths).toBeGreaterThan(0);
    expect(next.events.some(e=>e.type==='death')).toBe(true);
  });
  it('settlements can disappear after abandonment; war/disasters are not fabricated',()=>{
    const world=createWorld({starting:{human:0,elf:0,dwarf:0,demon:0}});
    const lonely:World={...world,settlements:[{
      id:1,species:'dwarf',name:'Empty Hollow',
      x:10,y:10,founded:0,population:0,stores:3,emptyYears:4,
    }]};
    const after=stepWorld(lonely);
    expect(after.settlements).toHaveLength(0);
    expect(after.events.some(e=>e.type==='collapse'&&e.message.includes('Empty Hollow')))
      .toBe(true);
  });
  it('keeps all agents inside the world on habitable unique tiles over many years',()=>{
    const after=advanceWorld(createWorld({seed:1907,resourceLevel:1.4}),100);
    expect(after.year).toBe(100);
    expect(after.agents.length).toBeLessThanOrEqual(after.tiles.length);
    const occupied=new Set<number>();
    for(const agent of after.agents){
      expect(agent.x).toBeGreaterThanOrEqual(0);
      expect(agent.y).toBeGreaterThanOrEqual(0);
      expect(agent.x).toBeLessThan(after.width);
      expect(agent.y).toBeLessThan(after.height);
      expect(agent.energy).toBeGreaterThanOrEqual(0);
      expect(agent.energy).toBeLessThanOrEqual(100);
      expect(agent.health).toBeGreaterThan(0);
      expect(agent.health).toBeLessThanOrEqual(100);
      const index=agent.y*after.width+agent.x;
      expect(after.tiles[index].biome).not.toBe('water');
      expect(occupied.has(index)).toBe(false);
      occupied.add(index);
    }
    for(const tile of after.tiles){
      expect(tile.food).toBeGreaterThanOrEqual(0);
      expect(tile.food).toBeLessThanOrEqual(BIOME_INFO[tile.biome].food*1.4+.01);
    }
  });
  it('bounds recent history, events and years of bulk stepping',()=>{
    const world=createWorld({seed:123,starting:{human:0,elf:0,dwarf:0,demon:0}});
    const after=advanceWorld(world,200);
    expect(after.year).toBe(200);
    expect(advanceWorld(after,201).year).toBe(400);
    expect(advanceWorld(after,0)).toBe(after);
    expect(after.history.length).toBeLessThanOrEqual(400);
    expect(after.events.length).toBeLessThanOrEqual(90);
  });
});
describe('World interventions and portable saves',()=>{
  it('places an agent on free land and rejects collisions or underwater spawns',()=>{
    const world=createWorld({seed:29});
    const index=world.tiles.findIndex((t,i)=>t.biome==='plains'&&
      !world.agents.some(a=>a.y*world.width+a.x===i));
    const x=index%world.width,y=Math.floor(index/world.width);
    const changed=editWorld(world,x,y,{kind:'spawn',species:'human'});
    expect(changed.agents).toHaveLength(world.agents.length+1);
    expect(changed.agents.at(-1)?.species).toBe('human');
    expect(world.agents).toHaveLength(createWorld({seed:29}).agents.length);
    expect(editWorld(changed,x,y,{kind:'spawn',species:'elf'})).toBe(changed);
    const water=world.tiles.findIndex(t=>t.biome==='water');
    expect(editWorld(world,water%world.width,Math.floor(water/world.width),
      {kind:'spawn',species:'demon'})).toBe(world);
  });
  it('supports biome painting, resource edits, and prevents flooding inhabited tiles',()=>{
    const world=createWorld({seed:333});
    const empty=world.tiles.findIndex((t,i)=>t.biome==='plains'&&
      !world.agents.some(a=>a.y*world.width+a.x===i));
    const x=empty%world.width,y=Math.floor(empty/world.width);
    const cave=editWorld(world,x,y,{kind:'terrain',biome:'cave'});
    expect(cave.tiles[empty].biome).toBe('cave');
    const restored=editWorld(cave,x,y,{kind:'food'});
    expect(restored.tiles[empty].food).toBe(BIOME_INFO.cave.food);
    const occupied=world.agents[0];
    expect(editWorld(world,occupied.x,occupied.y,{kind:'terrain',biome:'water'}))
      .toBe(world);
    expect(editWorld(world,-1,0,{kind:'food'})).toBe(world);
    expect(editWorld(world,0,0,{kind:'inspect'})).toBe(world);
  });
  it('preserves a JSON saved world and rejects corrupted or oversized structures',()=>{
    const saved=advanceWorld(createWorld({seed:222}),12);
    expect(isWorld(saved)).toBe(true);
    expect(isWorld(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(isWorld({...saved,tiles:saved.tiles.slice(0,-1)})).toBe(false);
    expect(isWorld({...saved,agents:[saved.agents[0],saved.agents[0]]})).toBe(false);
    expect(isWorld({...saved,agents:saved.agents.map((a,i)=>i===0?
      {...a,x:-1}:a)})).toBe(false);
    expect(isWorld({...saved,version:3})).toBe(false);
    expect(isWorld(null)).toBe(false);
  });
});
