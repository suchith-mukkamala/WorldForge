import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorld,biomeSuitability,createWorld,isWorld,stepWorld,
  type Settlement,type World} from './engine';
import {traitProfile} from './family';
import {planMind} from './mind';
import {ARCHITECTURE,BUILDING_TYPES,COSTS,advanceConstruction,
  prepareInfrastructure,settlementStage,type Building} from './construction';
import {SettlementView} from './SettlementView';
import {WorldCanvas} from './WorldCanvas';
import {compactWorld,readSavedWorld} from './storage';

const placeAt=(w:World,x:number,y:number):Settlement=>({
  id:w.nextSettlementId++,species:'human',name:'Test Haven',x,y,founded:w.year,
  population:8,stores:23,emptyYears:0,
});
function activeCommunity(seed=44){
  const w=createWorld({seed,size:'small',resourceLevel:1.2});
  const center=w.agents.find(a=>a.species==='human'&&a.age>=16)!;
  const settlement=placeAt(w,center.x,center.y);
  w.settlements.push(settlement);
  prepareInfrastructure(w);
  return {w,settlement};
}

describe('Evolution Lab v0.7 — living settlements and construction',()=>{
  it('tracks nine building types, material costs and four distinct architectures',()=>{
    expect(BUILDING_TYPES).toHaveLength(9);
    expect(BUILDING_TYPES).toContain('market');
    expect(BUILDING_TYPES).toContain('dock');
    for(const t of BUILDING_TYPES){
      expect(COSTS[t].labor).toBeGreaterThan(0);
      expect(Object.values(COSTS[t].materials).reduce((a,b)=>a+b,0))
        .toBeGreaterThan(0);
    }
    expect(new Set(Object.values(ARCHITECTURE).map(a=>a.roof)).size).toBe(4);
  });

  it('establishes owned dry land without inventing history on legacy worlds',()=>{
    const w=createWorld({seed:801,size:'small'});
    const older:World={...w,ruins:undefined,trails:undefined,
      settlements:w.settlements.map(({infrastructure:_,...s})=>s)};
    expect(isWorld(older)).toBe(true);
    const {w:active}=activeCommunity(44);
    const s=active.settlements[0];
    expect(s.infrastructure!.land.length).toBeGreaterThan(10);
    expect(s.infrastructure!.land.every(i=>active.tiles[i].biome!=='water')).toBe(true);
    expect(s.infrastructure!.buildings).toEqual([]);
    expect(readSavedWorld(compactWorld(active))).toEqual(active);
    const advanced=stepWorld(older);
    expect(Array.isArray(advanced.trails)).toBe(true);
    expect(advanced.trails?.every(t=>t.wear===1.8)).toBe(true);
    expect(advanced.ruins).toEqual([]);
    expect(isWorld(advanced)).toBe(true);
  });

  it('lets real citizens propose and gradually build from gathered supplies and labor',()=>{
    const {w}=activeCommunity(104);
    let current=w;
    for(let y=0;y<45;y++)current=stepWorld(current);
    const s=current.settlements.find(v=>v.name==='Test Haven');
    expect(s).toBeDefined();
    expect(s!.infrastructure!.buildings.length).toBeGreaterThan(0);
    const buildings=s!.infrastructure!.buildings;
    expect(buildings.some(b=>b.spent.wood>0)).toBe(true);
    expect(buildings.some(b=>b.labor>0)).toBe(true);
    expect(buildings.some(b=>b.stage==='complete')).toBe(true);
    for(const b of buildings){
      expect(s!.infrastructure!.land).toContain(b.y*current.width+b.x);
      expect(b.progress).toBeGreaterThanOrEqual(0);
      expect(b.progress).toBeLessThanOrEqual(100);
      if(b.stage==='complete')expect(b.progress).toBe(100);
    }
    expect(isWorld(current)).toBe(true);
  },30000);

  it('does not produce construction labor or progress for an empty community',()=>{
    const w=createWorld({seed:77,size:'small'});
    const s=placeAt(w,1,1);s.emptyYears=0;w.settlements.push(s);
    prepareInfrastructure(w);
    const idx=s.infrastructure!.land[0];
    const b:Building={id:1,type:'house',x:idx%w.width,y:Math.floor(idx/w.width),
      culture:'human',stage:'foundation',progress:0,condition:100,
      started:0,spent:{wood:0,stone:0,clay:0},labor:0};
    s.infrastructure!.buildings.push(b);s.infrastructure!.nextBuildingId=2;
    advanceConstruction(w,[]);
    expect(b.progress).toBe(0);
    expect(b.labor).toBe(0);
    expect(isWorld(w)).toBe(true);
  });

  it('requires builders at the actual worksite before materials or labor move',()=>{
    const w=createWorld({seed:270,size:'small',starting:{human:1,elf:0,dwarf:0,demon:0}});
    const worker=w.agents[0];worker.age=21;worker.born=-21;
    worker.energy=100;worker.health=100;
    worker.development!.career='artisan';
    const s=placeAt(w,worker.x,worker.y);w.settlements.push(s);
    prepareInfrastructure(w);
    const i=s.infrastructure!;
    const location=i.land.find(index=>Math.max(
      Math.abs(index%w.width-worker.x),
      Math.abs(Math.floor(index/w.width)-worker.y))>=4)!;
    const house:Building={id:1,type:'house',x:location%w.width,
      y:Math.floor(location/w.width),culture:'human',stage:'foundation',
      progress:0,condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0};
    i.buildings.push(house);i.nextBuildingId=2;
    i.stock={wood:30,stone:30,clay:30};
    advanceConstruction(w,[]);
    expect(house.progress).toBe(0);
    expect(house.labor).toBe(0);
    worker.x=house.x;worker.y=house.y;
    advanceConstruction(w,[]);
    expect(house.spent.wood).toBeGreaterThan(0);
    expect(isWorld(w)).toBe(true);
  });

  it('lets a willing artisan actually choose to work on an active project',()=>{
    const {w,settlement:s}=activeCommunity(405);
    const worker=w.agents.find(a=>a.species==='human'&&a.age>=16&&
      Math.max(Math.abs(a.x-s.x),Math.abs(a.y-s.y))<=7)!;
    worker.energy=95;worker.health=95;
    worker.development!.career='artisan';
    const index=s.infrastructure!.land[0];
    s.infrastructure!.buildings.push({id:1,type:'workshop',x:index%w.width,
      y:Math.floor(index/w.width),culture:'human',stage:'foundation',
      progress:0,condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0});
    s.infrastructure!.nextBuildingId=2;
    const mind=planMind(w,worker,new Map(w.agents.map(a=>[
      a.y*w.width+a.x,a.id])),new Map(w.agents.map(a=>[a.id,a])),
    new Map(),biomeSuitability,traitProfile);
    expect(mind.goal).toBe('build');
    expect(mind.target).toEqual({x:index%w.width,y:Math.floor(index/w.width)});
  });

  it('assigns completed permanent residences to households',()=>{
    let {w}=activeCommunity(104);
    for(let year=0;year<75;year++)w=stepWorld(w);
    const housed=w.households?.filter(h=>h.residence)??[];
    expect(housed.length).toBeGreaterThan(0);
    for(const h of housed){
      const s=w.settlements.find(s=>s.id===h.residence?.settlementId)!;
      const b=s.infrastructure?.buildings.find(b=>b.id===h.residence?.buildingId)!;
      expect(b.stage).toBe('complete');
      expect(['house','shelter']).toContain(b.type);
      expect(h.home).toEqual({x:b.x,y:b.y});
    }
    expect(isWorld(w)).toBe(true);
  },30000);

  it('records roads only from real movement wear and lets unused routes fade',()=>{
    const {w,settlement}=activeCommunity(93);
    const id=settlement.infrastructure!.land[0];
    advanceConstruction(w,[]);
    expect(settlement.infrastructure?.roads).toHaveLength(0);
    advanceConstruction(w,Array(8).fill(id));
    expect(w.trails?.find(t=>t.index===id)?.wear).toBeGreaterThan(4);
    expect(settlement.infrastructure?.roads).toContain(id);
    for(let i=0;i<80;i++)advanceConstruction(w,[]);
    expect(settlement.infrastructure?.roads).not.toContain(id);
    expect(isWorld(w)).toBe(true);
  });

  it('preserves buildings as ruins after an uninhabited settlement collapses',()=>{
    const w=createWorld({seed:510,size:'small'});
    const s=placeAt(w,1,1);s.emptyYears=4;w.settlements.push(s);
    prepareInfrastructure(w);
    const idx=s.infrastructure!.land[0];
    s.infrastructure!.buildings.push({id:1,type:'house',x:idx%w.width,
      y:Math.floor(idx/w.width),culture:'human',stage:'complete',progress:100,
      condition:92,started:0,finished:0,
      spent:{...COSTS.house.materials},labor:COSTS.house.labor});
    s.infrastructure!.nextBuildingId=2;
    const collapsed=stepWorld(w);
    expect(collapsed.settlements.some(v=>v.id===s.id)).toBe(false);
    expect(collapsed.ruins?.find(r=>r.id===s.id)?.buildings).toHaveLength(1);
    expect(collapsed.ruins?.find(r=>r.id===s.id)?.buildings[0].stage).toBe('abandoned');
    expect(isWorld(collapsed)).toBe(true);
    const later=advanceWorld(collapsed,30);
    expect(later.ruins?.find(r=>r.id===s.id)?.buildings[0].stage).toBe('ruin');
    expect(readSavedWorld(compactWorld(later))).toEqual(later);
  },30000);

  it('stages settlements according to real buildings and inhabitants',()=>{
    const {settlement:s}=activeCommunity();
    expect(settlementStage(s)).toBe('encampment');
    const idx=s.infrastructure!.land[0];
    for(let i=0;i<26;i++)s.infrastructure!.buildings.push({id:i+1,
      type:'house',x:idx%96,y:Math.floor(idx/96),culture:'human',
      stage:'complete',progress:100,condition:100,started:0,finished:0,
      spent:{...COSTS.house.materials},labor:COSTS.house.labor});
    s.population=72;
    expect(settlementStage(s)).toBe('city');
    s.population=10;
    expect(settlementStage(s)).toBe('hamlet');
  });

  it('renders a local map and never lets zoom or viewing a city change the world',()=>{
    const {w}=activeCommunity(204);
    const before=JSON.stringify(w);
    const props={world:w,brush:{kind:'inspect' as const},
      overlay:'terrain' as const,selected:null,onSelect:()=>{},onEdit:()=>{}};
    const far=renderToStaticMarkup(createElement(WorldCanvas,{...props,zoom:1}));
    const near=renderToStaticMarkup(createElement(WorldCanvas,{...props,zoom:8}));
    expect(far).toContain('100%');expect(near).toContain('800%');
    const screen=renderToStaticMarkup(createElement(SettlementView,{world:w,
      selectedId:w.settlements[0].id,onFindOnMap:()=>{},playing:false,
      onTogglePlay:()=>{},onAdvance:()=>{}}));
    expect(screen).toContain('LOCAL VIEW');
    expect(screen).toContain('COLLECTED MATERIALS');
    expect(JSON.stringify(w)).toBe(before);
    const next=stepWorld(w),unseen=stepWorld(JSON.parse(before) as World);
    expect(next).toEqual(unseen);
    expect(isWorld(next)).toBe(true);
  });

  it('preserves the ability to save and replay a growing civilization',()=>{
    const first=advanceWorld(createWorld({seed:721,size:'small'}),35);
    const second=advanceWorld(createWorld({seed:721,size:'small'}),35);
    expect(first).toEqual(second);
    expect(isWorld(first)).toBe(true);
    expect(readSavedWorld(compactWorld(first))).toEqual(first);
  },30000);
});
